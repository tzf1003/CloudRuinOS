use anyhow::{anyhow, Result};
use serde_json::json;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tracing::{debug, error, info, warn};
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::config::ConfigManager;
use crate::core::crypto::{CryptoManager, SignableData};
use crate::core::protocol::{
    Command, CommandType, HeartbeatRequest, HeartbeatResponse, SystemInfo,
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
    ) -> Result<HeartbeatResponse> {
        let device_id = crypto_manager
            .device_id()
            .ok_or_else(|| anyhow!("Device ID not set in crypto manager"))?;

        // 生成 nonce
        let nonce = CryptoManager::generate_nonce();
        let timestamp = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();

        // 获取系统信息
        let system_info = SystemInfo::current();

        // 创建签名数据
        let signable_data = SignableData {
            device_id: device_id.to_string(),
            timestamp,
            nonce: nonce.clone(),
            data: json!({
                "protocol_version": "1.0",
                "system_info": system_info
            }),
        };

        // 签名请求
        let signature = crypto_manager.sign(&signable_data.to_bytes()?);

        // 构建心跳请求
        let heartbeat_request =
            HeartbeatRequest::new(device_id.to_string(), nonce, signature, system_info);

        debug!("Sending heartbeat for device: {}", device_id);

        // 发送请求
        self.send_heartbeat_with_retry(&heartbeat_request, server_url).await
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
        let url = format!("{}/agent/heartbeat", server_url);
        let body = serde_json::to_string(request)?;

        debug!("Sending heartbeat to: {}", url);

        let response = self
            .http_client
            .post(&url)
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
    ) -> Result<()> {
        let (mut interval_duration, mut server_url) = {
             let cm = config_manager.read().await;
             (cm.config().heartbeat_interval(), cm.config().heartbeat_url())
        };
        
        info!(
            "Starting heartbeat loop with interval: {:?}",
            interval_duration
        );

        let mut interval = tokio::time::interval(interval_duration);
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        
        // Consume first tick
        interval.tick().await;

        loop {
            // Check for config updates
            {
                 let cm = config_manager.read().await;
                 let new_interval = cm.config().heartbeat_interval();
                 let new_url = cm.config().heartbeat_url();
                 
                 if new_interval != interval_duration {
                      info!("Heartbeat interval updated: {:?} -> {:?}", interval_duration, new_interval);
                      interval_duration = new_interval;
                      interval = tokio::time::interval(interval_duration);
                      interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
                      interval.tick().await; // Reset tick
                 }
                 
                 if new_url != server_url {
                      info!("Heartbeat URL updated: {} -> {}", server_url, new_url);
                      server_url = new_url;
                 }
            }
            
            // Wait for next tick
            interval.tick().await;

            match self.send_heartbeat(crypto_manager, state_manager, &server_url).await {
                Ok(response) => {
                    debug!("Heartbeat successful: {:?}", response);

                    // 处理服务端命令（如果有）
                    if let Some(commands) = response.commands {
                        info!("Received {} commands from server", commands.len());
                        for cmd in commands {
                            if let Err(e) = self.process_command(&cmd, state_manager, config_manager).await {
                                error!("Failed to process command {}: {}", cmd.id, e);
                            }
                        }
                    }

                    // 更新下次心跳时间（如果服务端指定）
                    if response.next_heartbeat > 0 {
                        let next_heartbeat_duration = Duration::from_millis(
                            response.next_heartbeat.saturating_sub(response.server_time),
                        );

                        if next_heartbeat_duration != self.heartbeat_interval {
                            debug!(
                                "Server suggested next heartbeat in: {:?}",
                                next_heartbeat_duration
                            );
                            // 可以考虑动态调整心跳间隔
                        }
                    }
                }
                Err(e) => {
                    error!("Heartbeat failed: {}", e);
                    // 继续循环，不退出
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

    /// 处理服务端下发的命令
    async fn process_command(
        &self, 
        cmd: &Command, 
        _state_manager: &StateManager,
        config_manager: &Arc<RwLock<ConfigManager>>
    ) -> Result<()> {
        info!(
            "Processing command: {} (type: {:?})",
            cmd.id, cmd.command_type
        );

        match cmd.command_type {
            CommandType::ConfigUpdate => {
                info!("Received config update command");
                 if let Some(config_content) = cmd.payload.get("config") {
                    config_manager.write().await.update_from_json(&config_content.to_string())?;
                    info!("Configuration updated successfully via heartbeat");
                 } else {
                     warn!("ConfigUpdate command missing 'config' payload payload: {:?}", cmd.payload);
                 }
                 return Ok(());
            }
            CommandType::Upgrade => {
                // 处理升级命令
                info!("Received upgrade command");
                if let Some(version) = cmd.payload.get("version").and_then(|v| v.as_str()) {
                    info!("Upgrade to version: {}", version);

                    // 获取下载 URL 和签名
                    let download_url = cmd
                        .payload
                        .get("download_url")
                        .and_then(|v| v.as_str())
                        .ok_or_else(|| anyhow!("Missing download_url in upgrade command"))?;

                    let signature = cmd
                        .payload
                        .get("signature")
                        .and_then(|v| v.as_str())
                        .ok_or_else(|| anyhow!("Missing signature in upgrade command"))?;

                    let checksum = cmd
                        .payload
                        .get("checksum")
                        .and_then(|v| v.as_str())
                        .ok_or_else(|| anyhow!("Missing checksum in upgrade command"))?;

                    // 执行升级
                    match self
                        .perform_upgrade(version, download_url, signature, checksum)
                        .await
                    {
                        Ok(_) => {
                            info!("Upgrade to version {} completed successfully", version);
                            // 升级成功后需要重启，这里返回让调用者处理
                        }
                        Err(e) => {
                            error!("Upgrade failed: {}", e);
                            return Err(e);
                        }
                    }
                }
            }
            CommandType::Execute => {
                // 处理执行命令
                if let (Some(command), Some(args)) = (
                    cmd.payload.get("command").and_then(|v| v.as_str()),
                    cmd.payload.get("args").and_then(|v| v.as_array()),
                ) {
                    let args: Vec<String> = args
                        .iter()
                        .filter_map(|a| a.as_str().map(String::from))
                        .collect();
                    info!("Execute command: {} {:?}", command, args);

                    // 使用平台特定的命令执行器
                    #[cfg(target_os = "windows")]
                    {
                        use tokio::process::Command as TokioCommand;
                        let output = TokioCommand::new("cmd")
                            .arg("/C")
                            .arg(command)
                            .args(&args)
                            .output()
                            .await?;
                        debug!("Command output: {:?}", output);
                    }
                    #[cfg(not(target_os = "windows"))]
                    {
                        use tokio::process::Command as TokioCommand;
                        let output = TokioCommand::new("sh")
                            .arg("-c")
                            .arg(format!("{} {}", command, args.join(" ")))
                            .output()
                            .await?;
                        debug!("Command output: {:?}", output);
                    }
                }
            }
            CommandType::FileList => {
                // 处理文件列表请求
                if let Some(path) = cmd.payload.get("path").and_then(|v| v.as_str()) {
                    info!("File list request for: {}", path);
                    // 文件操作通常通过 WebSocket 实时会话处理
                    // 这里只记录日志
                }
            }
            CommandType::FileGet => {
                // 处理文件获取请求
                if let Some(path) = cmd.payload.get("path").and_then(|v| v.as_str()) {
                    info!("File get request for: {}", path);
                    // 文件操作通常通过 WebSocket 实时会话处理
                }
            }
            CommandType::FilePut => {
                // 处理文件上传请求
                if let Some(path) = cmd.payload.get("path").and_then(|v| v.as_str()) {
                    info!("File put request for: {}", path);
                    // 文件操作通常通过 WebSocket 实时会话处理
                }
            }
        }

        // 发送命令确认到服务端
        self.ack_command(&cmd.id).await?;

        Ok(())
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
                "timestamp": SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_secs()
            }))
            .send()
            .await;

        // 不关心响应，只是尽力通知
        Ok(())
    }

    /// 向服务端确认命令已处理
    async fn ack_command(&self, command_id: &str) -> Result<()> {
        let url = format!("{}/agent/command/{}/ack", self.server_url, command_id);

        let response = self
            .http_client
            .post(&url)
            .json(&json!({
                "status": "completed",
                "timestamp": SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_secs()
            }))
            .send()
            .await?;

        if response.status().is_success() {
            debug!("Command {} acknowledged", command_id);
            Ok(())
        } else {
            warn!(
                "Failed to acknowledge command {}: {}",
                command_id,
                response.status()
            );
            Ok(()) // 不阻塞，即使确认失败也继续
        }
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
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let system_info = SystemInfo::current();
        let signable_data = SignableData {
            device_id: device_id.to_string(),
            timestamp,
            nonce: nonce.clone(),
            data: json!({
                "protocol_version": "1.0",
                "system_info": system_info
            }),
        };

        let signature = crypto_manager.sign(&signable_data.to_bytes().unwrap());
        let request = HeartbeatRequest::new(device_id.to_string(), nonce, signature, system_info);

        assert_eq!(request.device_id, device_id);
        assert_eq!(request.protocol_version, "1.0");
        assert!(!request.signature.is_empty());
        assert!(!request.nonce.is_empty());
    }
}
