/// 命令执行器
/// 
/// 负责：
/// 1. 执行命令并捕获输出
/// 2. 支持取消正在执行的命令
/// 3. 实时输出流式传输

use anyhow::{anyhow, Result};
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, RwLock};
use tokio::time::{timeout, Duration};
use tracing::{debug, error, info, warn};

use super::task_manager::TaskManager;
use super::protocol::TaskState;

/// 命令执行结果
#[derive(Debug, Clone)]
pub struct CommandResult {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub duration_ms: u64,
}

/// 命令执行器
pub struct CommandExecutor {
    task_manager: Arc<TaskManager>,
    /// 正在执行的进程
    running_processes: Arc<RwLock<std::collections::HashMap<String, Arc<RwLock<Option<Child>>>>>>,
}

impl CommandExecutor {
    pub fn new(task_manager: Arc<TaskManager>) -> Self {
        Self {
            task_manager,
            running_processes: Arc::new(RwLock::new(std::collections::HashMap::new())),
        }
    }

    /// 执行命令
    pub async fn execute_command(
        &self,
        task_id: String,
        command: String,
        args: Vec<String>,
    ) -> Result<CommandResult> {
        info!("Executing command for task {}: {} {:?}", task_id, command, args);

        let start_time = std::time::Instant::now();

        // 更新任务状态为 Running
        self.task_manager
            .update_task_state(&task_id, TaskState::Running)
            .await?;

        // 创建命令
        let mut cmd = Command::new(&command);
        cmd.args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(Stdio::null());

        // 在 Windows 上设置创建标志
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        // 启动进程
        let mut child = cmd.spawn().map_err(|e| {
            anyhow!("Failed to spawn command '{}': {}", command, e)
        })?;

        // 保存进程引用以便取消
        let child_arc = Arc::new(RwLock::new(Some(child)));
        {
            let mut processes = self.running_processes.write().await;
            processes.insert(task_id.clone(), child_arc.clone());
        }

        // 获取 stdout 和 stderr
        let stdout = child_arc.write().await.as_mut().unwrap().stdout.take().unwrap();
        let stderr = child_arc.write().await.as_mut().unwrap().stderr.take().unwrap();

        // 创建通道用于收集输出
        let (stdout_tx, mut stdout_rx) = mpsc::unbounded_channel::<String>();
        let (stderr_tx, mut stderr_rx) = mpsc::unbounded_channel::<String>();

        // 启动 stdout 读取任务
        let task_id_clone = task_id.clone();
        let task_manager_clone = self.task_manager.clone();
        let stdout_task = tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                let line_with_newline = format!("{}\n", line);
                
                // 发送到输出通道
                let _ = stdout_tx.send(line_with_newline.clone());

                // 追加到任务输出
                if let Err(e) = task_manager_clone
                    .append_task_output(&task_id_clone, &line_with_newline)
                    .await
                {
                    error!("Failed to append stdout: {}", e);
                }
            }
        });

        // 启动 stderr 读取任务
        let task_id_clone = task_id.clone();
        let task_manager_clone = self.task_manager.clone();
        let stderr_task = tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                let line_with_newline = format!("{}\n", line);
                
                // 发送到输出通道
                let _ = stderr_tx.send(line_with_newline.clone());

                // 追加到任务输出（stderr 也追加到输出）
                if let Err(e) = task_manager_clone
                    .append_task_output(&task_id_clone, &format!("[STDERR] {}", line_with_newline))
                    .await
                {
                    error!("Failed to append stderr: {}", e);
                }
            }
        });

        // 等待进程结束
        let wait_result = {
            let mut child_guard = child_arc.write().await;
            if let Some(ref mut child) = *child_guard {
                child.wait().await
            } else {
                // 进程已被取消
                return Err(anyhow!("Process was canceled"));
            }
        };

        // 等待输出读取完成
        let _ = tokio::join!(stdout_task, stderr_task);

        // 收集所有输出
        let mut stdout_output = String::new();
        let mut stderr_output = String::new();

        stdout_rx.close();
        stderr_rx.close();

        while let Some(line) = stdout_rx.recv().await {
            stdout_output.push_str(&line);
        }

        while let Some(line) = stderr_rx.recv().await {
            stderr_output.push_str(&line);
        }

        // 清理进程引用
        {
            let mut processes = self.running_processes.write().await;
            processes.remove(&task_id);
        }

        let duration_ms = start_time.elapsed().as_millis() as u64;

        match wait_result {
            Ok(status) => {
                let exit_code = status.code().unwrap_or(-1);
                
                info!(
                    "Command completed for task {} with exit code {} in {}ms",
                    task_id, exit_code, duration_ms
                );

                let result = CommandResult {
                    exit_code,
                    stdout: stdout_output,
                    stderr: stderr_output,
                    duration_ms,
                };

                // 更新任务状态
                if exit_code == 0 {
                    self.task_manager
                        .update_task_state(&task_id, TaskState::Succeeded)
                        .await?;
                } else {
                    self.task_manager
                        .set_task_error(
                            &task_id,
                            format!("Command exited with code {}", exit_code),
                        )
                        .await?;
                }

                Ok(result)
            }
            Err(e) => {
                error!("Command failed for task {}: {}", task_id, e);
                self.task_manager
                    .set_task_error(&task_id, format!("Command execution failed: {}", e))
                    .await?;
                Err(anyhow!("Command execution failed: {}", e))
            }
        }
    }

    /// 取消正在执行的命令
    pub async fn cancel_command(&self, task_id: &str) -> Result<()> {
        info!("Canceling command for task {}", task_id);

        let child_arc = {
            let processes = self.running_processes.read().await;
            processes.get(task_id).cloned()
        };

        if let Some(child_arc) = child_arc {
            let mut child_guard = child_arc.write().await;
            if let Some(mut child) = child_guard.take() {
                // 尝试优雅终止
                match child.kill().await {
                    Ok(_) => {
                        info!("Successfully killed process for task {}", task_id);
                        
                        // 等待进程清理
                        let _ = timeout(Duration::from_secs(5), child.wait()).await;
                    }
                    Err(e) => {
                        warn!("Failed to kill process for task {}: {}", task_id, e);
                    }
                }
            }

            // 清理进程引用
            let mut processes = self.running_processes.write().await;
            processes.remove(task_id);

            Ok(())
        } else {
            warn!("No running process found for task {}", task_id);
            Ok(())
        }
    }

    /// 检查命令是否正在运行
    pub async fn is_running(&self, task_id: &str) -> bool {
        let processes = self.running_processes.read().await;
        processes.contains_key(task_id)
    }

    /// 获取正在运行的任务数量
    pub async fn running_count(&self) -> usize {
        let processes = self.running_processes.read().await;
        processes.len()
    }

    /// 取消所有正在运行的命令
    pub async fn cancel_all(&self) -> Result<()> {
        let task_ids: Vec<String> = {
            let processes = self.running_processes.read().await;
            processes.keys().cloned().collect()
        };

        for task_id in task_ids {
            if let Err(e) = self.cancel_command(&task_id).await {
                error!("Failed to cancel task {}: {}", task_id, e);
            }
        }

        Ok(())
    }
}

/// 解析命令字符串为命令和参数
/// 
/// 支持简单的 shell 风格解析：
/// - "cmd arg1 arg2" -> ["cmd", "arg1", "arg2"]
/// - "cmd 'arg with spaces'" -> ["cmd", "arg with spaces"]
pub fn parse_command(cmd_str: &str) -> Result<(String, Vec<String>)> {
    let parts = shell_words::split(cmd_str)
        .map_err(|e| anyhow!("Failed to parse command: {}", e))?;

    if parts.is_empty() {
        return Err(anyhow!("Empty command"));
    }

    let command = parts[0].clone();
    let args = parts[1..].to_vec();

    Ok((command, args))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_command_simple() {
        let (cmd, args) = parse_command("echo hello world").unwrap();
        assert_eq!(cmd, "echo");
        assert_eq!(args, vec!["hello", "world"]);
    }

    #[test]
    fn test_parse_command_with_quotes() {
        let (cmd, args) = parse_command("echo 'hello world'").unwrap();
        assert_eq!(cmd, "echo");
        assert_eq!(args, vec!["hello world"]);
    }

    #[test]
    fn test_parse_command_empty() {
        let result = parse_command("");
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_command_executor_simple() {
        let task_manager = Arc::new(TaskManager::new());
        let executor = CommandExecutor::new(task_manager.clone());

        // 创建测试任务
        use crate::core::protocol::{TaskItem, TaskType, DesiredState};
        use serde_json::json;

        let task = TaskItem {
            task_id: "test-1".to_string(),
            revision: 1,
            task_type: TaskType::CmdExec,
            desired_state: DesiredState::Pending,
            payload: json!({}),
        };

        task_manager.receive_task(&task).await.unwrap();

        // 执行简单命令
        #[cfg(target_os = "windows")]
        let result = executor
            .execute_command("test-1".to_string(), "cmd".to_string(), vec!["/C".to_string(), "echo".to_string(), "hello".to_string()])
            .await
            .unwrap();

        #[cfg(not(target_os = "windows"))]
        let result = executor
            .execute_command("test-1".to_string(), "echo".to_string(), vec!["hello".to_string()])
            .await
            .unwrap();

        assert_eq!(result.exit_code, 0);
        assert!(result.stdout.contains("hello"));
    }
}
