use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};

/// Agent 状态管理器
#[derive(Debug, Clone)]
pub struct StateManager {
    state: Arc<RwLock<AgentState>>,
    state_file_path: PathBuf,
}

/// Agent 状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentState {
    pub device_id: Option<String>,
    pub enrollment_status: EnrollmentStatus,
    pub connection_status: ConnectionStatus,
    pub last_heartbeat: Option<u64>,
    pub last_seen_server: Option<u64>,
    pub session_id: Option<String>,
    pub websocket_url: Option<String>,
    pub config: AgentConfig,
    pub runtime_stats: RuntimeStats,
    pub metadata: HashMap<String, serde_json::Value>,
}

/// 注册状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum EnrollmentStatus {
    NotEnrolled,
    Enrolling,
    Enrolled,
    EnrollmentFailed(String),
}

/// 连接状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ConnectionStatus {
    Disconnected,
    Connecting,
    Connected,
    Reconnecting,
    Failed(String),
}

/// Agent 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub server_url: String,
    pub heartbeat_interval: u64, // 秒
    pub reconnect_interval: u64, // 秒
    pub max_reconnect_attempts: Option<u32>,
    pub request_timeout: u64, // 秒
    pub tls_verify: bool,
    pub doh_enabled: bool,
    pub ech_enabled: bool,
    pub log_level: String,
}

/// 运行时统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeStats {
    pub start_time: u64,
    pub heartbeats_sent: u64,
    pub heartbeats_failed: u64,
    pub commands_received: u64,
    pub commands_executed: u64,
    pub reconnect_count: u64,
    pub last_error: Option<String>,
    pub last_error_time: Option<u64>,
}

impl StateManager {
    /// 创建新的状态管理器
    pub fn new<P: AsRef<Path>>(state_file_path: P) -> Result<Self> {
        let state_file_path = state_file_path.as_ref().to_path_buf();
        
        // 确保状态文件目录存在
        if let Some(parent) = state_file_path.parent() {
            fs::create_dir_all(parent)?;
        }

        let state = if state_file_path.exists() {
            Self::load_state(&state_file_path)?
        } else {
            AgentState::default()
        };

        Ok(Self {
            state: Arc::new(RwLock::new(state)),
            state_file_path,
        })
    }

    /// 加载状态文件
    fn load_state<P: AsRef<Path>>(path: P) -> Result<AgentState> {
        let content = fs::read_to_string(path)?;
        
        // 处理空文件的情况
        if content.trim().is_empty() {
            info!("State file is empty, using default state");
            return Ok(AgentState::default());
        }
        
        let state: AgentState = serde_json::from_str(&content)?;
        info!("Loaded agent state from file");
        Ok(state)
    }

    /// 保存状态到文件
    pub async fn save_state(&self) -> Result<()> {
        let state = self.state.read().await;
        let content = serde_json::to_string_pretty(&*state)?;
        fs::write(&self.state_file_path, content)?;
        debug!("Saved agent state to file");
        Ok(())
    }

    /// 获取状态的只读副本
    pub async fn get_state(&self) -> AgentState {
        self.state.read().await.clone()
    }

    /// 设置设备 ID
    pub async fn set_device_id(&self, device_id: String) -> Result<()> {
        let mut state = self.state.write().await;
        state.device_id = Some(device_id);
        drop(state);
        self.save_state().await
    }

    /// 获取设备 ID
    pub async fn get_device_id(&self) -> Option<String> {
        let state = self.state.read().await;
        state.device_id.clone()
    }

    /// 设置注册状态
    pub async fn set_enrollment_status(&self, status: EnrollmentStatus) -> Result<()> {
        let mut state = self.state.write().await;
        state.enrollment_status = status;
        drop(state);
        self.save_state().await
    }

    /// 获取注册状态
    pub async fn get_enrollment_status(&self) -> EnrollmentStatus {
        let state = self.state.read().await;
        state.enrollment_status.clone()
    }

    /// 设置连接状态
    pub async fn set_connection_status(&self, status: ConnectionStatus) -> Result<()> {
        let mut state = self.state.write().await;
        state.connection_status = status;
        drop(state);
        self.save_state().await
    }

    /// 获取连接状态
    pub async fn get_connection_status(&self) -> ConnectionStatus {
        let state = self.state.read().await;
        state.connection_status.clone()
    }

    /// 更新心跳时间
    pub async fn update_heartbeat(&self) -> Result<()> {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| anyhow!("System time error: {}", e))?
            .as_secs();

        let mut state = self.state.write().await;
        state.last_heartbeat = Some(timestamp);
        state.runtime_stats.heartbeats_sent += 1;
        drop(state);
        self.save_state().await
    }

    /// 记录心跳失败
    pub async fn record_heartbeat_failure(&self, error: String) -> Result<()> {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| anyhow!("System time error: {}", e))?
            .as_secs();

        let mut state = self.state.write().await;
        state.runtime_stats.heartbeats_failed += 1;
        state.runtime_stats.last_error = Some(error);
        state.runtime_stats.last_error_time = Some(timestamp);
        drop(state);
        self.save_state().await
    }

    /// 更新服务器时间
    pub async fn update_server_time(&self, server_time: u64) -> Result<()> {
        let mut state = self.state.write().await;
        state.last_seen_server = Some(server_time);
        drop(state);
        self.save_state().await
    }

    /// 设置会话信息
    pub async fn set_session(&self, session_id: String, websocket_url: String) -> Result<()> {
        let mut state = self.state.write().await;
        state.session_id = Some(session_id);
        state.websocket_url = Some(websocket_url);
        drop(state);
        self.save_state().await
    }

    /// 清除会话信息
    pub async fn clear_session(&self) -> Result<()> {
        let mut state = self.state.write().await;
        state.session_id = None;
        state.websocket_url = None;
        drop(state);
        self.save_state().await
    }

    /// 记录重连
    pub async fn record_reconnect(&self) -> Result<()> {
        let mut state = self.state.write().await;
        state.runtime_stats.reconnect_count += 1;
        drop(state);
        self.save_state().await
    }

    /// 记录命令接收
    pub async fn record_command_received(&self) -> Result<()> {
        let mut state = self.state.write().await;
        state.runtime_stats.commands_received += 1;
        drop(state);
        self.save_state().await
    }

    /// 记录命令执行
    pub async fn record_command_executed(&self) -> Result<()> {
        let mut state = self.state.write().await;
        state.runtime_stats.commands_executed += 1;
        drop(state);
        self.save_state().await
    }

    /// 更新配置
    pub async fn update_config(&self, config: AgentConfig) -> Result<()> {
        let mut state = self.state.write().await;
        state.config = config;
        drop(state);
        self.save_state().await
    }

    /// 获取配置
    pub async fn get_config(&self) -> AgentConfig {
        let state = self.state.read().await;
        state.config.clone()
    }

    /// 设置元数据
    pub async fn set_metadata(&self, key: String, value: serde_json::Value) -> Result<()> {
        let mut state = self.state.write().await;
        state.metadata.insert(key, value);
        drop(state);
        self.save_state().await
    }

    /// 获取元数据
    pub async fn get_metadata(&self, key: &str) -> Option<serde_json::Value> {
        let state = self.state.read().await;
        state.metadata.get(key).cloned()
    }

    /// 获取运行时统计
    pub async fn get_runtime_stats(&self) -> RuntimeStats {
        let state = self.state.read().await;
        state.runtime_stats.clone()
    }

    /// 重置统计信息
    pub async fn reset_stats(&self) -> Result<()> {
        let mut state = self.state.write().await;
        state.runtime_stats = RuntimeStats::default();
        drop(state);
        self.save_state().await
    }
}

impl Default for AgentState {
    fn default() -> Self {
        Self {
            device_id: None,
            enrollment_status: EnrollmentStatus::NotEnrolled,
            connection_status: ConnectionStatus::Disconnected,
            last_heartbeat: None,
            last_seen_server: None,
            session_id: None,
            websocket_url: None,
            config: AgentConfig::default(),
            runtime_stats: RuntimeStats::default(),
            metadata: HashMap::new(),
        }
    }
}

impl Default for AgentConfig {
    fn default() -> Self {
        Self {
            server_url: "https://rmm-server.example.com".to_string(),
            heartbeat_interval: 30, // 30 秒
            reconnect_interval: 5,  // 5 秒
            max_reconnect_attempts: Some(10),
            request_timeout: 30, // 30 秒
            tls_verify: true,
            doh_enabled: false,
            ech_enabled: false,
            log_level: "info".to_string(),
        }
    }
}

impl Default for RuntimeStats {
    fn default() -> Self {
        let start_time = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        Self {
            start_time,
            heartbeats_sent: 0,
            heartbeats_failed: 0,
            commands_received: 0,
            commands_executed: 0,
            reconnect_count: 0,
            last_error: None,
            last_error_time: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

    #[tokio::test]
    async fn test_state_manager_creation() {
        let temp_file = NamedTempFile::new().unwrap();
        let state_manager = StateManager::new(temp_file.path()).unwrap();
        
        // 初始化状态文件
        state_manager.save_state().await.unwrap();
        
        let state = state_manager.get_state().await;
        assert_eq!(state.enrollment_status, EnrollmentStatus::NotEnrolled);
        assert_eq!(state.connection_status, ConnectionStatus::Disconnected);
    }

    #[tokio::test]
    async fn test_device_id_operations() {
        let temp_file = NamedTempFile::new().unwrap();
        let state_manager = StateManager::new(temp_file.path()).unwrap();
        
        // 初始化状态文件
        state_manager.save_state().await.unwrap();
        
        // 初始状态应该没有设备 ID
        assert!(state_manager.get_device_id().await.is_none());
        
        // 设置设备 ID
        let device_id = "test-device-123".to_string();
        state_manager.set_device_id(device_id.clone()).await.unwrap();
        
        // 验证设备 ID 已设置
        assert_eq!(state_manager.get_device_id().await, Some(device_id));
    }

    #[tokio::test]
    async fn test_state_persistence() {
        let temp_file = NamedTempFile::new().unwrap();
        let device_id = "persistent-device-456".to_string();
        
        // 创建状态管理器并设置设备 ID
        {
            let state_manager = StateManager::new(temp_file.path()).unwrap();
            // 初始化状态文件
            state_manager.save_state().await.unwrap();
            
            state_manager.set_device_id(device_id.clone()).await.unwrap();
            state_manager.set_enrollment_status(EnrollmentStatus::Enrolled).await.unwrap();
        }
        
        // 重新加载状态管理器
        {
            let state_manager = StateManager::new(temp_file.path()).unwrap();
            assert_eq!(state_manager.get_device_id().await, Some(device_id));
            assert_eq!(state_manager.get_enrollment_status().await, EnrollmentStatus::Enrolled);
        }
    }

    #[tokio::test]
    async fn test_runtime_stats() {
        let temp_file = NamedTempFile::new().unwrap();
        let state_manager = StateManager::new(temp_file.path()).unwrap();
        
        // 初始化状态文件
        state_manager.save_state().await.unwrap();
        
        // 初始统计应该为 0
        let stats = state_manager.get_runtime_stats().await;
        assert_eq!(stats.heartbeats_sent, 0);
        assert_eq!(stats.commands_received, 0);
        
        // 更新统计
        state_manager.update_heartbeat().await.unwrap();
        state_manager.record_command_received().await.unwrap();
        state_manager.record_command_executed().await.unwrap();
        
        // 验证统计更新
        let stats = state_manager.get_runtime_stats().await;
        assert_eq!(stats.heartbeats_sent, 1);
        assert_eq!(stats.commands_received, 1);
        assert_eq!(stats.commands_executed, 1);
    }

    #[tokio::test]
    async fn test_metadata_operations() {
        let temp_file = NamedTempFile::new().unwrap();
        let state_manager = StateManager::new(temp_file.path()).unwrap();
        
        // 初始化状态文件
        state_manager.save_state().await.unwrap();
        
        // 设置元数据
        let key = "test_key".to_string();
        let value = serde_json::json!({"test": "value"});
        state_manager.set_metadata(key.clone(), value.clone()).await.unwrap();
        
        // 获取元数据
        let retrieved_value = state_manager.get_metadata(&key).await;
        assert_eq!(retrieved_value, Some(value));
        
        // 获取不存在的元数据
        let missing_value = state_manager.get_metadata("missing_key").await;
        assert!(missing_value.is_none());
    }
}