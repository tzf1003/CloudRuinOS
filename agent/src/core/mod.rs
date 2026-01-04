pub mod protocol;
pub mod crypto;
pub mod scheduler;
pub mod state;
pub mod reconnect;
pub mod enrollment;
pub mod heartbeat;
pub mod command;
pub mod audit;
pub mod files;

#[cfg(test)]
pub mod property_tests;

#[cfg(test)]
pub mod network_config_tests;

use anyhow::Result;
use std::path::PathBuf;
use std::time::Duration;
use tracing::{info, error};

use crate::platform::{create_command_executor, create_file_system};
use crate::transport::{HttpClient, TlsConfig};
use crate::config::ConfigManager;

use self::crypto::CryptoManager;
use self::enrollment::{EnrollmentClient, EnrollmentConfig};
use self::scheduler::{Scheduler, TaskType, SchedulerCommand};
use self::state::{StateManager, AgentConfig, EnrollmentStatus, ConnectionStatus};
use self::reconnect::ReconnectManager;
use self::heartbeat::{HeartbeatClient, HeartbeatConfig};

pub struct Agent {
    config_manager: ConfigManager,
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
        info!("Initializing RMM Agent");

        // 获取配置目录
        let config_dir = Self::get_config_dir()?;
        let state_file = config_dir.join("agent_state.json");

        // 初始化状态管理器
        let state_manager = StateManager::new(state_file)?;
        
        // 初始化注册客户端
        let config = state_manager.get_config().await;
        let enrollment_config = EnrollmentConfig {
            server_url: config.server_url.clone(),
            timeout: Duration::from_secs(config.request_timeout),
            retry_attempts: 3,
            retry_delay: Duration::from_secs(5),
        };
        let enrollment_client = EnrollmentClient::new(enrollment_config)?;
        
        // 初始化调度器
        let scheduler = Scheduler::new();
        
        // 初始化 HTTP 客户端
        let tls_config = TlsConfig::default();
        let http_client = HttpClient::new(tls_config)?;
        
        // 初始化心跳客户端
        let heartbeat_config = HeartbeatConfig {
            server_url: config.server_url.clone(),
            heartbeat_interval: Duration::from_secs(config.heartbeat_interval),
            max_retry_attempts: 3,
            retry_delay: Duration::from_secs(5),
        };
        let heartbeat_client = HeartbeatClient::new(heartbeat_config, http_client.clone());
        
        // 初始化重连管理器
        let reconnect_strategy = reconnect::ReconnectStrategy::exponential_backoff();
        let reconnect_manager = ReconnectManager::new(reconnect_strategy);
        
        // 创建平台特定的执行器
        let command_executor = create_command_executor()?;
        let file_system = create_file_system()?;

        // 尝试加载现有凭证
        let crypto_manager = Self::load_credentials(&config_dir).await?;

        Ok(Self {
            config_manager: ConfigManager::default(),
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

    pub async fn new_with_config(config_manager: ConfigManager) -> Result<Self> {
        info!("Initializing RMM Agent with configuration");

        let config = config_manager.config();

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
        let crypto_manager = Self::load_credentials_from_config(&config_manager).await?;

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

    pub async fn run(&self) -> Result<()> {
        info!("RMM Agent starting");

        // 检查现有凭证
        let config_dir = Self::get_config_dir()?;
        let credentials_file = config_dir.join("credentials.json");
        
        if self.enrollment_client.verify_existing_credentials(&credentials_file, &self.state_manager).await? {
            info!("Using existing device credentials");
        } else {
            info!("No valid credentials found, enrollment required");
        }

        // 检查注册状态
        let enrollment_status = self.state_manager.get_enrollment_status().await;
        match enrollment_status {
            EnrollmentStatus::NotEnrolled => {
                info!("Agent not enrolled, enrollment required");
                // 注册逻辑将在后续任务中实现
            }
            EnrollmentStatus::Enrolled => {
                info!("Agent enrolled, starting normal operation");
                
                // 启动心跳循环
                if let Some(crypto_manager) = &self.crypto_manager {
                    info!("Starting heartbeat loop");
                    let heartbeat_task = {
                        let heartbeat_client = self.heartbeat_client.clone();
                        let crypto_manager = crypto_manager.clone();
                        let state_manager = self.state_manager.clone();
                        
                        tokio::spawn(async move {
                            if let Err(e) = heartbeat_client.start_heartbeat_loop(&crypto_manager, &state_manager).await {
                                error!("Heartbeat loop failed: {}", e);
                            }
                        })
                    };
                    
                    // 等待心跳任务或关闭信号
                    tokio::select! {
                        _ = heartbeat_task => {
                            error!("Heartbeat loop terminated unexpectedly");
                        }
                        _ = tokio::signal::ctrl_c() => {
                            info!("Received shutdown signal");
                        }
                    }
                } else {
                    error!("No crypto manager available for heartbeat");
                }
            }
            EnrollmentStatus::Enrolling => {
                info!("Agent enrollment in progress");
            }
            EnrollmentStatus::EnrollmentFailed(ref error) => {
                error!("Agent enrollment failed: {}", error);
            }
        }

        // 设置基本的调度任务
        self.setup_scheduled_tasks().await?;

        info!("RMM Agent running - core implementation pending");
        
        // 等待关闭信号
        tokio::signal::ctrl_c().await?;
        info!("Received shutdown signal");
        
        Ok(())
    }

    /// 执行设备注册
    pub async fn enroll_with_token(&self, enrollment_token: String) -> Result<String> {
        let config_dir = Self::get_config_dir()?;
        let credentials_file = config_dir.join("credentials.json");
        
        info!("Starting device enrollment with provided token");
        
        let device_id = self.enrollment_client.enroll_device_with_retry(
            enrollment_token,
            &self.state_manager,
            &credentials_file,
            3, // max attempts
            Duration::from_secs(5), // retry delay
        ).await?;
        
        info!("Device enrollment completed successfully: {}", device_id);
        Ok(device_id)
    }

    async fn setup_scheduled_tasks(&self) -> Result<()> {
        let config = self.state_manager.get_config().await;
        
        // 添加心跳任务
        self.scheduler.add_task(
            "heartbeat".to_string(),
            TaskType::Heartbeat,
            Duration::from_secs(config.heartbeat_interval),
        ).await?;

        info!("Scheduled tasks configured");
        Ok(())
    }

    fn get_config_dir() -> Result<PathBuf> {
        let config_dir = dirs::config_dir()
            .ok_or_else(|| anyhow::anyhow!("Could not determine config directory"))?
            .join("rmm-agent");

        std::fs::create_dir_all(&config_dir)?;
        Ok(config_dir)
    }

    async fn load_credentials(config_dir: &PathBuf) -> Result<Option<CryptoManager>> {
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

    async fn load_credentials_from_config(config_manager: &ConfigManager) -> Result<Option<CryptoManager>> {
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