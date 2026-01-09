/// 任务管理器
/// 
/// 负责：
/// 1. 任务状态管理（task_id → state/revision）
/// 2. Revision 版本控制
/// 3. Output cursor 增量管理
/// 4. 生成待上报的 TaskReport

use anyhow::{anyhow, Result};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, info, warn};

use super::protocol::{TaskItem, TaskReport, TaskState, TaskType, DesiredState};

/// 任务执行上下文
#[derive(Debug, Clone)]
pub struct TaskContext {
    pub task_id: String,
    pub revision: u64,
    pub task_type: TaskType,
    pub payload: serde_json::Value,
    pub state: TaskState,
    pub progress: Option<u32>,
    pub output_buffer: String,
    pub output_cursor: u64,
    pub error: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
}

impl TaskContext {
    pub fn new(task: &TaskItem) -> Self {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        Self {
            task_id: task.task_id.clone(),
            revision: task.revision,
            task_type: task.task_type.clone(),
            payload: task.payload.clone(),
            state: TaskState::Received,
            progress: None,
            output_buffer: String::new(),
            output_cursor: 0,
            error: None,
            created_at: now,
            updated_at: now,
        }
    }

    /// 更新任务状态
    pub fn update_state(&mut self, state: TaskState) {
        self.state = state;
        self.updated_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
    }

    /// 更新进度
    pub fn update_progress(&mut self, progress: u32) {
        self.progress = Some(progress.min(100));
        self.updated_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
    }

    /// 追加输出
    pub fn append_output(&mut self, output: &str) {
        self.output_buffer.push_str(output);
        self.updated_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
    }

    /// 设置错误
    pub fn set_error(&mut self, error: String) {
        self.error = Some(error);
        self.state = TaskState::Failed;
        self.updated_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
    }

    /// 获取未发送的输出增量
    pub fn get_output_chunk(&self, last_cursor: u64) -> Option<String> {
        if last_cursor < self.output_buffer.len() as u64 {
            let chunk = self.output_buffer[last_cursor as usize..].to_string();
            if !chunk.is_empty() {
                return Some(chunk);
            }
        }
        None
    }

    /// 生成 TaskReport
    pub fn to_report(&self, last_sent_cursor: u64) -> TaskReport {
        let output_chunk = self.get_output_chunk(last_sent_cursor);
        let new_cursor = if output_chunk.is_some() {
            Some(self.output_buffer.len() as u64)
        } else {
            None
        };

        TaskReport {
            task_id: self.task_id.clone(),
            state: self.state,
            progress: self.progress,
            output_chunk,
            output_cursor: new_cursor,
            error: self.error.clone(),
        }
    }
}

/// 任务管理器
pub struct TaskManager {
    /// 任务上下文映射
    tasks: Arc<RwLock<HashMap<String, TaskContext>>>,
    /// 已发送的 output cursor
    sent_cursors: Arc<RwLock<HashMap<String, u64>>>,
    /// 待上报的任务 ID 列表
    pending_reports: Arc<RwLock<Vec<String>>>,
}

impl TaskManager {
    pub fn new() -> Self {
        Self {
            tasks: Arc::new(RwLock::new(HashMap::new())),
            sent_cursors: Arc::new(RwLock::new(HashMap::new())),
            pending_reports: Arc::new(RwLock::new(Vec::new())),
        }
    }

    /// 接收新任务或更新
    /// 返回 true 表示接受，false 表示拒绝（旧版本）
    pub async fn receive_task(&self, task: &TaskItem) -> Result<bool> {
        let mut tasks = self.tasks.write().await;

        // 检查 revision
        if let Some(existing) = tasks.get(&task.task_id) {
            if task.revision <= existing.revision {
                debug!(
                    "Ignoring task {} with old revision {} (current: {})",
                    task.task_id, task.revision, existing.revision
                );
                return Ok(false);
            }

            // 更新现有任务
            info!(
                "Updating task {} from revision {} to {}",
                task.task_id, existing.revision, task.revision
            );
        } else {
            info!("Received new task {}", task.task_id);
        }

        // 创建或更新任务上下文
        let context = TaskContext::new(task);
        tasks.insert(task.task_id.clone(), context);

        // 标记为待上报
        let mut pending = self.pending_reports.write().await;
        if !pending.contains(&task.task_id) {
            pending.push(task.task_id.clone());
        }

        Ok(true)
    }

    /// 处理取消指令
    pub async fn cancel_task(&self, task_id: &str, revision: u64) -> Result<()> {
        let mut tasks = self.tasks.write().await;

        if let Some(context) = tasks.get_mut(task_id) {
            // 检查 revision
            if revision <= context.revision {
                debug!(
                    "Ignoring cancel for task {} with old revision {} (current: {})",
                    task_id, revision, context.revision
                );
                return Ok(());
            }

            info!("Canceling task {} (revision {})", task_id, revision);
            context.revision = revision;
            context.update_state(TaskState::Canceled);
            context.append_output("Task canceled by server");

            // 标记为待上报
            let mut pending = self.pending_reports.write().await;
            if !pending.contains(&task_id.to_string()) {
                pending.push(task_id.to_string());
            }
        } else {
            warn!("Attempted to cancel unknown task {}", task_id);
        }

        Ok(())
    }

    /// 更新任务状态
    pub async fn update_task_state(&self, task_id: &str, state: TaskState) -> Result<()> {
        let mut tasks = self.tasks.write().await;

        if let Some(context) = tasks.get_mut(task_id) {
            context.update_state(state);

            // 标记为待上报
            let mut pending = self.pending_reports.write().await;
            if !pending.contains(&task_id.to_string()) {
                pending.push(task_id.to_string());
            }

            Ok(())
        } else {
            Err(anyhow!("Task {} not found", task_id))
        }
    }

    /// 更新任务进度
    pub async fn update_task_progress(&self, task_id: &str, progress: u32) -> Result<()> {
        let mut tasks = self.tasks.write().await;

        if let Some(context) = tasks.get_mut(task_id) {
            context.update_progress(progress);

            // 标记为待上报
            let mut pending = self.pending_reports.write().await;
            if !pending.contains(&task_id.to_string()) {
                pending.push(task_id.to_string());
            }

            Ok(())
        } else {
            Err(anyhow!("Task {} not found", task_id))
        }
    }

    /// 追加任务输出
    pub async fn append_task_output(&self, task_id: &str, output: &str) -> Result<()> {
        let mut tasks = self.tasks.write().await;

        if let Some(context) = tasks.get_mut(task_id) {
            context.append_output(output);

            // 标记为待上报
            let mut pending = self.pending_reports.write().await;
            if !pending.contains(&task_id.to_string()) {
                pending.push(task_id.to_string());
            }

            Ok(())
        } else {
            Err(anyhow!("Task {} not found", task_id))
        }
    }

    /// 设置任务错误
    pub async fn set_task_error(&self, task_id: &str, error: String) -> Result<()> {
        let mut tasks = self.tasks.write().await;

        if let Some(context) = tasks.get_mut(task_id) {
            context.set_error(error);

            // 标记为待上报
            let mut pending = self.pending_reports.write().await;
            if !pending.contains(&task_id.to_string()) {
                pending.push(task_id.to_string());
            }

            Ok(())
        } else {
            Err(anyhow!("Task {} not found", task_id))
        }
    }

    /// 生成待上报的 TaskReport 列表
    pub async fn generate_reports(&self) -> Vec<TaskReport> {
        let mut reports = Vec::new();
        let pending = self.pending_reports.read().await;
        let tasks = self.tasks.read().await;
        let sent_cursors = self.sent_cursors.read().await;

        for task_id in pending.iter() {
            if let Some(context) = tasks.get(task_id) {
                let last_cursor = sent_cursors.get(task_id).copied().unwrap_or(0);
                let report = context.to_report(last_cursor);
                reports.push(report);
            }
        }

        reports
    }

    /// 确认 reports 已发送（更新 sent_cursors）
    pub async fn confirm_reports_sent(&self, reports: &[TaskReport]) {
        let mut sent_cursors = self.sent_cursors.write().await;
        let mut pending = self.pending_reports.write().await;
        let tasks = self.tasks.read().await;

        for report in reports {
            // 更新已发送的 cursor
            if let Some(cursor) = report.output_cursor {
                sent_cursors.insert(report.task_id.clone(), cursor);
            }

            // 如果任务已完成，从待上报列表移除
            if matches!(
                report.state,
                TaskState::Succeeded | TaskState::Failed | TaskState::Canceled
            ) {
                pending.retain(|id| id != &report.task_id);

                // 可选：清理已完成的任务（保留一段时间用于调试）
                // 这里我们保留任务上下文，由外部决定何时清理
            } else {
                // 未完成的任务保留在待上报列表中，下次继续上报
            }
        }
    }

    /// 获取任务上下文（只读）
    pub async fn get_task(&self, task_id: &str) -> Option<TaskContext> {
        let tasks = self.tasks.read().await;
        tasks.get(task_id).cloned()
    }

    /// 获取所有任务 ID
    pub async fn get_all_task_ids(&self) -> Vec<String> {
        let tasks = self.tasks.read().await;
        tasks.keys().cloned().collect()
    }

    /// 清理已完成的任务（超过指定时间）
    pub async fn cleanup_completed_tasks(&self, max_age_secs: u64) -> usize {
        let mut tasks = self.tasks.write().await;
        let mut sent_cursors = self.sent_cursors.write().await;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let mut removed = 0;
        let task_ids: Vec<String> = tasks.keys().cloned().collect();

        for task_id in task_ids {
            if let Some(context) = tasks.get(&task_id) {
                let is_completed = matches!(
                    context.state,
                    TaskState::Succeeded | TaskState::Failed | TaskState::Canceled
                );

                let is_old = now.saturating_sub(context.updated_at) > max_age_secs;

                if is_completed && is_old {
                    tasks.remove(&task_id);
                    sent_cursors.remove(&task_id);
                    removed += 1;
                    debug!("Cleaned up completed task {}", task_id);
                }
            }
        }

        if removed > 0 {
            info!("Cleaned up {} completed tasks", removed);
        }

        removed
    }

    /// 获取任务统计信息
    pub async fn get_stats(&self) -> TaskStats {
        let tasks = self.tasks.read().await;
        let pending = self.pending_reports.read().await;

        let mut stats = TaskStats::default();
        stats.total = tasks.len();
        stats.pending_reports = pending.len();

        for context in tasks.values() {
            match context.state {
                TaskState::Received => stats.received += 1,
                TaskState::Running => stats.running += 1,
                TaskState::Succeeded => stats.succeeded += 1,
                TaskState::Failed => stats.failed += 1,
                TaskState::Canceled => stats.canceled += 1,
            }
        }

        stats
    }
}

impl Default for TaskManager {
    fn default() -> Self {
        Self::new()
    }
}

/// 任务统计信息
#[derive(Debug, Default, Clone)]
pub struct TaskStats {
    pub total: usize,
    pub received: usize,
    pub running: usize,
    pub succeeded: usize,
    pub failed: usize,
    pub canceled: usize,
    pub pending_reports: usize,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn test_task_manager_receive_new_task() {
        let manager = TaskManager::new();

        let task = TaskItem {
            task_id: "task-1".to_string(),
            revision: 1,
            task_type: TaskType::ConfigUpdate,
            desired_state: DesiredState::Pending,
            payload: json!({}),
        };

        let accepted = manager.receive_task(&task).await.unwrap();
        assert!(accepted);

        let context = manager.get_task("task-1").await.unwrap();
        assert_eq!(context.task_id, "task-1");
        assert_eq!(context.revision, 1);
        assert_eq!(context.state, TaskState::Received);
    }

    #[tokio::test]
    async fn test_task_manager_reject_old_revision() {
        let manager = TaskManager::new();

        let task_v2 = TaskItem {
            task_id: "task-1".to_string(),
            revision: 2,
            task_type: TaskType::ConfigUpdate,
            desired_state: DesiredState::Pending,
            payload: json!({}),
        };

        let task_v1 = TaskItem {
            task_id: "task-1".to_string(),
            revision: 1,
            task_type: TaskType::ConfigUpdate,
            desired_state: DesiredState::Pending,
            payload: json!({}),
        };

        // 先接受 v2
        assert!(manager.receive_task(&task_v2).await.unwrap());

        // 拒绝 v1
        assert!(!manager.receive_task(&task_v1).await.unwrap());

        let context = manager.get_task("task-1").await.unwrap();
        assert_eq!(context.revision, 2);
    }

    #[tokio::test]
    async fn test_task_manager_update_state() {
        let manager = TaskManager::new();

        let task = TaskItem {
            task_id: "task-1".to_string(),
            revision: 1,
            task_type: TaskType::ConfigUpdate,
            desired_state: DesiredState::Pending,
            payload: json!({}),
        };

        manager.receive_task(&task).await.unwrap();
        manager
            .update_task_state("task-1", TaskState::Running)
            .await
            .unwrap();

        let context = manager.get_task("task-1").await.unwrap();
        assert_eq!(context.state, TaskState::Running);
    }

    #[tokio::test]
    async fn test_task_manager_output_incremental() {
        let manager = TaskManager::new();

        let task = TaskItem {
            task_id: "task-1".to_string(),
            revision: 1,
            task_type: TaskType::CmdExec,
            desired_state: DesiredState::Pending,
            payload: json!({}),
        };

        manager.receive_task(&task).await.unwrap();
        manager.append_task_output("task-1", "Line 1\n").await.unwrap();
        manager.append_task_output("task-1", "Line 2\n").await.unwrap();

        let reports = manager.generate_reports().await;
        assert_eq!(reports.len(), 1);
        assert_eq!(reports[0].output_chunk, Some("Line 1\nLine 2\n".to_string()));
        assert_eq!(reports[0].output_cursor, Some(14));

        // 确认发送
        manager.confirm_reports_sent(&reports).await;

        // 追加更多输出
        manager.append_task_output("task-1", "Line 3\n").await.unwrap();

        let reports2 = manager.generate_reports().await;
        assert_eq!(reports2.len(), 1);
        assert_eq!(reports2[0].output_chunk, Some("Line 3\n".to_string()));
        assert_eq!(reports2[0].output_cursor, Some(21));
    }

    #[tokio::test]
    async fn test_task_manager_cancel() {
        let manager = TaskManager::new();

        let task = TaskItem {
            task_id: "task-1".to_string(),
            revision: 1,
            task_type: TaskType::CmdExec,
            desired_state: DesiredState::Pending,
            payload: json!({}),
        };

        manager.receive_task(&task).await.unwrap();
        manager.cancel_task("task-1", 2).await.unwrap();

        let context = manager.get_task("task-1").await.unwrap();
        assert_eq!(context.state, TaskState::Canceled);
        assert_eq!(context.revision, 2);
    }

    #[tokio::test]
    async fn test_task_manager_stats() {
        let manager = TaskManager::new();

        let task1 = TaskItem {
            task_id: "task-1".to_string(),
            revision: 1,
            task_type: TaskType::ConfigUpdate,
            desired_state: DesiredState::Pending,
            payload: json!({}),
        };

        let task2 = TaskItem {
            task_id: "task-2".to_string(),
            revision: 1,
            task_type: TaskType::CmdExec,
            desired_state: DesiredState::Pending,
            payload: json!({}),
        };

        manager.receive_task(&task1).await.unwrap();
        manager.receive_task(&task2).await.unwrap();
        manager.update_task_state("task-1", TaskState::Running).await.unwrap();

        let stats = manager.get_stats().await;
        assert_eq!(stats.total, 2);
        assert_eq!(stats.received, 1);
        assert_eq!(stats.running, 1);
    }
}
