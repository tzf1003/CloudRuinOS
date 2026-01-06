pub mod audit;
pub mod command;
pub mod crypto;
pub mod enrollment;
pub mod files;
pub mod heartbeat;
pub mod protocol;
pub mod reconnect;
pub mod scheduler;
pub mod state;

#[cfg(test)]
pub mod property_tests;

#[cfg(test)]
pub mod network_config_tests;

use anyhow::Result;
use base64::{engine::general_purpose, Engine as _};
use serde_json::json;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tracing::{error, info};

use crate::config::ConfigManager;
use crate::platform::{create_command_executor, create_file_system};
use crate::transport::{HttpClient, TlsConfig};

use self::crypto::CryptoManager;
use self::enrollment::{EnrollmentClient, EnrollmentConfig};
use self::heartbeat::{HeartbeatClient, HeartbeatConfig};
use self::reconnect::ReconnectManager;
use self::scheduler::{Scheduler, TaskType};
use self::state::{EnrollmentStatus, StateManager};

#[allow(dead_code)]
pub struct Agent {
    config_manager: Arc<RwLock<ConfigManager>>,
    state_manager: StateManager,
    crypto_manager: Option<CryptoManager>,
    enrollment_client: EnrollmentClient,
    heartbeat_client: HeartbeatClient,
    scheduler: Scheduler,
    http_client: HttpClient,
    reconnect_manager: ReconnectManager,
    command_executor: Box<dyn crate::platform::CommandExecutor + Send + Sync>,
    file_system: Box<dyn crate::platform::FileSystem + Send + Sync>,
}

impl Agent {
    pub async fn new() -> Result<Self> {
        unimplemented!("Use new_with_config");
    }

    pub async fn new_with_config(config_manager: ConfigManager) -> Result<Self> {
        info!("Initializing Ruinos Agent with configuration");

        let config_manager = Arc::new(RwLock::new(config_manager));
        let config = config_manager.read().await.config().clone();

        // 获取配置目录
        let config_dir = PathBuf::from(&config.paths.config_dir);
        let data_dir = PathBuf::from(&config.paths.data_dir);

        // 确保目录存在
        std::fs::create_dir_all(&config_dir)?;
        std::fs::create_dir_all(&data_dir)?;

        let state_file = data_dir.join("agent_state.json");

        // 初始化状态管理器
        let state_manager = StateManager::new(state_file)?;

        // 初始化注册客户端
        let enrollment_config = EnrollmentConfig {
            server_url: config.enrollment_url(),
            timeout: config.connect_timeout(),
            retry_attempts: config.heartbeat.retry_attempts,
            retry_delay: Duration::from_secs(config.heartbeat.retry_delay),
        };
        let enrollment_client = EnrollmentClient::new(enrollment_config)?;

        // 初始化调度器
        let scheduler = Scheduler::new();

        // 初始化 HTTP 客户端
        let tls_config = TlsConfig::default();
        let http_client = HttpClient::new(tls_config)?;

        // 初始化心跳客户端
        let heartbeat_config = HeartbeatConfig {
            server_url: config.heartbeat_url(),
            heartbeat_interval: config.heartbeat_interval(),
            max_retry_attempts: config.heartbeat.retry_attempts,
            retry_delay: Duration::from_secs(config.heartbeat.retry_delay),
        };
        let heartbeat_client = HeartbeatClient::new(heartbeat_config, http_client.clone());

        // 初始化重连管理器
        let reconnect_strategy = reconnect::ReconnectStrategy::exponential_backoff();
        let reconnect_manager = ReconnectManager::new(reconnect_strategy);

        // 创建平台特定的执行器
        let command_executor = create_command_executor()?;
        let file_system = create_file_system()?;

        // 尝试加载现有凭证
        let credentials_file = config.credentials_path();
        let crypto_manager = if credentials_file.exists() {
            match CryptoManager::from_credentials_file(&credentials_file) {
                Ok(manager) => {
                    info!("Loaded existing credentials from: {:?}", credentials_file);
                    Some(manager)
                }
                Err(e) => {
                    error!("Failed to load credentials: {}", e);
                    None
                }
            }
        } else {
            None
        };

        Ok(Self {
            config_manager,
            state_manager,
            crypto_manager,
            enrollment_client,
            heartbeat_client,
            scheduler,
            http_client,
            reconnect_manager,
            command_executor,
            file_system,
        })
    }

    pub async fn run(&mut self) -> Result<()> {
        info!("Ruinos Agent starting");

        // 检查现有凭证
        let config_dir = Self::get_config_dir()?;
        let credentials_file = config_dir.join("credentials.json");

        if self
            .enrollment_client
            .verify_existing_credentials(&credentials_file, &self.state_manager)
            .await?
        {
            info!("Using existing device credentials");
        } else {
            info!("No valid credentials found, enrollment required");
        }

        loop {
            // 检查注册状态
            let enrollment_status = self.state_manager.get_enrollment_status().await;
            match enrollment_status {
                EnrollmentStatus::NotEnrolled => {
                    let token = self
                        .config_manager
                        .read()
                        .await
                        .bootstrap
                        .enrollment_token
                        .clone()
                        .unwrap_or_else(|| "".to_string());

                    info!(
                        "Agent not enrolled. Attempting enrollment with token: '{}'",
                        if token.is_empty() { "DEFAULT" } else { &token }
                    );

                    match self.enroll_with_token(token).await {
                        Ok(device_id) => {
                            info!("Enrollment successful. Device ID: {}", device_id);
                            // Reload crypto manager
                            let config_dir = Self::get_config_dir()?;
                            let credentials_file = config_dir.join("credentials.json");
                            self.crypto_manager =
                                Some(CryptoManager::from_credentials_file(&credentials_file)?);
                            self.config_manager
                                .write()
                                .await
                                .update_device_id(device_id)?;
                            // Loop continues and will hit Enrolled state next
                        }
                        Err(e) => {
                            error!("Enrollment failed: {}", e);
                            tokio::time::sleep(Duration::from_secs(10)).await;
                        }
                    }
                    // Removed else { wait } block because we always try
                }
                EnrollmentStatus::Enrolled => {
                    info!("Agent enrolled, starting normal operation");

                    // 确保 CryptoManager 已加载 (如果是刚注册完，上面已经加载了；如果是重启，可能未加载)
                    if self.crypto_manager.is_none() {
                        let config_dir = Self::get_config_dir()?;
                        let credentials_file = config_dir.join("credentials.json");
                        if credentials_file.exists() {
                            self.crypto_manager =
                                Some(CryptoManager::from_credentials_file(&credentials_file)?);
                        } else {
                            // 状态是 Enrolled 但没有文件？状态不一致
                            error!("Enrolled state but no credentials file! Resetting status.");
                            self.state_manager
                                .set_enrollment_status(EnrollmentStatus::NotEnrolled)
                                .await?;
                            continue;
                        }
                    }

                    // 同步配置
                    if let Err(e) = self.sync_config().await {
                        error!("Initial config sync failed: {}", e);
                    }

                    // 启动心跳循环
                    if let Some(crypto_manager) = &self.crypto_manager {
                        info!("Starting heartbeat loop");
                        let heartbeat_task = {
                            let heartbeat_client = self.heartbeat_client.clone();
                            let crypto_manager = crypto_manager.clone();
                            let state_manager = self.state_manager.clone();
                            let config_manager = self.config_manager.clone(); // Clone Arc

                            tokio::spawn(async move {
                                if let Err(e) = heartbeat_client
                                    .start_heartbeat_loop(
                                        &crypto_manager,
                                        &state_manager,
                                        &config_manager,
                                    )
                                    .await
                                {
                                    error!("Heartbeat loop failed: {}", e);
                                }
                            })
                        };

                        // 等待心跳任务或关闭信号
                        tokio::select! {
                            _ = heartbeat_task => {
                                error!("Heartbeat loop terminated unexpectedly");
                                tokio::time::sleep(Duration::from_secs(5)).await;
                            }
                            _ = tokio::signal::ctrl_c() => {
                                info!("Received shutdown signal");
                                return Ok(());
                            }
                        }
                    } else {
                        error!("No crypto manager available for heartbeat");
                        tokio::time::sleep(Duration::from_secs(5)).await;
                    }
                }
                EnrollmentStatus::Enrolling => {
                    info!("Agent enrollment in progress");
                    tokio::time::sleep(Duration::from_secs(2)).await;
                }
                EnrollmentStatus::EnrollmentFailed(ref error) => {
                    error!("Agent enrollment failed previously: {}", error);
                    // Reset to retry
                    self.state_manager
                        .set_enrollment_status(EnrollmentStatus::NotEnrolled)
                        .await?;
                    tokio::time::sleep(Duration::from_secs(5)).await;
                }
            }
        }
    }

    /// 执行设备注册
    pub async fn enroll_with_token(&self, enrollment_token: String) -> Result<String> {
        let config_dir = Self::get_config_dir()?;
        let credentials_file = config_dir.join("credentials.json");

        info!("Starting device enrollment with provided token");

        let device_id = self
            .enrollment_client
            .enroll_device_with_retry(
                enrollment_token,
                &self.state_manager,
                &credentials_file,
                3,                      // max attempts
                Duration::from_secs(5), // retry delay
            )
            .await?;

        info!("Device enrollment completed successfully: {}", device_id);
        Ok(device_id)
    }

    async fn setup_scheduled_tasks(&self) -> Result<()> {
        let config = self.state_manager.get_config().await;

        // 添加心跳任务
        self.scheduler
            .add_task(
                "heartbeat".to_string(),
                TaskType::Heartbeat,
                Duration::from_secs(config.heartbeat_interval),
            )
            .await?;

        info!("Scheduled tasks configured");
        Ok(())
    }

    /// 从服务器同步配置
    async fn sync_config(&mut self) -> Result<()> {
        if self.crypto_manager.is_none() {
            return Err(anyhow::anyhow!("Cannot sync config: No credentials"));
        }
        // Scope for read lock to get URL
        let url = {
            let cm = self.config_manager.read().await;
            let base_url = &cm.config().server.base_url;
            format!("{}/agent/config", base_url.trim_end_matches('/'))
        };

        info!("Syncing config from {}", url);

        // Scope for read lock to get Device ID
        let device_id = {
            let cm = self.config_manager.read().await;
            cm.config()
                .agent
                .device_id
                .clone()
                .ok_or(anyhow::anyhow!("No Device ID"))?
        };

        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_millis() as u64;

        let nonce = CryptoManager::generate_nonce();

        let payload = json!({
            "device_id": device_id,
            "timestamp": timestamp,
            "nonce": nonce,
        });

        // 签名
        let signature = self
            .crypto_manager
            .as_ref()
            .unwrap()
            .sign(payload.to_string().as_bytes());

        let body = json!({
            "device_id": device_id,
            "timestamp": timestamp,
            "nonce": nonce,
            "signature": signature,
        });

        // 使用 http_client 发送请求
        let response = self.http_client.post(&url).json(&body).send().await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            error!("Config sync failed: {}", error_text);
            return Ok(());
        }

        let resp_json: serde_json::Value = response.json().await?;

        if let Some(config_content) = resp_json.get("config") {
            self.config_manager
                .write()
                .await
                .update_from_json(&config_content.to_string())?;
            info!("Dynamic config updated via sync");
        }

        Ok(())
    }

    fn get_config_dir() -> Result<PathBuf> {
        let config_dir = dirs::config_dir()
            .ok_or_else(|| anyhow::anyhow!("Could not determine config directory"))?
            .join("rmm-agent");

        std::fs::create_dir_all(&config_dir)?;
        Ok(config_dir)
    }

    async fn load_credentials(config_dir: &std::path::Path) -> Result<Option<CryptoManager>> {
        let credentials_file = config_dir.join("credentials.json");

        if credentials_file.exists() {
            match CryptoManager::from_credentials_file(&credentials_file) {
                Ok(manager) => {
                    info!("Loaded existing credentials");
                    Ok(Some(manager))
                }
                Err(e) => {
                    error!("Failed to load credentials: {}", e);
                    Ok(None)
                }
            }
        } else {
            info!("No existing credentials found");
            Ok(None)
        }
    }

    async fn load_credentials_from_config(
        config_manager: &ConfigManager,
    ) -> Result<Option<CryptoManager>> {
        let credentials_file = config_manager.config().credentials_path();

        if credentials_file.exists() {
            match CryptoManager::from_credentials_file(&credentials_file) {
                Ok(manager) => {
                    info!("Loaded existing credentials from: {:?}", credentials_file);
                    Ok(Some(manager))
                }
                Err(e) => {
                    error!("Failed to load credentials: {}", e);
                    Ok(None)
                }
            }
        } else {
            info!("No existing credentials found at: {:?}", credentials_file);
            Ok(None)
        }
    }

    // 获取器方法
    pub fn state_manager(&self) -> &StateManager {
        &self.state_manager
    }

    pub fn crypto_manager(&self) -> Option<&CryptoManager> {
        self.crypto_manager.as_ref()
    }

    pub fn scheduler(&self) -> &Scheduler {
        &self.scheduler
    }

    pub fn heartbeat_client(&self) -> &HeartbeatClient {
        &self.heartbeat_client
    }
}
