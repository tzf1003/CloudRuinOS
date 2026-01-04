use anyhow::{anyhow, Result};
use serde_json::json;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tracing::{debug, error, info, warn};

use crate::core::crypto::{CryptoManager, SignableData};
use crate::core::protocol::{HeartbeatRequest, HeartbeatResponse, SystemInfo};
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
        state_manager: &StateManager,
    ) -> Result<HeartbeatResponse> {
        let device_id = crypto_manager
            .device_id()
            .ok_or_else(|| anyhow!("Device ID not set in crypto manager"))?;

        // 生成 nonce
        let nonce = CryptoManager::generate_nonce();
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)?
            .as_secs();

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
        let heartbeat_request = HeartbeatRequest::new(
            device_id.to_string(),
            nonce,
            signature,
            system_info,
        );

        debug!("Sending heartbeat for device: {}", device_id);

        // 发送请求
        self.send_heartbeat_with_retry(&heartbeat_request).await
    }

    /// 带重试的心跳发送
    async fn send_heartbeat_with_retry(
        &self,
        request: &HeartbeatRequest,
    ) -> Result<HeartbeatResponse> {
        let mut last_error = None;

        for attempt in 1..=self.max_retry_attempts {
            match self.send_heartbeat_request(request).await {
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
    ) -> Result<HeartbeatResponse> {
        let url = format!("{}/agent/heartbeat", self.server_url);
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
    ) -> Result<()> {
        info!("Starting heartbeat loop with interval: {:?}", self.heartbeat_interval);

        let mut interval = tokio::time::interval(self.heartbeat_interval);
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        loop {
            interval.tick().await;

            match self.send_heartbeat(crypto_manager, state_manager).await {
                Ok(response) => {
                    debug!("Heartbeat successful: {:?}", response);
                    
                    // 处理服务端命令（如果有）
                    if let Some(commands) = response.commands {
                        info!("Received {} commands from server", commands.len());
                        // TODO: 处理命令（在后续任务中实现）
                    }

                    // 更新下次心跳时间（如果服务端指定）
                    if response.next_heartbeat > 0 {
                        let next_heartbeat_duration = Duration::from_millis(
                            response.next_heartbeat.saturating_sub(response.server_time)
                        );
                        
                        if next_heartbeat_duration != self.heartbeat_interval {
                            debug!("Server suggested next heartbeat in: {:?}", next_heartbeat_duration);
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
        let request = HeartbeatRequest::new(
            device_id.to_string(),
            nonce,
            signature,
            system_info,
        );

        assert_eq!(request.device_id, device_id);
        assert_eq!(request.protocol_version, "1.0");
        assert!(!request.signature.is_empty());
        assert!(!request.nonce.is_empty());
    }
}