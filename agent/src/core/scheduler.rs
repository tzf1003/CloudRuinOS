use anyhow::Result;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{mpsc, RwLock};
use tokio::time::{interval, MissedTickBehavior};
use tracing::{debug, error, info, warn};

/// 任务调度器
#[derive(Debug)]
pub struct Scheduler {
    tasks: Arc<RwLock<HashMap<String, ScheduledTask>>>,
    command_tx: mpsc::UnboundedSender<SchedulerCommand>,
    command_rx: Option<mpsc::UnboundedReceiver<SchedulerCommand>>,
}

/// 调度任务
#[derive(Debug)]
pub struct ScheduledTask {
    pub id: String,
    pub task_type: TaskType,
    pub interval: Duration,
    pub next_run: Instant,
    pub enabled: bool,
}

/// 任务类型
#[derive(Debug, Clone)]
pub enum TaskType {
    Heartbeat,
    Reconnect,
    StateSync,
    Custom(String),
}

/// 调度器命令
#[derive(Debug)]
pub enum SchedulerCommand {
    AddTask {
        id: String,
        task_type: TaskType,
        interval: Duration,
    },
    RemoveTask {
        id: String,
    },
    EnableTask {
        id: String,
    },
    DisableTask {
        id: String,
    },
    TriggerTask {
        id: String,
    },
    Shutdown,
}

/// 任务执行结果
#[derive(Debug)]
pub struct TaskResult {
    pub task_id: String,
    pub task_type: TaskType,
    pub success: bool,
    pub error: Option<String>,
    pub execution_time: Duration,
}

impl Scheduler {
    /// 创建新的调度器
    pub fn new() -> Self {
        let (command_tx, command_rx) = mpsc::unbounded_channel();
        
        Self {
            tasks: Arc::new(RwLock::new(HashMap::new())),
            command_tx,
            command_rx: Some(command_rx),
        }
    }

    /// 获取命令发送器
    pub fn command_sender(&self) -> mpsc::UnboundedSender<SchedulerCommand> {
        self.command_tx.clone()
    }

    /// 添加任务
    pub async fn add_task(&self, id: String, task_type: TaskType, interval: Duration) -> Result<()> {
        let task = ScheduledTask {
            id: id.clone(),
            task_type,
            interval,
            next_run: Instant::now() + interval,
            enabled: true,
        };

        let mut tasks = self.tasks.write().await;
        tasks.insert(id.clone(), task);
        
        info!("Added scheduled task: {}", id);
        Ok(())
    }

    /// 移除任务
    pub async fn remove_task(&self, id: &str) -> Result<()> {
        let mut tasks = self.tasks.write().await;
        if tasks.remove(id).is_some() {
            info!("Removed scheduled task: {}", id);
        } else {
            warn!("Task not found for removal: {}", id);
        }
        Ok(())
    }

    /// 启用任务
    pub async fn enable_task(&self, id: &str) -> Result<()> {
        let mut tasks = self.tasks.write().await;
        if let Some(task) = tasks.get_mut(id) {
            task.enabled = true;
            info!("Enabled scheduled task: {}", id);
        } else {
            warn!("Task not found for enabling: {}", id);
        }
        Ok(())
    }

    /// 禁用任务
    pub async fn disable_task(&self, id: &str) -> Result<()> {
        let mut tasks = self.tasks.write().await;
        if let Some(task) = tasks.get_mut(id) {
            task.enabled = false;
            info!("Disabled scheduled task: {}", id);
        } else {
            warn!("Task not found for disabling: {}", id);
        }
        Ok(())
    }

    /// 运行调度器
    pub async fn run<F>(&mut self, mut task_executor: F) -> Result<()>
    where
        F: FnMut(TaskType) -> Result<()> + Send + 'static,
    {
        let mut command_rx = self.command_rx.take()
            .ok_or_else(|| anyhow::anyhow!("Scheduler already running"))?;

        let mut tick_interval = interval(Duration::from_millis(100));
        tick_interval.set_missed_tick_behavior(MissedTickBehavior::Skip);

        info!("Scheduler started");

        loop {
            tokio::select! {
                // 处理命令
                command = command_rx.recv() => {
                    match command {
                        Some(SchedulerCommand::AddTask { id, task_type, interval }) => {
                            if let Err(e) = self.add_task(id, task_type, interval).await {
                                error!("Failed to add task: {}", e);
                            }
                        }
                        Some(SchedulerCommand::RemoveTask { id }) => {
                            if let Err(e) = self.remove_task(&id).await {
                                error!("Failed to remove task: {}", e);
                            }
                        }
                        Some(SchedulerCommand::EnableTask { id }) => {
                            if let Err(e) = self.enable_task(&id).await {
                                error!("Failed to enable task: {}", e);
                            }
                        }
                        Some(SchedulerCommand::DisableTask { id }) => {
                            if let Err(e) = self.disable_task(&id).await {
                                error!("Failed to disable task: {}", e);
                            }
                        }
                        Some(SchedulerCommand::TriggerTask { id }) => {
                            self.trigger_task(&id, &mut task_executor).await;
                        }
                        Some(SchedulerCommand::Shutdown) => {
                            info!("Scheduler shutting down");
                            break;
                        }
                        None => {
                            warn!("Command channel closed");
                            break;
                        }
                    }
                }
                
                // 检查定时任务
                _ = tick_interval.tick() => {
                    self.check_and_execute_tasks(&mut task_executor).await;
                }
            }
        }

        Ok(())
    }

    /// 检查并执行到期的任务
    async fn check_and_execute_tasks<F>(&self, task_executor: &mut F)
    where
        F: FnMut(TaskType) -> Result<()>,
    {
        let now = Instant::now();
        let mut tasks_to_execute = Vec::new();

        // 收集需要执行的任务
        {
            let mut tasks = self.tasks.write().await;
            for (id, task) in tasks.iter_mut() {
                if task.enabled && now >= task.next_run {
                    tasks_to_execute.push((id.clone(), task.task_type.clone()));
                    task.next_run = now + task.interval;
                }
            }
        }

        // 执行任务
        for (task_id, task_type) in tasks_to_execute {
            let start_time = Instant::now();
            let result = task_executor(task_type.clone());
            let execution_time = start_time.elapsed();

            match result {
                Ok(_) => {
                    debug!("Task {} executed successfully in {:?}", task_id, execution_time);
                }
                Err(e) => {
                    error!("Task {} failed: {} (took {:?})", task_id, e, execution_time);
                }
            }
        }
    }

    /// 立即触发任务
    async fn trigger_task<F>(&self, task_id: &str, task_executor: &mut F)
    where
        F: FnMut(TaskType) -> Result<()>,
    {
        let task_type = {
            let tasks = self.tasks.read().await;
            tasks.get(task_id).map(|task| task.task_type.clone())
        };

        if let Some(task_type) = task_type {
            let start_time = Instant::now();
            let result = task_executor(task_type.clone());
            let execution_time = start_time.elapsed();

            match result {
                Ok(_) => {
                    info!("Triggered task {} executed successfully in {:?}", task_id, execution_time);
                }
                Err(e) => {
                    error!("Triggered task {} failed: {} (took {:?})", task_id, e, execution_time);
                }
            }
        } else {
            warn!("Task not found for triggering: {}", task_id);
        }
    }

    /// 获取任务状态
    pub async fn get_task_status(&self, task_id: &str) -> Option<ScheduledTask> {
        let tasks = self.tasks.read().await;
        tasks.get(task_id).cloned()
    }

    /// 获取所有任务
    pub async fn list_tasks(&self) -> Vec<ScheduledTask> {
        let tasks = self.tasks.read().await;
        tasks.values().cloned().collect()
    }
}

impl Clone for ScheduledTask {
    fn clone(&self) -> Self {
        Self {
            id: self.id.clone(),
            task_type: self.task_type.clone(),
            interval: self.interval,
            next_run: self.next_run,
            enabled: self.enabled,
        }
    }
}

impl Default for Scheduler {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use tokio::time::{sleep, timeout};

    #[tokio::test]
    async fn test_scheduler_basic_operations() {
        let scheduler = Scheduler::new();
        
        // 添加任务
        scheduler.add_task(
            "test_task".to_string(),
            TaskType::Heartbeat,
            Duration::from_millis(100)
        ).await.unwrap();

        // 检查任务存在
        let task = scheduler.get_task_status("test_task").await;
        assert!(task.is_some());
        assert_eq!(task.unwrap().id, "test_task");

        // 禁用任务
        scheduler.disable_task("test_task").await.unwrap();
        let task = scheduler.get_task_status("test_task").await;
        assert!(!task.unwrap().enabled);

        // 启用任务
        scheduler.enable_task("test_task").await.unwrap();
        let task = scheduler.get_task_status("test_task").await;
        assert!(task.unwrap().enabled);

        // 移除任务
        scheduler.remove_task("test_task").await.unwrap();
        let task = scheduler.get_task_status("test_task").await;
        assert!(task.is_none());
    }

    #[tokio::test]
    async fn test_scheduler_execution() {
        let mut scheduler = Scheduler::new();
        let execution_count = Arc::new(AtomicUsize::new(0));
        let execution_count_clone = execution_count.clone();

        // 添加快速执行的任务
        scheduler.add_task(
            "fast_task".to_string(),
            TaskType::Heartbeat,
            Duration::from_millis(50)
        ).await.unwrap();

        let task_executor = move |_task_type: TaskType| -> Result<()> {
            execution_count_clone.fetch_add(1, Ordering::SeqCst);
            Ok(())
        };

        // 运行调度器一段时间
        let scheduler_handle = tokio::spawn(async move {
            scheduler.run(task_executor).await
        });

        // 等待一段时间让任务执行
        sleep(Duration::from_millis(200)).await;

        // 发送关闭命令
        let sender = scheduler_handle.abort();
        
        // 检查任务是否被执行了多次
        let count = execution_count.load(Ordering::SeqCst);
        assert!(count > 0, "Task should have been executed at least once");
    }
}