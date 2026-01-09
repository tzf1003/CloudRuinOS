use anyhow::{anyhow, Result};
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};

use crate::config::ConfigManager;
use crate::core::crypto::CryptoManager;
use crate::core::protocol::{
    HeartbeatRequest, HeartbeatResponse, SystemInfo, TaskReport,
    TaskItem, TaskType, TaskState,
};
use crate::core::state::StateManager;
use crate::transport::HttpClient;

/// 心跳客户端
#[derive(Clone)]
pub struct HeartbeatClient {
    http_client: HttpClient,
    server_url: String,
    heartbeat_interval: Duration,
    max_retry_attempts: u32,
    retry_delay: Duration,
}

/// 心跳客户端配置
#[derive(Debug, Clone)]
pub struct HeartbeatConfig {
    pub server_url: String,
    pub heartbeat_interval: Duration,
    pub max_retry_attempts: u32,
    pub retry_delay: Duration,
}

impl Default for HeartbeatConfig {
    fn default() -> Self {
        Self {
            server_url: "http://localhost:8787".to_string(),
            heartbeat_interval: Duration::from_secs(60),
            max_retry_attempts: 3,
            retry_delay: Duration::from_secs(5),
        }
    }
}

impl HeartbeatClient {
    /// 创建新的心跳客户端
    pub fn new(config: HeartbeatConfig, http_client: HttpClient) -> Self {
        Self {
            http_client,
            server_url: config.server_url,
            heartbeat_interval: config.heartbeat_interval,
            max_retry_attempts: config.max_retry_attempts,
            retry_delay: config.retry_delay,
        }
    }

    /// 发送心跳请求
    pub async fn send_heartbeat(
        &self,
        crypto_manager: &CryptoManager,
        _state_manager: &StateManager,
        server_url: &str,
        reports: Option<Vec<TaskReport>>,
    ) -> Result<HeartbeatResponse> {
        let device_id = crypto_manager
            .device_id()
            .ok_or_else(|| anyhow!("Device ID not set in crypto manager"))?;

        // 生成 nonce
        let nonce = CryptoManager::generate_nonce();
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_millis() as u64;

        // 获取系统信息
        let system_info = SystemInfo::current();

        // 构造用于签名的 Struct - 必须匹配 Server 端的 verifyRequestIntegrity 构造顺序
        // verifyRequestIntegrity 顺序: device_id, timestamp, nonce, protocol_version, system_info
        #[derive(serde::Serialize)]
        struct HeartbeatSignData<'a> {
            device_id: &'a str,
            timestamp: u64,
            nonce: &'a str,
            protocol_version: &'a str,
            system_info: &'a SystemInfo,
        }

        let sign_data = HeartbeatSignData {
            device_id: &device_id,
            timestamp,
            nonce: &nonce,
            protocol_version: "1.0",
            system_info: &system_info,
        };

        // 序列化，serde struct 序列化保持字段顺序
        let payload_str = serde_json::to_string(&sign_data)?;
        info!("Helper Payload for signing: {}", payload_str);

        // 签名请求
        let signature = crypto_manager.sign(payload_str.as_bytes());

        // 构建心跳请求
        let mut heartbeat_request =
            HeartbeatRequest::new(device_id.to_string(), nonce, signature, system_info, timestamp);
        heartbeat_request.reports = reports;

        debug!("Sending heartbeat for device: {}", device_id);

        // 发送请求
        self.send_heartbeat_with_retry(&heartbeat_request, server_url)
            .await
    }

    /// 带重试的心跳发送
    async fn send_heartbeat_with_retry(
        &self,
        request: &HeartbeatRequest,
        server_url: &str,
    ) -> Result<HeartbeatResponse> {
        let mut last_error = None;

        for attempt in 1..=self.max_retry_attempts {
            match self.send_heartbeat_request(request, server_url).await {
                Ok(response) => {
                    if attempt > 1 {
                        info!("Heartbeat succeeded on attempt {}", attempt);
                    }
                    return Ok(response);
                }
                Err(e) => {
                    warn!("Heartbeat attempt {} failed: {}", attempt, e);
                    last_error = Some(e);

                    if attempt < self.max_retry_attempts {
                        debug!("Retrying heartbeat in {:?}", self.retry_delay);
                        tokio::time::sleep(self.retry_delay).await;
                    }
                }
            }
        }

        Err(last_error.unwrap_or_else(|| anyhow!("All heartbeat attempts failed")))
    }

    /// 发送单次心跳请求
    async fn send_heartbeat_request(
        &self,
        request: &HeartbeatRequest,
        server_url: &str,
    ) -> Result<HeartbeatResponse> {
        // server_url 已经包含了 /agent/heartbeat 端点
        let url = server_url;
        let body = serde_json::to_string(request)?;

        debug!("Sending heartbeat to: {}", url);

        let response = self
            .http_client
            .post(url)
            .header("Content-Type", "application/json")
            .body(body)
            .send()
            .await?;

        let status = response.status();
        let response_text = response.text().await?;

        if !status.is_success() {
            return Err(anyhow!(
                "Heartbeat failed with status {}: {}",
                status,
                response_text
            ));
        }

        let heartbeat_response: HeartbeatResponse = serde_json::from_str(&response_text)
            .map_err(|e| anyhow!("Failed to parse heartbeat response: {}", e))?;

        debug!("Heartbeat response: {:?}", heartbeat_response);
        Ok(heartbeat_response)
    }

    /// 启动心跳循环
    pub async fn start_heartbeat_loop(
        &self,
        crypto_manager: &CryptoManager,
        state_manager: &StateManager,
        config_manager: &Arc<RwLock<ConfigManager>>,
        task_manager: &Arc<crate::core::task_manager::TaskManager>,
        cmd_executor: &Arc<crate::core::cmd_executor::CommandExecutor>,
        task_handler: &Arc<crate::task_handler::TaskHandler>,
    ) -> Result<()> {
        let (mut interval_duration, mut server_url) = {
            let cm = config_manager.read().await;
            (
                cm.config().heartbeat_interval(),
                cm.config().heartbeat_url(),
            )
        };

        info!(
            "Starting heartbeat loop with interval: {:?}",
            interval_duration
        );

        let mut next_wait = interval_duration;
        let mut pending_reports: Vec<TaskReport> = Vec::new();

        loop {
            // Wait for the interval
            tokio::time::sleep(next_wait).await;

            // Check for config updates
            {
                let cm = config_manager.read().await;
                let config_interval = cm.config().heartbeat_interval();
                let new_url = cm.config().heartbeat_url();

                if config_interval != interval_duration {
                    info!(
                        "Configured heartbeat interval updated: {:?} -> {:?}",
                        interval_duration, config_interval
                    );
                    interval_duration = config_interval;
                }

                if new_url != server_url {
                    info!("Heartbeat URL updated: {} -> {}", server_url, new_url);
                    server_url = new_url;
                }
            }
            
            // 生成待上报的 reports（从 TaskManager）
            let reports_from_manager = task_manager.generate_reports().await;
            
            // 收集终端输出增量
            let terminal_reports = task_handler.collect_output_reports();
            
            // 合并待上报的 reports
            let mut all_reports = pending_reports.clone();
            all_reports.extend(reports_from_manager.clone());
            
            // 转换 task_handler::TaskReport 到 protocol::TaskReport
            for tr in terminal_reports {
                all_reports.push(TaskReport {
                    task_id: tr.task_id,
                    state: if tr.status == "completed" { TaskState::Succeeded } else { TaskState::Failed },
                    progress: Some(100),
                    output_chunk: Some(tr.output_chunk),
                    output_cursor: Some(tr.output_cursor),
                    error: tr.result.get("error").and_then(|v| v.as_str()).map(|s| s.to_string()),
                });
            }
            
            let reports_to_send = if all_reports.is_empty() {
                None
            } else {
                Some(all_reports.clone())
            };

            match self
                .send_heartbeat(crypto_manager, state_manager, &server_url, reports_to_send.clone())
                .await
            {
                Ok(response) => {
                    debug!("Heartbeat successful");
                    
                    // 确认 reports 已发送
                    if let Some(ref reports) = reports_to_send {
                        task_manager.confirm_reports_sent(reports).await;
                        pending_reports.clear();
                    }

                    if let Err(e) = state_manager.update_heartbeat().await {
                         error!("Failed to update local heartbeat state: {}", e);
                    }

                    // 处理 Tasks
                    for task in response.tasks {
                        info!("Received Task: {} type={:?}", task.task_id, task.task_type);
                        
                        // 接收任务到 TaskManager
                        match task_manager.receive_task(&task).await {
                            Ok(true) => {
                                // 任务被接受，开始处理
                                let report = self.process_task(&task, state_manager, config_manager, task_manager, cmd_executor, task_handler).await;
                                pending_reports.push(report);
                            }
                            Ok(false) => {
                                // 任务被拒绝（旧版本）
                                debug!("Task {} rejected (old revision)", task.task_id);
                            }
                            Err(e) => {
                                error!("Failed to receive task {}: {}", task.task_id, e);
                            }
                        }
                    }
                    
                    // 处理 Cancels
                    for cancel in response.cancels {
                         info!("Received Cancel: {} rev={}", cancel.task_id, cancel.revision);
                         
                         // 取消任务
                         if let Err(e) = task_manager.cancel_task(&cancel.task_id, cancel.revision).await {
                             error!("Failed to cancel task {}: {}", cancel.task_id, e);
                         }
                         
                         // 如果命令正在执行，终止进程
                         if cmd_executor.is_running(&cancel.task_id).await {
                             if let Err(e) = cmd_executor.cancel_command(&cancel.task_id).await {
                                 error!("Failed to cancel command for task {}: {}", cancel.task_id, e);
                             }
                         }
                    }

                    if response.next_heartbeat > 0 {
                        let delay_millis = response.next_heartbeat.saturating_sub(response.server_time);
                        let delay = if delay_millis < 1000 {
                            Duration::from_millis(1000)
                        } else {
                            Duration::from_millis(delay_millis)
                        };
                        next_wait = delay;
                    } else {
                        next_wait = interval_duration;
                    }
                }
                Err(e) => {
                    error!("Heartbeat failed: {}", e);
                    next_wait = interval_duration;
                }
            }
        }
    }

    /// 获取心跳间隔
    pub fn heartbeat_interval(&self) -> Duration {
        self.heartbeat_interval
    }

    /// 设置心跳间隔
    pub fn set_heartbeat_interval(&mut self, interval: Duration) {
        self.heartbeat_interval = interval;
        info!("Heartbeat interval updated to: {:?}", interval);
    }

    async fn process_task(
        &self,
        task: &TaskItem,
        _state_manager: &StateManager,
        config_manager: &Arc<RwLock<ConfigManager>>,
        task_manager: &Arc<crate::core::task_manager::TaskManager>,
        cmd_executor: &Arc<crate::core::cmd_executor::CommandExecutor>,
        task_handler: &Arc<crate::task_handler::TaskHandler>,
    ) -> TaskReport {
        match task.task_type {
            TaskType::ConfigUpdate => {
                if let Some(config_content) = task.payload.get("config") {
                     match config_manager.write().await.update_from_json(&config_content.to_string()) {
                         Ok(_) => {
                             return TaskReport {
                                 task_id: task.task_id.clone(),
                                 state: TaskState::Succeeded,
                                 progress: Some(100),
                                 output_chunk: Some("Config updated".to_string()),
                                 output_cursor: None,
                                 error: None,
                             };
                         }
                         Err(e) => {
                             return TaskReport {
                                 task_id: task.task_id.clone(),
                                 state: TaskState::Failed,
                                 progress: None,
                                 output_chunk: None,
                                 output_cursor: None,
                                 error: Some(e.to_string()),
                             };
                         }
                     }
                }
                TaskReport {
                    task_id: task.task_id.clone(),
                     state: TaskState::Failed,
                     progress: None,
                     output_chunk: None,
                     output_cursor: None,
                     error: Some("Missing config payload".to_string()),
                }
            }
            TaskType::CmdExec => {
                // 解析命令
                if let Some(cmd_str) = task.payload.get("cmd").and_then(|v| v.as_str()) {
                    // 异步执行命令
                    let task_id = task.task_id.clone();
                    let cmd_str = cmd_str.to_string();
                    let cmd_executor = cmd_executor.clone();
                    
                    tokio::spawn(async move {
                        match crate::core::cmd_executor::parse_command(&cmd_str) {
                            Ok((command, args)) => {
                                if let Err(e) = cmd_executor.execute_command(task_id.clone(), command, args).await {
                                    error!("Command execution failed for task {}: {}", task_id, e);
                                }
                            }
                            Err(e) => {
                                error!("Failed to parse command for task {}: {}", task_id, e);
                            }
                        }
                    });
                    
                    // 立即返回 received 状态
                    TaskReport {
                        task_id: task.task_id.clone(),
                        state: TaskState::Received,
                        progress: None,
                        output_chunk: Some("Command queued for execution".to_string()),
                        output_cursor: None,
                        error: None,
                    }
                } else {
                    TaskReport {
                        task_id: task.task_id.clone(),
                        state: TaskState::Failed,
                        progress: None,
                        output_chunk: None,
                        output_cursor: None,
                        error: Some("Missing cmd payload".to_string()),
                    }
                }
            }
            TaskType::TerminalOpen => {
                // 解析 payload
                match serde_json::from_value::<crate::task_handler::SessionOpenPayload>(task.payload.clone()) {
                    Ok(payload) => {
                        let task_id = task.task_id.clone();
                        let handler = task_handler.clone();
                        
                        // 同步处理（终端创建很快）
                        let report = handler.handle_task(crate::task_handler::Task::SessionOpen {
                            task_id,
                            revision: task.revision as u32,
                            payload,
                        });
                        
                        // 转换 TaskReport 格式
                        TaskReport {
                            task_id: report.task_id,
                            state: if report.status == "completed" { TaskState::Succeeded } else { TaskState::Failed },
                            progress: Some(100),
                            output_chunk: Some(report.output_chunk),
                            output_cursor: Some(report.output_cursor),
                            error: report.result.get("error").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        }
                    }
                    Err(e) => TaskReport {
                        task_id: task.task_id.clone(),
                        state: TaskState::Failed,
                        progress: None,
                        output_chunk: None,
                        output_cursor: None,
                        error: Some(format!("Invalid payload: {}", e)),
                    }
                }
            }
            TaskType::TerminalInput => {
                match serde_json::from_value::<crate::task_handler::SessionInputPayload>(task.payload.clone()) {
                    Ok(payload) => {
                        let task_id = task.task_id.clone();
                        let handler = task_handler.clone();
                        
                        let report = handler.handle_task(crate::task_handler::Task::SessionInput {
                            task_id,
                            revision: task.revision as u32,
                            payload,
                        });
                        
                        TaskReport {
                            task_id: report.task_id,
                            state: if report.status == "completed" { TaskState::Succeeded } else { TaskState::Failed },
                            progress: Some(100),
                            output_chunk: Some(report.output_chunk),
                            output_cursor: Some(report.output_cursor),
                            error: report.result.get("error").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        }
                    }
                    Err(e) => TaskReport {
                        task_id: task.task_id.clone(),
                        state: TaskState::Failed,
                        progress: None,
                        output_chunk: None,
                        output_cursor: None,
                        error: Some(format!("Invalid payload: {}", e)),
                    }
                }
            }
            TaskType::TerminalResize => {
                match serde_json::from_value::<crate::task_handler::SessionResizePayload>(task.payload.clone()) {
                    Ok(payload) => {
                        let task_id = task.task_id.clone();
                        let handler = task_handler.clone();
                        
                        let report = handler.handle_task(crate::task_handler::Task::SessionResize {
                            task_id,
                            revision: task.revision as u32,
                            payload,
                        });
                        
                        TaskReport {
                            task_id: report.task_id,
                            state: if report.status == "completed" { TaskState::Succeeded } else { TaskState::Failed },
                            progress: Some(100),
                            output_chunk: Some(report.output_chunk),
                            output_cursor: Some(report.output_cursor),
                            error: report.result.get("error").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        }
                    }
                    Err(e) => TaskReport {
                        task_id: task.task_id.clone(),
                        state: TaskState::Failed,
                        progress: None,
                        output_chunk: None,
                        output_cursor: None,
                        error: Some(format!("Invalid payload: {}", e)),
                    }
                }
            }
            TaskType::TerminalClose => {
                match serde_json::from_value::<crate::task_handler::SessionClosePayload>(task.payload.clone()) {
                    Ok(payload) => {
                        let task_id = task.task_id.clone();
                        let handler = task_handler.clone();
                        
                        let report = handler.handle_task(crate::task_handler::Task::SessionClose {
                            task_id,
                            revision: task.revision as u32,
                            payload,
                        });
                        
                        TaskReport {
                            task_id: report.task_id,
                            state: if report.status == "completed" { TaskState::Succeeded } else { TaskState::Failed },
                            progress: Some(100),
                            output_chunk: Some(report.output_chunk),
                            output_cursor: Some(report.output_cursor),
                            error: report.result.get("error").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        }
                    }
                    Err(e) => TaskReport {
                        task_id: task.task_id.clone(),
                        state: TaskState::Failed,
                        progress: None,
                        output_chunk: None,
                        output_cursor: None,
                        error: Some(format!("Invalid payload: {}", e)),
                    }
                }
            }
        }
    }

    /// 执行 Agent 升级
    ///
    /// 升级流程：
    /// 1. 下载新版本二进制文件
    /// 2. 验证 SHA256 校验和
    /// 3. 验证 Ed25519 签名
    /// 4. 备份当前版本
    /// 5. 替换二进制文件
    /// 6. 触发重启
    async fn perform_upgrade(
        &self,
        version: &str,
        download_url: &str,
        signature: &str,
        expected_checksum: &str,
    ) -> Result<()> {
        use sha2::{Digest, Sha256};
        use std::env;
        use std::fs;

        info!("Starting upgrade to version {}", version);

        // Step 1: 下载新版本
        info!("Downloading new version from: {}", download_url);
        let response = self
            .http_client
            .get(download_url)
            .send()
            .await
            .map_err(|e| anyhow!("Failed to download upgrade: {}", e))?;

        if !response.status().is_success() {
            return Err(anyhow!(
                "Download failed with status: {}",
                response.status()
            ));
        }

        let new_binary = response
            .bytes()
            .await
            .map_err(|e| anyhow!("Failed to read download response: {}", e))?;

        info!("Downloaded {} bytes", new_binary.len());

        // Step 2: 验证 SHA256 校验和
        let mut hasher = Sha256::new();
        hasher.update(&new_binary);
        let actual_checksum = format!("{:x}", hasher.finalize());

        if actual_checksum != expected_checksum {
            return Err(anyhow!(
                "Checksum mismatch: expected {}, got {}",
                expected_checksum,
                actual_checksum
            ));
        }
        info!("Checksum verified: {}", actual_checksum);

        // Step 3: 验证 Ed25519 签名
        // 服务端使用其私钥签名二进制文件的 SHA256 哈希
        // 这里需要使用服务端的公钥验证签名
        if !self
            .verify_upgrade_signature(&new_binary, signature)
            .await?
        {
            return Err(anyhow!("Signature verification failed"));
        }
        info!("Signature verified successfully");

        // Step 4: 获取当前可执行文件路径并备份
        let current_exe = env::current_exe()
            .map_err(|e| anyhow!("Failed to get current executable path: {}", e))?;

        let backup_path = current_exe.with_extension("bak");

        // 在 Windows 上，需要先重命名当前文件
        #[cfg(target_os = "windows")]
        {
            // Windows: 无法覆盖正在运行的可执行文件，使用延迟替换策略
            let new_exe_path = current_exe.with_extension("new");

            // 写入新版本
            fs::write(&new_exe_path, &new_binary)
                .map_err(|e| anyhow!("Failed to write new binary: {}", e))?;

            info!("New binary written to: {:?}", new_exe_path);

            // 创建升级脚本，在 Agent 退出后执行替换
            let script_path = current_exe.with_extension("upgrade.bat");
            let script_content = format!(
                r#"@echo off
timeout /t 2 /nobreak >nul
move /y "{}" "{}"
move /y "{}" "{}"
start "" "{}"
del "%~f0"
"#,
                current_exe.display(),
                backup_path.display(),
                new_exe_path.display(),
                current_exe.display(),
                current_exe.display()
            );

            fs::write(&script_path, script_content)
                .map_err(|e| anyhow!("Failed to write upgrade script: {}", e))?;

            info!("Upgrade script created: {:?}", script_path);

            // 启动升级脚本并退出
            use std::process::Command;
            Command::new("cmd")
                .args(["/C", "start", "/b", "", &script_path.to_string_lossy()])
                .spawn()
                .map_err(|e| anyhow!("Failed to start upgrade script: {}", e))?;

            info!("Upgrade script started, exiting for upgrade...");

            // 通知升级完成（在退出前）
            self.notify_upgrade_status(version, "pending_restart")
                .await?;

            // 退出进程让脚本完成替换
            std::process::exit(0);
        }

        #[cfg(not(target_os = "windows"))]
        {
            // Unix: 可以直接替换可执行文件

            // 备份当前版本
            if current_exe.exists() {
                fs::copy(&current_exe, &backup_path)
                    .map_err(|e| anyhow!("Failed to backup current binary: {}", e))?;
                info!("Current version backed up to: {:?}", backup_path);
            }

            // 写入新版本（使用临时文件然后重命名，确保原子性）
            let temp_path = current_exe.with_extension("tmp");
            fs::write(&temp_path, &new_binary)
                .map_err(|e| anyhow!("Failed to write new binary: {}", e))?;

            // 设置可执行权限
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let mut perms = fs::metadata(&temp_path)?.permissions();
                perms.set_mode(0o755);
                fs::set_permissions(&temp_path, perms)?;
            }

            // 原子替换
            fs::rename(&temp_path, &current_exe)
                .map_err(|e| anyhow!("Failed to replace binary: {}", e))?;

            info!("Binary replaced successfully");

            // 通知升级完成
            self.notify_upgrade_status(version, "completed").await?;

            // 使用 exec 系统调用重新启动自己
            info!("Restarting agent with new version...");

            use std::process::Command;
            Command::new(&current_exe)
                .spawn()
                .map_err(|e| anyhow!("Failed to restart agent: {}", e))?;

            // 退出当前进程
            std::process::exit(0);
        }
    }

    /// 验证升级包的 Ed25519 签名
    async fn verify_upgrade_signature(&self, binary: &[u8], signature: &str) -> Result<bool> {
        use base64::Engine;
        use ed25519_dalek::{Signature, Verifier};
        use sha2::{Digest, Sha256};

        // 获取服务端公钥（从配置或硬编码）
        // 在生产环境中，这个公钥应该硬编码或从安全配置中读取
        let server_public_key = self.get_server_public_key().await?;

        // 计算二进制文件的 SHA256 哈希
        let mut hasher = Sha256::new();
        hasher.update(binary);
        let hash = hasher.finalize();

        // 解码签名
        let signature_bytes = base64::engine::general_purpose::STANDARD
            .decode(signature)
            .map_err(|e| anyhow!("Failed to decode signature: {}", e))?;

        if signature_bytes.len() != 64 {
            return Err(anyhow!("Invalid signature length"));
        }

        let mut sig_array = [0u8; 64];
        sig_array.copy_from_slice(&signature_bytes);
        let sig = Signature::from_bytes(&sig_array);

        // 验证签名
        match server_public_key.verify(&hash, &sig) {
            Ok(_) => Ok(true),
            Err(_) => Ok(false),
        }
    }

    /// 获取服务端公钥
    async fn get_server_public_key(&self) -> Result<ed25519_dalek::VerifyingKey> {
        use base64::Engine;

        // 尝试从服务端获取公钥
        let url = format!("{}/health/public-key", self.server_url);

        let response = self.http_client.get(&url).send().await;

        match response {
            Ok(resp) if resp.status().is_success() => {
                let body: serde_json::Value = resp
                    .json()
                    .await
                    .map_err(|e| anyhow!("Failed to parse public key response: {}", e))?;

                let public_key_b64 = body
                    .get("public_key")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing public_key in response"))?;

                let key_bytes = base64::engine::general_purpose::STANDARD
                    .decode(public_key_b64)
                    .map_err(|e| anyhow!("Failed to decode public key: {}", e))?;

                if key_bytes.len() != 32 {
                    return Err(anyhow!("Invalid public key length"));
                }

                let mut key_array = [0u8; 32];
                key_array.copy_from_slice(&key_bytes);

                ed25519_dalek::VerifyingKey::from_bytes(&key_array)
                    .map_err(|e| anyhow!("Invalid public key: {}", e))
            }
            _ => {
                // 如果无法从服务端获取，使用硬编码的备用公钥
                // 在生产环境中，这应该是编译时嵌入的可信公钥
                warn!("Failed to fetch server public key, using fallback");

                // 这是一个示例公钥，生产环境应替换为实际的服务端公钥
                let fallback_key = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="; // 32 字节零值示例

                let key_bytes = base64::engine::general_purpose::STANDARD
                    .decode(fallback_key)
                    .map_err(|e| anyhow!("Failed to decode fallback public key: {}", e))?;

                if key_bytes.len() != 32 {
                    return Err(anyhow!("Invalid fallback public key length"));
                }

                let mut key_array = [0u8; 32];
                key_array.copy_from_slice(&key_bytes);

                ed25519_dalek::VerifyingKey::from_bytes(&key_array)
                    .map_err(|e| anyhow!("Invalid fallback public key: {}", e))
            }
        }
    }

    /// 通知服务端升级状态
    async fn notify_upgrade_status(&self, version: &str, status: &str) -> Result<()> {
        let url = format!("{}/agent/upgrade/status", self.server_url);

        let _ = self
            .http_client
            .post(&url)
            .json(&json!({
                "version": version,
                "status": status,
                "timestamp": std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs()
            }))
            .send()
            .await;

        // 不关心响应，只是尽力通知
        Ok(())
    }


}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::transport::TlsConfig;
    use tempfile::NamedTempFile;

    #[tokio::test]
    async fn test_heartbeat_client_creation() {
        let config = HeartbeatConfig::default();
        let tls_config = TlsConfig::default();
        let http_client = HttpClient::new(tls_config).unwrap();

        let client = HeartbeatClient::new(config, http_client);
        assert_eq!(client.heartbeat_interval(), Duration::from_secs(60));
    }

    #[tokio::test]
    async fn test_heartbeat_request_construction() {
        let config = HeartbeatConfig::default();
        let tls_config = TlsConfig::default();
        let http_client = HttpClient::new(tls_config).unwrap();
        let client = HeartbeatClient::new(config, http_client);

        // 创建临时凭证
        let mut crypto_manager = CryptoManager::generate().unwrap();
        crypto_manager.set_device_id("test-device-123".to_string());

        // 创建临时状态管理器并初始化
        let temp_file = NamedTempFile::new().unwrap();
        let state_manager = StateManager::new(temp_file.path().to_path_buf()).unwrap();
        // 确保状态文件被正确初始化
        state_manager.save_state().await.unwrap();

        // 测试心跳请求构建（不实际发送）
        let device_id = crypto_manager.device_id().unwrap();
        let nonce = CryptoManager::generate_nonce();
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        let system_info = SystemInfo::current();
        
        // 构造签名数据
        #[derive(serde::Serialize)]
        struct HeartbeatSignData<'a> {
            device_id: &'a str,
            timestamp: u64,
            nonce: &'a str,
            protocol_version: &'a str,
            system_info: &'a SystemInfo,
        }

        let sign_data = HeartbeatSignData {
            device_id: &device_id,
            timestamp,
            nonce: &nonce,
            protocol_version: "1.0",
            system_info: &system_info,
        };

        let payload_str = serde_json::to_string(&sign_data).unwrap();
        let signature = crypto_manager.sign(payload_str.as_bytes());
        let request = HeartbeatRequest::new(device_id.to_string(), nonce, signature, system_info, timestamp);

        assert_eq!(request.device_id, device_id);
        assert_eq!(request.protocol_version, "1.0");
        assert!(!request.signature.is_empty());
        assert!(!request.nonce.is_empty());
    }
}
