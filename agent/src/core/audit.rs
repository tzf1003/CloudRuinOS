use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::{mpsc, Mutex};

/// 审计事件类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AuditEventType {
    CommandExecute,
    FileList,
    FileDownload,
    FileUpload,
    FileDelete,
    SessionConnect,
    SessionDisconnect,
    DeviceRegister,
    SecurityViolation,
    AuthenticationFailure,
}

/// 审计事件数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEvent {
    pub event_type: AuditEventType,
    pub timestamp: u64,
    pub device_id: String,
    pub session_id: Option<String>,
    pub data: AuditEventData,
    pub result: AuditResult,
    pub error_message: Option<String>,
}

/// 审计事件具体数据
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum AuditEventData {
    CommandExecute {
        command: String,
        args: Vec<String>,
        exit_code: i32,
        execution_time_ms: u64,
        stdout_length: usize,
        stderr_length: usize,
        is_sensitive: bool,
    },
    FileList {
        path: String,
        file_count: usize,
        operation_id: String,
    },
    FileDownload {
        path: String,
        file_size: u64,
        checksum: String,
        operation_id: String,
    },
    FileUpload {
        path: String,
        file_size: u64,
        checksum: String,
        operation_id: String,
    },
    FileDelete {
        path: String,
        operation_id: String,
    },
    SessionConnect {
        session_id: String,
        connection_time: u64,
    },
    SessionDisconnect {
        session_id: String,
        disconnect_reason: String,
        duration_ms: u64,
    },
    SecurityViolation {
        violation_type: String,
        details: String,
        threat_level: ThreatLevel,
    },
    AuthenticationFailure {
        failure_reason: String,
        attempt_count: u32,
    },
    DeviceRegister {
        device_id: String,
        enrollment_token_prefix: String,
        platform: String,
        version: String,
    },
}

/// 审计结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AuditResult {
    Success,
    Error,
    Timeout,
}

/// 威胁级别
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ThreatLevel {
    Low,
    Medium,
    High,
    Critical,
}

/// 审计日志记录器
#[derive(Clone)]
pub struct AuditLogger {
    device_id: String,
    sender: mpsc::UnboundedSender<AuditEvent>,
}

impl AuditLogger {
    pub fn new(device_id: String) -> (Self, mpsc::UnboundedReceiver<AuditEvent>) {
        let (sender, receiver) = mpsc::unbounded_channel();

        (Self { device_id, sender }, receiver)
    }

    /// 记录命令执行事件
    pub fn log_command_execution(
        &self,
        session_id: Option<String>,
        command: &str,
        args: &[String],
        exit_code: i32,
        execution_time: Duration,
        stdout_length: usize,
        stderr_length: usize,
        result: AuditResult,
        error_message: Option<String>,
    ) -> Result<()> {
        let is_sensitive = self.is_sensitive_command(command);

        let event = AuditEvent {
            event_type: AuditEventType::CommandExecute,
            timestamp: self.current_timestamp(),
            device_id: self.device_id.clone(),
            session_id,
            data: AuditEventData::CommandExecute {
                command: if is_sensitive {
                    "[REDACTED]".to_string()
                } else {
                    command.to_string()
                },
                args: if is_sensitive {
                    vec!["[REDACTED]".to_string()]
                } else {
                    args.to_vec()
                },
                exit_code,
                execution_time_ms: execution_time.as_millis() as u64,
                stdout_length,
                stderr_length,
                is_sensitive,
            },
            result,
            error_message,
        };

        self.send_event(event)
    }

    /// 记录文件列表事件
    pub fn log_file_list(
        &self,
        session_id: Option<String>,
        path: &str,
        file_count: usize,
        operation_id: &str,
        result: AuditResult,
        error_message: Option<String>,
    ) -> Result<()> {
        let event = AuditEvent {
            event_type: AuditEventType::FileList,
            timestamp: self.current_timestamp(),
            device_id: self.device_id.clone(),
            session_id,
            data: AuditEventData::FileList {
                path: path.to_string(),
                file_count,
                operation_id: operation_id.to_string(),
            },
            result,
            error_message,
        };

        self.send_event(event)
    }

    /// 记录文件下载事件
    pub fn log_file_download(
        &self,
        session_id: Option<String>,
        path: &str,
        file_size: u64,
        checksum: &str,
        operation_id: &str,
        result: AuditResult,
        error_message: Option<String>,
    ) -> Result<()> {
        let event = AuditEvent {
            event_type: AuditEventType::FileDownload,
            timestamp: self.current_timestamp(),
            device_id: self.device_id.clone(),
            session_id,
            data: AuditEventData::FileDownload {
                path: path.to_string(),
                file_size,
                checksum: checksum.to_string(),
                operation_id: operation_id.to_string(),
            },
            result,
            error_message,
        };

        self.send_event(event)
    }

    /// 记录文件上传事件
    pub fn log_file_upload(
        &self,
        session_id: Option<String>,
        path: &str,
        file_size: u64,
        checksum: &str,
        operation_id: &str,
        result: AuditResult,
        error_message: Option<String>,
    ) -> Result<()> {
        let event = AuditEvent {
            event_type: AuditEventType::FileUpload,
            timestamp: self.current_timestamp(),
            device_id: self.device_id.clone(),
            session_id,
            data: AuditEventData::FileUpload {
                path: path.to_string(),
                file_size,
                checksum: checksum.to_string(),
                operation_id: operation_id.to_string(),
            },
            result,
            error_message,
        };

        self.send_event(event)
    }

    /// 记录会话连接事件
    pub fn log_session_connect(
        &self,
        session_id: &str,
        connection_time: u64,
        result: AuditResult,
        error_message: Option<String>,
    ) -> Result<()> {
        let event = AuditEvent {
            event_type: AuditEventType::SessionConnect,
            timestamp: self.current_timestamp(),
            device_id: self.device_id.clone(),
            session_id: Some(session_id.to_string()),
            data: AuditEventData::SessionConnect {
                session_id: session_id.to_string(),
                connection_time,
            },
            result,
            error_message,
        };

        self.send_event(event)
    }

    /// 记录会话断开事件
    pub fn log_session_disconnect(
        &self,
        session_id: &str,
        disconnect_reason: &str,
        duration: Duration,
        result: AuditResult,
        error_message: Option<String>,
    ) -> Result<()> {
        let event = AuditEvent {
            event_type: AuditEventType::SessionDisconnect,
            timestamp: self.current_timestamp(),
            device_id: self.device_id.clone(),
            session_id: Some(session_id.to_string()),
            data: AuditEventData::SessionDisconnect {
                session_id: session_id.to_string(),
                disconnect_reason: disconnect_reason.to_string(),
                duration_ms: duration.as_millis() as u64,
            },
            result,
            error_message,
        };

        self.send_event(event)
    }

    /// 记录安全违规事件
    pub fn log_security_violation(
        &self,
        session_id: Option<String>,
        violation_type: &str,
        details: &str,
        threat_level: ThreatLevel,
    ) -> Result<()> {
        let event = AuditEvent {
            event_type: AuditEventType::SecurityViolation,
            timestamp: self.current_timestamp(),
            device_id: self.device_id.clone(),
            session_id,
            data: AuditEventData::SecurityViolation {
                violation_type: violation_type.to_string(),
                details: details.to_string(),
                threat_level,
            },
            result: AuditResult::Error,
            error_message: Some(format!("Security violation: {}", violation_type)),
        };

        self.send_event(event)
    }

    /// 记录认证失败事件
    pub fn log_authentication_failure(
        &self,
        failure_reason: &str,
        attempt_count: u32,
    ) -> Result<()> {
        let event = AuditEvent {
            event_type: AuditEventType::AuthenticationFailure,
            timestamp: self.current_timestamp(),
            device_id: self.device_id.clone(),
            session_id: None,
            data: AuditEventData::AuthenticationFailure {
                failure_reason: failure_reason.to_string(),
                attempt_count,
            },
            result: AuditResult::Error,
            error_message: Some(format!("Authentication failed: {}", failure_reason)),
        };

        self.send_event(event)
    }

    /// 发送审计事件
    fn send_event(&self, event: AuditEvent) -> Result<()> {
        self.sender
            .send(event)
            .map_err(|e| anyhow::anyhow!("Failed to send audit event: {}", e))?;
        Ok(())
    }

    /// 获取当前时间戳
    fn current_timestamp(&self) -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
    }

    /// 检查是否为敏感命令
    fn is_sensitive_command(&self, command: &str) -> bool {
        let sensitive_commands = [
            "passwd", "password", "sudo", "su", "ssh", "scp", "wget", "curl", "nc", "netcat",
            "telnet", "rm", "del", "format", "fdisk", "mkfs", "shutdown", "reboot", "halt",
            "poweroff", "chmod", "chown", "chgrp",
        ];

        let command_name = command.to_lowercase();
        let command_parts: Vec<&str> = command_name.split_whitespace().collect();

        if let Some(first_part) = command_parts.first() {
            return sensitive_commands.iter().any(|&sensitive| {
                first_part.contains(sensitive) || sensitive.contains(first_part)
            });
        }

        false
    }

    /// 记录设备注册事件
    pub fn log_device_registration(
        &self,
        device_id: String,
        enrollment_token: String,
        platform: String,
        version: String,
        result: AuditResult,
        error_message: Option<String>,
    ) -> Result<()> {
        let event = AuditEvent {
            event_type: AuditEventType::DeviceRegister,
            timestamp: self.current_timestamp(),
            device_id: self.device_id.clone(),
            session_id: None,
            data: AuditEventData::DeviceRegister {
                device_id,
                enrollment_token_prefix: enrollment_token[..8.min(enrollment_token.len())]
                    .to_string(),
                platform,
                version,
            },
            result,
            error_message,
        };

        self.send_event(event)
    }
}

// ============= 审计日志传输配置 =============

/// 审计日志传输配置
#[derive(Debug, Clone)]
pub struct AuditTransportConfig {
    /// 服务端审计日志 API 地址
    pub server_url: String,
    /// 批量上传阈值（事件数量）
    pub batch_size: usize,
    /// 批量上传间隔（秒）
    pub batch_interval_secs: u64,
    /// 最大重试次数
    pub max_retries: u32,
    /// 重试间隔（秒）
    pub retry_interval_secs: u64,
    /// 本地缓存最大事件数
    pub max_cached_events: usize,
    /// 是否启用本地持久化
    pub enable_local_persistence: bool,
    /// 本地持久化路径
    pub local_persistence_path: Option<String>,
}

impl Default for AuditTransportConfig {
    fn default() -> Self {
        Self {
            server_url: String::new(),
            batch_size: 50,
            batch_interval_secs: 30,
            max_retries: 3,
            retry_interval_secs: 5,
            max_cached_events: 1000,
            enable_local_persistence: true,
            local_persistence_path: None,
        }
    }
}

/// 审计日志批量上传请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditBatchRequest {
    pub device_id: String,
    pub timestamp: u64,
    pub nonce: String,
    pub signature: String,
    pub events: Vec<AuditEvent>,
}

/// 审计日志批量上传响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditBatchResponse {
    pub status: String,
    pub accepted_count: usize,
    pub rejected_count: usize,
    pub errors: Vec<String>,
}

/// 审计事件处理器 - 支持批量上传到服务端
pub struct AuditEventHandler {
    receiver: mpsc::UnboundedReceiver<AuditEvent>,
    config: AuditTransportConfig,
    device_id: String,
    event_buffer: Arc<Mutex<VecDeque<AuditEvent>>>,
    http_client: Option<reqwest::Client>,
    crypto_manager: Option<Arc<crate::core::crypto::CryptoManager>>,
}

impl AuditEventHandler {
    pub fn new(receiver: mpsc::UnboundedReceiver<AuditEvent>) -> Self {
        Self {
            receiver,
            config: AuditTransportConfig::default(),
            device_id: String::new(),
            event_buffer: Arc::new(Mutex::new(VecDeque::new())),
            http_client: None,
            crypto_manager: None,
        }
    }

    /// 创建带完整配置的处理器
    pub fn with_config(
        receiver: mpsc::UnboundedReceiver<AuditEvent>,
        config: AuditTransportConfig,
        device_id: String,
        crypto_manager: Option<Arc<crate::core::crypto::CryptoManager>>,
    ) -> Self {
        let http_client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .ok();

        Self {
            receiver,
            config,
            device_id,
            event_buffer: Arc::new(Mutex::new(VecDeque::new())),
            http_client,
            crypto_manager,
        }
    }

    /// 启动审计事件处理循环
    pub async fn run(&mut self) {
        let batch_interval = Duration::from_secs(self.config.batch_interval_secs);
        let mut last_batch_time = std::time::Instant::now();

        loop {
            tokio::select! {
                // 接收新事件
                event = self.receiver.recv() => {
                    match event {
                        Some(event) => {
                            if let Err(e) = self.handle_event(event).await {
                                eprintln!("Failed to handle audit event: {}", e);
                            }
                        }
                        None => {
                            // 通道关闭，刷新剩余事件后退出
                            self.flush_buffer().await;
                            break;
                        }
                    }
                }
                // 定时批量上传
                _ = tokio::time::sleep(batch_interval) => {
                    if last_batch_time.elapsed() >= batch_interval {
                        self.flush_buffer().await;
                        last_batch_time = std::time::Instant::now();
                    }
                }
            }

            // 检查是否达到批量上传阈值
            let buffer_len = self.event_buffer.lock().await.len();
            if buffer_len >= self.config.batch_size {
                self.flush_buffer().await;
                last_batch_time = std::time::Instant::now();
            }
        }
    }

    /// 处理单个审计事件
    async fn handle_event(&self, event: AuditEvent) -> Result<()> {
        // 打印到控制台（调试用）
        tracing::debug!("AUDIT: {:?}", event);

        // 添加到缓冲区
        let mut buffer = self.event_buffer.lock().await;
        buffer.push_back(event);

        // 如果超过最大缓存数，移除最旧的事件
        while buffer.len() > self.config.max_cached_events {
            if let Some(dropped) = buffer.pop_front() {
                tracing::warn!(
                    "Audit buffer full, dropping oldest event: {:?}",
                    dropped.event_type
                );
            }
        }

        Ok(())
    }

    /// 刷新缓冲区，批量上传到服务端
    async fn flush_buffer(&self) {
        let events: Vec<AuditEvent> = {
            let mut buffer = self.event_buffer.lock().await;
            buffer.drain(..).collect()
        };

        if events.is_empty() {
            return;
        }

        tracing::info!("Flushing {} audit events to server", events.len());

        // 尝试上传到服务端
        if let Err(e) = self.upload_events(&events).await {
            tracing::error!("Failed to upload audit events: {}", e);

            // 上传失败，尝试本地持久化
            if self.config.enable_local_persistence {
                if let Err(e) = self.persist_events_locally(&events).await {
                    tracing::error!("Failed to persist audit events locally: {}", e);
                }
            }

            // 将事件放回缓冲区
            let mut buffer = self.event_buffer.lock().await;
            for event in events.into_iter().rev() {
                buffer.push_front(event);
            }
        }
    }

    /// 上传事件到服务端
    async fn upload_events(&self, events: &[AuditEvent]) -> Result<()> {
        let client = self
            .http_client
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("HTTP client not initialized"))?;

        if self.config.server_url.is_empty() {
            return Err(anyhow::anyhow!("Server URL not configured"));
        }

        // 生成签名
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        let nonce = format!("{:016x}", rand::random::<u64>());

        let signature = if let Some(crypto) = &self.crypto_manager {
            // 构建签名数据
            let sign_data = format!(
                "{}:{}:{}:{}",
                self.device_id,
                timestamp,
                nonce,
                events.len()
            );
            let sig_bytes = crypto.sign(sign_data.as_bytes());
            format!("{}:{}", timestamp, base64::encode(&sig_bytes))
        } else {
            format!("{}:unsigned", timestamp)
        };

        let request = AuditBatchRequest {
            device_id: self.device_id.clone(),
            timestamp,
            nonce,
            signature,
            events: events.to_vec(),
        };

        // 发送请求
        let url = format!("{}/agent/audit", self.config.server_url);
        let mut attempts = 0;

        while attempts < self.config.max_retries {
            match client.post(&url).json(&request).send().await {
                Ok(response) => {
                    if response.status().is_success() {
                        let result: AuditBatchResponse = response.json().await?;
                        tracing::info!(
                            "Audit upload successful: {} accepted, {} rejected",
                            result.accepted_count,
                            result.rejected_count
                        );
                        return Ok(());
                    } else {
                        let status = response.status();
                        let error_text = response.text().await.unwrap_or_default();
                        tracing::warn!(
                            "Audit upload failed (attempt {}/{}): {} - {}",
                            attempts + 1,
                            self.config.max_retries,
                            status,
                            error_text
                        );
                    }
                }
                Err(e) => {
                    tracing::warn!(
                        "Audit upload error (attempt {}/{}): {}",
                        attempts + 1,
                        self.config.max_retries,
                        e
                    );
                }
            }

            attempts += 1;
            if attempts < self.config.max_retries {
                tokio::time::sleep(Duration::from_secs(self.config.retry_interval_secs)).await;
            }
        }

        Err(anyhow::anyhow!(
            "Failed to upload audit events after {} attempts",
            self.config.max_retries
        ))
    }

    /// 本地持久化事件
    async fn persist_events_locally(&self, events: &[AuditEvent]) -> Result<()> {
        let path = self
            .config
            .local_persistence_path
            .as_ref()
            .map(|p| std::path::PathBuf::from(p))
            .unwrap_or_else(|| {
                dirs::data_local_dir()
                    .unwrap_or_else(|| std::path::PathBuf::from("."))
                    .join("rmm-agent")
                    .join("audit_cache")
            });

        // 确保目录存在
        tokio::fs::create_dir_all(&path).await?;

        // 生成文件名
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        let filename = format!("audit_batch_{}.json", timestamp);
        let filepath = path.join(filename);

        // 写入文件
        let json = serde_json::to_string_pretty(events)?;
        tokio::fs::write(&filepath, json).await?;

        tracing::info!("Persisted {} audit events to {:?}", events.len(), filepath);

        Ok(())
    }

    /// 加载本地持久化的事件并重新上传
    pub async fn load_and_upload_persisted_events(&self) -> Result<usize> {
        let path = self
            .config
            .local_persistence_path
            .as_ref()
            .map(|p| std::path::PathBuf::from(p))
            .unwrap_or_else(|| {
                dirs::data_local_dir()
                    .unwrap_or_else(|| std::path::PathBuf::from("."))
                    .join("rmm-agent")
                    .join("audit_cache")
            });

        if !path.exists() {
            return Ok(0);
        }

        let mut total_uploaded = 0;
        let mut entries = tokio::fs::read_dir(&path).await?;

        while let Some(entry) = entries.next_entry().await? {
            let file_path = entry.path();
            if file_path.extension().map(|e| e == "json").unwrap_or(false) {
                match self.process_persisted_file(&file_path).await {
                    Ok(count) => {
                        total_uploaded += count;
                        // 上传成功后删除文件
                        if let Err(e) = tokio::fs::remove_file(&file_path).await {
                            tracing::warn!(
                                "Failed to remove persisted file {:?}: {}",
                                file_path,
                                e
                            );
                        }
                    }
                    Err(e) => {
                        tracing::warn!("Failed to process persisted file {:?}: {}", file_path, e);
                    }
                }
            }
        }

        Ok(total_uploaded)
    }

    async fn process_persisted_file(&self, file_path: &std::path::Path) -> Result<usize> {
        let content = tokio::fs::read_to_string(file_path).await?;
        let events: Vec<AuditEvent> = serde_json::from_str(&content)?;
        let count = events.len();

        self.upload_events(&events).await?;

        Ok(count)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[tokio::test]
    async fn test_audit_logger_command_execution() {
        let (logger, mut receiver) = AuditLogger::new("test-device".to_string());

        logger
            .log_command_execution(
                Some("test-session".to_string()),
                "echo",
                &["hello".to_string()],
                0,
                Duration::from_millis(100),
                5,
                0,
                AuditResult::Success,
                None,
            )
            .unwrap();

        let event = receiver.recv().await.unwrap();
        assert_eq!(event.device_id, "test-device");
        assert_eq!(event.session_id, Some("test-session".to_string()));

        match event.data {
            AuditEventData::CommandExecute {
                command, exit_code, ..
            } => {
                assert_eq!(command, "echo");
                assert_eq!(exit_code, 0);
            }
            _ => panic!("Expected CommandExecute event"),
        }
    }

    #[tokio::test]
    async fn test_sensitive_command_redaction() {
        let (logger, mut receiver) = AuditLogger::new("test-device".to_string());

        logger
            .log_command_execution(
                None,
                "sudo rm -rf /",
                &["-rf".to_string(), "/".to_string()],
                1,
                Duration::from_millis(50),
                0,
                10,
                AuditResult::Error,
                Some("Permission denied".to_string()),
            )
            .unwrap();

        let event = receiver.recv().await.unwrap();

        match event.data {
            AuditEventData::CommandExecute {
                command,
                args,
                is_sensitive,
                ..
            } => {
                assert_eq!(command, "[REDACTED]");
                assert_eq!(args, vec!["[REDACTED]"]);
                assert!(is_sensitive);
            }
            _ => panic!("Expected CommandExecute event"),
        }
    }

    #[test]
    fn test_is_sensitive_command() {
        let (logger, _) = AuditLogger::new("test-device".to_string());

        assert!(logger.is_sensitive_command("sudo ls"));
        assert!(logger.is_sensitive_command("rm -rf /"));
        assert!(logger.is_sensitive_command("passwd user"));
        assert!(!logger.is_sensitive_command("ls -la"));
        assert!(!logger.is_sensitive_command("echo hello"));
        assert!(!logger.is_sensitive_command("cat file.txt"));
    }
}
