use crate::core::audit::{AuditLogger, AuditResult};
use crate::core::files::{FileManager, FileManagerConfig};
use crate::core::protocol::{FileInfo, WSMessage};
use crate::platform::CommandExecutor;
use anyhow::Result;
use std::time::{Duration, Instant};
use tokio::time::timeout;

/// 命令执行器
pub struct CommandHandler {
    executor: Box<dyn CommandExecutor + Send + Sync>,
    file_manager: FileManager,
    default_timeout: Duration,
    audit_logger: Option<AuditLogger>,
    current_session_id: Option<String>,
}

/// 命令执行结果
#[derive(Debug, Clone)]
pub struct CommandResult {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub execution_time: Duration,
}

/// 命令执行错误
#[derive(Debug, thiserror::Error)]
pub enum CommandError {
    #[error("Command execution timeout after {timeout:?}")]
    Timeout { timeout: Duration },
    #[error("Command execution failed: {message}")]
    ExecutionFailed { message: String },
    #[error("Invalid command: {command}")]
    InvalidCommand { command: String },
    #[error("Permission denied for command: {command}")]
    PermissionDenied { command: String },
}

impl CommandHandler {
    pub fn new(executor: Box<dyn CommandExecutor + Send + Sync>) -> Self {
        let file_config = FileManagerConfig::default();
        Self {
            executor,
            file_manager: FileManager::new(file_config),
            default_timeout: Duration::from_secs(30),
            audit_logger: None,
            current_session_id: None,
        }
    }

    pub fn new_with_file_config(
        executor: Box<dyn CommandExecutor + Send + Sync>,
        file_config: FileManagerConfig,
    ) -> Self {
        Self {
            executor,
            file_manager: FileManager::new(file_config),
            default_timeout: Duration::from_secs(30),
            audit_logger: None,
            current_session_id: None,
        }
    }

    /// 设置审计日志记录器
    pub fn set_audit_logger(&mut self, audit_logger: AuditLogger) {
        self.audit_logger = Some(audit_logger);
    }

    /// 设置当前会话 ID
    pub fn set_session_id(&mut self, session_id: Option<String>) {
        self.current_session_id = session_id;
    }

    /// 处理 WebSocket 消息并返回响应
    pub async fn handle_message(&self, message: WSMessage) -> Result<Option<WSMessage>> {
        match message {
            WSMessage::Cmd { id, command, args } => {
                let result = self.execute_command(&command, &args, None).await;
                match result {
                    Ok(cmd_result) => {
                        // 记录成功的命令执行
                        if let Some(ref audit_logger) = self.audit_logger {
                            let _ = audit_logger.log_command_execution(
                                self.current_session_id.clone(),
                                &command,
                                &args,
                                cmd_result.exit_code,
                                cmd_result.execution_time,
                                cmd_result.stdout.len(),
                                cmd_result.stderr.len(),
                                AuditResult::Success,
                                None,
                            );
                        }

                        Ok(Some(WSMessage::CmdResult {
                            id,
                            exit_code: cmd_result.exit_code,
                            stdout: cmd_result.stdout,
                            stderr: cmd_result.stderr,
                        }))
                    }
                    Err(e) => {
                        // 记录失败的命令执行
                        if let Some(ref audit_logger) = self.audit_logger {
                            let audit_result = match e {
                                CommandError::Timeout { .. } => AuditResult::Timeout,
                                _ => AuditResult::Error,
                            };

                            let _ = audit_logger.log_command_execution(
                                self.current_session_id.clone(),
                                &command,
                                &args,
                                -1,
                                Duration::from_secs(0),
                                0,
                                e.to_string().len(),
                                audit_result,
                                Some(e.to_string()),
                            );
                        }

                        Ok(Some(WSMessage::CmdResult {
                            id,
                            exit_code: -1,
                            stdout: String::new(),
                            stderr: e.to_string(),
                        }))
                    }
                }
            }
            WSMessage::FsList { id, path } => {
                let result = self.list_files(&path).await;
                match result {
                    Ok(files) => {
                        // 记录成功的文件列表操作
                        if let Some(ref audit_logger) = self.audit_logger {
                            let _ = audit_logger.log_file_list(
                                self.current_session_id.clone(),
                                &path,
                                files.len(),
                                &id,
                                AuditResult::Success,
                                None,
                            );
                        }

                        Ok(Some(WSMessage::FsListResult { id, files }))
                    }
                    Err(e) => {
                        // 记录失败的文件列表操作
                        if let Some(ref audit_logger) = self.audit_logger {
                            let _ = audit_logger.log_file_list(
                                self.current_session_id.clone(),
                                &path,
                                0,
                                &id,
                                AuditResult::Error,
                                Some(e.to_string()),
                            );
                        }

                        Ok(Some(WSMessage::Error {
                            code: "FS_LIST_ERROR".to_string(),
                            message: e.to_string(),
                        }))
                    }
                }
            }
            WSMessage::FsGet { id, path } => {
                let result = self.read_file(&path).await;
                match result {
                    Ok((content, checksum)) => {
                        // 记录成功的文件下载操作
                        if let Some(ref audit_logger) = self.audit_logger {
                            let _ = audit_logger.log_file_download(
                                self.current_session_id.clone(),
                                &path,
                                content.len() as u64,
                                &checksum,
                                &id,
                                AuditResult::Success,
                                None,
                            );
                        }

                        Ok(Some(WSMessage::FsGetResult {
                            id,
                            content,
                            checksum,
                        }))
                    }
                    Err(e) => {
                        // 记录失败的文件下载操作
                        if let Some(ref audit_logger) = self.audit_logger {
                            let _ = audit_logger.log_file_download(
                                self.current_session_id.clone(),
                                &path,
                                0,
                                "",
                                &id,
                                AuditResult::Error,
                                Some(e.to_string()),
                            );
                        }

                        Ok(Some(WSMessage::Error {
                            code: "FS_GET_ERROR".to_string(),
                            message: e.to_string(),
                        }))
                    }
                }
            }
            WSMessage::FsPut {
                id,
                path,
                content,
                checksum,
            } => {
                let result = self.write_file(&path, &content, &checksum).await;
                match result {
                    Ok(_) => {
                        // 记录成功的文件上传操作
                        if let Some(ref audit_logger) = self.audit_logger {
                            let _ = audit_logger.log_file_upload(
                                self.current_session_id.clone(),
                                &path,
                                content.len() as u64,
                                &checksum,
                                &id,
                                AuditResult::Success,
                                None,
                            );
                        }

                        Ok(Some(WSMessage::FsPutResult {
                            id,
                            success: true,
                            error: None,
                        }))
                    }
                    Err(e) => {
                        // 记录失败的文件上传操作
                        if let Some(ref audit_logger) = self.audit_logger {
                            let _ = audit_logger.log_file_upload(
                                self.current_session_id.clone(),
                                &path,
                                content.len() as u64,
                                &checksum,
                                &id,
                                AuditResult::Error,
                                Some(e.to_string()),
                            );
                        }

                        Ok(Some(WSMessage::FsPutResult {
                            id,
                            success: false,
                            error: Some(e.to_string()),
                        }))
                    }
                }
            }
            _ => {
                // 其他消息类型不需要处理
                Ok(None)
            }
        }
    }

    /// 执行命令
    pub async fn execute_command(
        &self,
        command: &str,
        args: &[String],
        timeout_override: Option<Duration>,
    ) -> Result<CommandResult, CommandError> {
        let start_time = Instant::now();
        let timeout_duration = timeout_override.unwrap_or(self.default_timeout);

        // 验证命令安全性
        self.validate_command(command)?;

        // 使用平台特定的执行器
        let result = timeout(timeout_duration, self.executor.execute(command, args)).await;

        match result {
            Ok(Ok(output)) => Ok(CommandResult {
                exit_code: output.status.code().unwrap_or(-1),
                stdout: String::from_utf8_lossy(&output.stdout).to_string(),
                stderr: String::from_utf8_lossy(&output.stderr).to_string(),
                execution_time: start_time.elapsed(),
            }),
            Ok(Err(e)) => Err(CommandError::ExecutionFailed {
                message: e.to_string(),
            }),
            Err(_) => Err(CommandError::Timeout {
                timeout: timeout_duration,
            }),
        }
    }

    /// 验证命令安全性
    fn validate_command(&self, command: &str) -> Result<(), CommandError> {
        // 基本的命令安全检查
        let dangerous_commands = [
            "rm", "del", "format", "fdisk", "mkfs", "shutdown", "reboot", "halt", "poweroff",
            "passwd", "sudo", "su", "chmod", "chown",
        ];

        let command_name = command.split_whitespace().next().unwrap_or("");

        if dangerous_commands.contains(&command_name) {
            return Err(CommandError::PermissionDenied {
                command: command.to_string(),
            });
        }

        // 检查路径遍历攻击
        if command.contains("..") || command.contains("~") {
            return Err(CommandError::InvalidCommand {
                command: command.to_string(),
            });
        }

        Ok(())
    }

    /// 列出文件
    async fn list_files(&self, path: &str) -> Result<Vec<FileInfo>> {
        let files = self.file_manager.list_files(path).await?;
        // 转换 files::FileInfo 到 protocol::FileInfo
        let protocol_files = files
            .into_iter()
            .map(|f| FileInfo {
                path: f.path,
                size: f.size,
                is_dir: f.is_dir,
                modified: f.modified,
            })
            .collect();
        Ok(protocol_files)
    }

    /// 读取文件
    async fn read_file(&self, path: &str) -> Result<(String, String)> {
        let (content_bytes, checksum) = self.file_manager.read_file(path).await?;
        let content_str = String::from_utf8_lossy(&content_bytes).to_string();
        Ok((content_str, checksum))
    }

    /// 写入文件
    async fn write_file(&self, path: &str, content: &str, expected_checksum: &str) -> Result<()> {
        let content_bytes = content.as_bytes();
        self.file_manager
            .write_file(path, content_bytes, expected_checksum)
            .await
    }

    /// 设置默认超时时间
    pub fn set_default_timeout(&mut self, timeout: Duration) {
        self.default_timeout = timeout;
    }

    /// 获取默认超时时间
    pub fn default_timeout(&self) -> Duration {
        self.default_timeout
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::tests::MockCommandExecutor;
    use std::process::Output;

    #[cfg(windows)]
    use std::os::windows::process::ExitStatusExt;

    #[cfg(unix)]
    use std::os::unix::process::ExitStatusExt;

    #[tokio::test]
    async fn test_command_execution() {
        let mut mock_executor = MockCommandExecutor::new();
        mock_executor.expect_execute().returning(|_, _| {
            Ok(Output {
                status: std::process::ExitStatus::from_raw(0),
                stdout: b"Hello World".to_vec(),
                stderr: Vec::new(),
            })
        });

        let handler = CommandHandler::new(Box::new(mock_executor));
        let result = handler
            .execute_command("echo", &["Hello World".to_string()], None)
            .await;

        assert!(result.is_ok());
        let cmd_result = result.unwrap();
        assert_eq!(cmd_result.exit_code, 0);
        assert_eq!(cmd_result.stdout, "Hello World");
    }

    #[tokio::test]
    async fn test_dangerous_command_rejection() {
        let mock_executor = MockCommandExecutor::new();
        let handler = CommandHandler::new(Box::new(mock_executor));

        let result = handler
            .execute_command("rm", &["-rf".to_string(), "/".to_string()], None)
            .await;
        assert!(result.is_err());

        match result.unwrap_err() {
            CommandError::PermissionDenied { .. } => {}
            _ => panic!("Expected PermissionDenied error"),
        }
    }

    #[tokio::test]
    async fn test_command_timeout() {
        let mut mock_executor = MockCommandExecutor::new();
        mock_executor.expect_execute().returning(|_, _| {
            // 模拟长时间运行的命令
            std::thread::sleep(Duration::from_secs(2));
            Ok(Output {
                status: std::process::ExitStatus::from_raw(0),
                stdout: Vec::new(),
                stderr: Vec::new(),
            })
        });

        let handler = CommandHandler::new(Box::new(mock_executor));
        let result = handler
            .execute_command(
                "sleep",
                &["10".to_string()],
                Some(Duration::from_millis(100)),
            )
            .await;

        assert!(result.is_err());
        match result.unwrap_err() {
            CommandError::Timeout { .. } => {}
            _ => panic!("Expected Timeout error"),
        }
    }
}
