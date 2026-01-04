use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

/// 心跳请求协议
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeartbeatRequest {
    pub device_id: String,
    pub timestamp: u64,
    pub nonce: String,
    pub protocol_version: String,
    pub signature: String, // Ed25519 签名
    pub system_info: SystemInfo,
}

/// 心跳响应协议
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeartbeatResponse {
    pub status: HeartbeatStatus,
    pub server_time: u64,
    pub next_heartbeat: u64,
    pub commands: Option<Vec<Command>>,
}

/// 系统信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemInfo {
    pub platform: String,
    pub version: String,
    pub uptime: u64,
}

/// 心跳状态
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HeartbeatStatus {
    Ok,
    Error,
}

/// 命令定义
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Command {
    pub id: String,
    pub command_type: CommandType,
    pub payload: serde_json::Value,
}

/// 命令类型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CommandType {
    Upgrade,
    Execute,
    FileList,
    FileGet,
    FilePut,
}

/// WebSocket 消息类型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum WSMessage {
    #[serde(rename = "auth")]
    Auth {
        device_id: String,
        signature: String,
    },
    #[serde(rename = "cmd")]
    Cmd {
        id: String,
        command: String,
        args: Vec<String>,
    },
    #[serde(rename = "cmd_result")]
    CmdResult {
        id: String,
        exit_code: i32,
        stdout: String,
        stderr: String,
    },
    #[serde(rename = "fs_list")]
    FsList {
        id: String,
        path: String,
    },
    #[serde(rename = "fs_list_result")]
    FsListResult {
        id: String,
        files: Vec<FileInfo>,
    },
    #[serde(rename = "fs_get")]
    FsGet {
        id: String,
        path: String,
    },
    #[serde(rename = "fs_get_result")]
    FsGetResult {
        id: String,
        content: String,
        checksum: String,
    },
    #[serde(rename = "fs_put")]
    FsPut {
        id: String,
        path: String,
        content: String,
        checksum: String,
    },
    #[serde(rename = "fs_put_result")]
    FsPutResult {
        id: String,
        success: bool,
        error: Option<String>,
    },
    #[serde(rename = "presence")]
    Presence {
        status: PresenceStatus,
    },
    #[serde(rename = "error")]
    Error {
        code: String,
        message: String,
    },
    #[serde(rename = "audit_ref")]
    AuditRef {
        log_id: u64,
    },
}

/// 文件信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileInfo {
    pub path: String,
    pub size: u64,
    pub is_dir: bool,
    pub modified: Option<u64>,
}

/// 在线状态
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PresenceStatus {
    Online,
    Busy,
    Idle,
}

/// 设备注册请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnrollmentRequest {
    pub token: String,
    pub public_key: String,
    pub platform: String,
    pub version: String,
}

/// 设备注册响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnrollmentResponse {
    pub device_id: String,
    pub status: EnrollmentStatus,
    pub message: Option<String>,
}

/// 注册状态
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EnrollmentStatus {
    Success,
    Error,
}

impl HeartbeatRequest {
    pub fn new(
        device_id: String,
        nonce: String,
        signature: String,
        system_info: SystemInfo,
    ) -> Self {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        Self {
            device_id,
            timestamp,
            nonce,
            protocol_version: "1.0".to_string(),
            signature,
            system_info,
        }
    }
}

impl SystemInfo {
    pub fn current() -> Self {
        Self {
            platform: std::env::consts::OS.to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            uptime: 0, // TODO: 实现系统运行时间获取
        }
    }
}