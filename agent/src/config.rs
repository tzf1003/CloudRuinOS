// config.rs - 配置管理模块
// 处理配置文件加载、验证和热更新

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tracing::{info, warn};

/// 启动配置（Bootstrap Configuration）
/// 仅包含连接服务器所需的最小信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BootstrapConfig {
    pub server_url: String,
    pub enrollment_token: Option<String>,
}

/// Agent 主配置结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub agent: AgentSection,
    pub server: ServerSection,
    pub heartbeat: HeartbeatSection,
    pub security: SecuritySection,
    pub logging: LoggingSection,
    pub paths: PathsSection,
    pub file_operations: FileOperationsSection,
    pub commands: CommandsSection,
    pub reconnect: ReconnectSection,
    pub service: Option<ServiceSection>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSection {
    pub name: String,
    pub version: String,
    pub device_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerSection {
    pub base_url: String,
    pub enrollment_endpoint: String,
    pub heartbeat_endpoint: String,
    pub websocket_endpoint: String,
    pub connect_timeout: u64,
    pub request_timeout: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeartbeatSection {
    pub interval: u64,
    pub retry_attempts: u32,
    pub retry_delay: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecuritySection {
    pub tls_verify: bool,
    pub certificate_pinning: bool,
    pub certificate_pins: Option<Vec<String>>,
    pub doh_enabled: bool,
    pub doh_providers: Option<Vec<String>>,
    pub ech_enabled: bool,
    pub certificate: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoggingSection {
    pub level: String,
    pub file_path: Option<String>,
    pub max_file_size: String,
    pub max_files: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PathsSection {
    pub config_dir: String,
    pub data_dir: String,
    pub log_dir: String,
    pub credentials_file: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileOperationsSection {
    pub max_file_size: String,
    pub allow_hidden_files: bool,
    #[serde(default)]
    pub allowed_paths: Vec<String>,
    #[serde(default)]
    pub blocked_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandsSection {
    pub default_timeout: u64,
    pub max_concurrent: u32,
    #[serde(default)]
    pub blocked_commands: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReconnectSection {
    pub initial_delay: u64,
    pub max_delay: u64,
    pub backoff_factor: f64,
    pub max_attempts: u32,
    pub jitter: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceSection {
    pub auto_start: bool,
    pub restart_on_failure: bool,
    pub restart_delay: u64,

    #[cfg(target_os = "windows")]
    pub windows: Option<WindowsServiceSection>,

    #[cfg(target_os = "linux")]
    pub linux: Option<LinuxServiceSection>,

    #[cfg(target_os = "macos")]
    pub macos: Option<MacOSServiceSection>,
}

#[cfg(target_os = "windows")]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowsServiceSection {
    pub service_name: String,
    pub display_name: String,
    pub description: String,
    pub start_type: String,
}

#[cfg(target_os = "linux")]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinuxServiceSection {
    pub service_name: String,
    pub description: String,
    pub user: String,
    pub group: String,
    pub restart: String,
    pub restart_sec: u64,
}

#[cfg(target_os = "macos")]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MacOSServiceSection {
    pub label: String,
    pub program_arguments: Vec<String>,
    pub run_at_load: bool,
    pub keep_alive: bool,
}

/// 配置管理器
pub struct ConfigManager {
    config: AgentConfig,
    pub bootstrap: BootstrapConfig,
    // 移除文件路径依赖，支持纯内存模式
    // config_path: PathBuf,
    // last_modified: Option<std::time::SystemTime>,
}

impl ConfigManager {
    /// 使用 Bootstrap 配置初始化
    pub fn new(bootstrap: BootstrapConfig) -> Self {
        let mut config = Self::create_default_config();

        // 应用 Bootstrap 配置
        config.server.base_url = bootstrap.server_url.clone();

        info!("初始化配置管理器 (Bootstrap URL: {})", bootstrap.server_url);

        Self { config, bootstrap }
    }

    /// 从 JSON 更新动态配置 (内存中) - 支持部分更新（合并）
    pub fn update_from_json(&mut self, json_content: &str) -> Result<()> {
        // 1. 将当前配置转换为 JSON Value
        let mut current_config_value = serde_json::to_value(&self.config)?;
        
        // 2. 将远程 JSON 解析为 Value
        let remote_config_value: serde_json::Value = 
            serde_json::from_str(json_content).map_err(|e| anyhow!("解析服务器配置失败: {}", e))?;

        // 3. 执行合并
        Self::merge_json_value(&mut current_config_value, remote_config_value);

        // 4. 将合并后的 Value 反序列化回 AgentConfig
        let new_config: AgentConfig = serde_json::from_value(current_config_value)
            .map_err(|e| anyhow!("应用合并后的配置失败: {}", e))?;

        // 验证新配置
        // 注意：我们可能需要保留某些本地状态 (如 device_id)
        let current_device_id = self.config.agent.device_id.clone();

        self.config = new_config;

        // 恢复设备 ID (防止配置覆盖丢失 ID)
        if self.config.agent.device_id.is_none() {
            self.config.agent.device_id = current_device_id;
        }

        // 强制覆盖 Server URL 为 Bootstrap 的值 (防止配置错误导致断连)
        self.config.server.base_url = self.bootstrap.server_url.clone();

        info!("已更新内存配置");
        Ok(())
    }

    /// 递归合并 JSON Value
    fn merge_json_value(a: &mut serde_json::Value, b: serde_json::Value) {
        match (a, b) {
            (serde_json::Value::Object(a), serde_json::Value::Object(b)) => {
                for (k, v) in b {
                    Self::merge_json_value(a.entry(k).or_insert(serde_json::Value::Null), v);
                }
            }
            (a, b) => *a = b,
        }
    }

    // Legacy methods placeholders or removed

    /// 获取配置
    pub fn config(&self) -> &AgentConfig {
        &self.config
    }

    /// 更新设备 ID
    pub fn update_device_id(&mut self, device_id: String) -> Result<()> {
        self.config.agent.device_id = Some(device_id);
        Ok(())
    }

    /// 验证配置
    pub fn validate_config(config: &mut AgentConfig) -> Result<()> {
        // 验证服务器 URL
        if config.server.base_url.is_empty() {
            return Err(anyhow!("服务器 URL 不能为空"));
        }

        if !config.server.base_url.starts_with("http://")
            && !config.server.base_url.starts_with("https://")
        {
            return Err(anyhow!("服务器 URL 必须以 http:// 或 https:// 开头"));
        }

        // 验证心跳间隔
        if config.heartbeat.interval == 0 {
            warn!("心跳间隔为 0，设置为默认值 30 秒");
            config.heartbeat.interval = 30;
        }

        // 验证超时设置
        if config.server.connect_timeout == 0 {
            warn!("连接超时为 0，设置为默认值 30 秒");
            config.server.connect_timeout = 30;
        }

        if config.server.request_timeout == 0 {
            warn!("请求超时为 0，设置为默认值 60 秒");
            config.server.request_timeout = 60;
        }

        // 验证日志级别
        let valid_levels = ["trace", "debug", "info", "warn", "error"];
        if !valid_levels.contains(&config.logging.level.as_str()) {
            warn!("无效的日志级别 '{}'，设置为 'info'", config.logging.level);
            config.logging.level = "info".to_string();
        }

        // 验证重连配置
        if config.reconnect.backoff_factor <= 1.0 {
            warn!("退避因子必须大于 1.0，设置为默认值 2.0");
            config.reconnect.backoff_factor = 2.0;
        }

        // 设置默认路径（如果为空）
        Self::set_default_paths(config)?;

        Ok(())
    }

    /// 设置默认路径
    fn set_default_paths(config: &mut AgentConfig) -> Result<()> {
        if config.paths.config_dir.is_empty() {
            config.paths.config_dir = Self::get_default_config_dir()?;
        }

        if config.paths.data_dir.is_empty() {
            config.paths.data_dir = Self::get_default_data_dir()?;
        }

        if config.paths.log_dir.is_empty() {
            config.paths.log_dir = Self::get_default_log_dir()?;
        }

        Ok(())
    }

    /// 获取默认配置目录
    fn get_default_config_dir() -> Result<String> {
        // Use local directory for development/debugging to avoid permission issues and ensure clean state
        return Ok("data_v5".to_string());
    }

    /// 获取默认数据目录
    fn get_default_data_dir() -> Result<String> {
        return Ok("data_v5".to_string());
    }

    /// 获取默认日志目录
    fn get_default_log_dir() -> Result<String> {
        #[cfg(target_os = "windows")]
        return Ok("C:\\ProgramData\\Ruinos Agent\\Logs".to_string());

        #[cfg(target_os = "linux")]
        return Ok("/var/log/ruinos-agent".to_string());

        #[cfg(target_os = "macos")]
        return Ok("/var/log/ruinos-agent".to_string());
    }

    /// 创建默认配置
    fn create_default_config() -> AgentConfig {
        AgentConfig {
            agent: AgentSection {
                name: "rmm-agent".to_string(),
                version: env!("CARGO_PKG_VERSION").to_string(),
                device_id: None,
            },
            server: ServerSection {
                base_url: "https://your-rmm-server.example.com".to_string(),
                enrollment_endpoint: "/agent/enroll".to_string(),
                heartbeat_endpoint: "/agent/heartbeat".to_string(),
                websocket_endpoint: "/sessions".to_string(),
                connect_timeout: 30,
                request_timeout: 60,
            },
            heartbeat: HeartbeatSection {
                interval: 30,
                retry_attempts: 3,
                retry_delay: 5,
            },
            security: SecuritySection {
                certificate: None,
                tls_verify: true,
                certificate_pinning: false,
                certificate_pins: None,
                doh_enabled: false,
                doh_providers: Some(vec![
                    "https://cloudflare-dns.com/dns-query".to_string(),
                    "https://dns.google/dns-query".to_string(),
                    "https://dns.quad9.net/dns-query".to_string(),
                ]),
                ech_enabled: false,
            },
            logging: LoggingSection {
                level: "info".to_string(),
                file_path: None,
                max_file_size: "10MB".to_string(),
                max_files: 5,
            },
            paths: PathsSection {
                config_dir: Self::get_default_config_dir().unwrap_or_default(),
                data_dir: Self::get_default_data_dir().unwrap_or_default(),
                log_dir: Self::get_default_log_dir().unwrap_or_default(),
                credentials_file: "credentials.json".to_string(),
            },
            file_operations: FileOperationsSection {
                max_file_size: "100MB".to_string(),
                allow_hidden_files: false,
                allowed_paths: vec![],
                blocked_paths: vec![
                    "/etc/passwd".to_string(),
                    "/etc/shadow".to_string(),
                    "/root/.ssh".to_string(),
                    "C:\\Windows\\System32".to_string(),
                ],
            },
            commands: CommandsSection {
                default_timeout: 300,
                max_concurrent: 5,
                blocked_commands: vec![
                    "rm -rf /".to_string(),
                    "del /f /s /q C:\\*".to_string(),
                    "format".to_string(),
                    "fdisk".to_string(),
                ],
            },
            reconnect: ReconnectSection {
                initial_delay: 1,
                max_delay: 300,
                backoff_factor: 2.0,
                max_attempts: 0,
                jitter: true,
            },
            service: None,
        }
    }
}

/// 配置工具函数
impl AgentConfig {
    /// 获取心跳间隔 Duration
    pub fn heartbeat_interval(&self) -> Duration {
        Duration::from_secs(self.heartbeat.interval)
    }

    /// 获取连接超时 Duration
    pub fn connect_timeout(&self) -> Duration {
        Duration::from_secs(self.server.connect_timeout)
    }

    /// 获取请求超时 Duration
    pub fn request_timeout(&self) -> Duration {
        Duration::from_secs(self.server.request_timeout)
    }

    /// 获取重连初始延迟 Duration
    pub fn initial_reconnect_delay(&self) -> Duration {
        Duration::from_secs(self.reconnect.initial_delay)
    }

    /// 获取最大重连延迟 Duration
    pub fn max_reconnect_delay(&self) -> Duration {
        Duration::from_secs(self.reconnect.max_delay)
    }

    /// 获取命令默认超时 Duration
    pub fn command_timeout(&self) -> Duration {
        Duration::from_secs(self.commands.default_timeout)
    }

    /// 获取完整的服务器端点 URL
    pub fn get_endpoint_url(&self, endpoint: &str) -> String {
        format!("{}{}", self.server.base_url.trim_end_matches('/'), endpoint)
    }

    /// 获取注册端点 URL
    pub fn enrollment_url(&self) -> String {
        self.get_endpoint_url(&self.server.enrollment_endpoint)
    }

    /// 获取心跳端点 URL
    pub fn heartbeat_url(&self) -> String {
        self.get_endpoint_url(&self.server.heartbeat_endpoint)
    }

    /// 获取 WebSocket 端点 URL
    pub fn websocket_url(&self) -> String {
        let base_url = self.server.base_url.trim_end_matches('/');
        let ws_url = if base_url.starts_with("https://") {
            base_url.replace("https://", "wss://")
        } else if base_url.starts_with("http://") {
            base_url.replace("http://", "ws://")
        } else {
            format!("wss://{}", base_url)
        };

        format!("{}{}", ws_url, self.server.websocket_endpoint)
    }

    /// 获取凭证文件路径
    pub fn credentials_path(&self) -> PathBuf {
        PathBuf::from(&self.paths.data_dir).join(&self.paths.credentials_file)
    }

    /// 解析文件大小字符串为字节数
    pub fn parse_file_size(size_str: &str) -> Result<u64> {
        let size_str = size_str.trim().to_uppercase();

        if let Some(num_str) = size_str.strip_suffix("KB") {
            Ok(num_str.parse::<u64>()? * 1024)
        } else if let Some(num_str) = size_str.strip_suffix("MB") {
            Ok(num_str.parse::<u64>()? * 1024 * 1024)
        } else if let Some(num_str) = size_str.strip_suffix("GB") {
            Ok(num_str.parse::<u64>()? * 1024 * 1024 * 1024)
        } else if let Some(num_str) = size_str.strip_suffix("B") {
            Ok(num_str.parse::<u64>()?)
        } else {
            // 默认为字节
            Ok(size_str.parse::<u64>()?)
        }
    }

    /// 获取最大文件大小（字节）
    pub fn max_file_size_bytes(&self) -> Result<u64> {
        Self::parse_file_size(&self.file_operations.max_file_size)
    }
}
