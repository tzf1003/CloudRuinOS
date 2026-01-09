// server/src/terminal/models.rs
// 终端相关数据模型

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 会话状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, sqlx::Type)]
#[sqlx(type_name = "VARCHAR", rename_all = "lowercase")]
pub enum SessionState {
    Opening,
    Opened,
    Running,
    Closed,
    Failed,
    Disconnected,
}

/// Shell 类型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ShellType {
    Cmd,
    PowerShell,
    Pwsh,
    Sh,
    Bash,
    Zsh,
}

/// 创建会话请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionCreateRequest {
    pub agent_id: String,
    pub shell_type: ShellType,
    pub cwd: Option<String>,
    pub env: Option<HashMap<String, String>>,
    pub cols: u16,
    pub rows: u16,
}

/// 输入请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInputRequest {
    pub session_id: String,
    pub input_data: String,
}

/// 调整窗口请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionResizeRequest {
    pub session_id: String,
    pub cols: u16,
    pub rows: u16,
}

/// 会话信息
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct SessionInfo {
    pub session_id: String,
    pub agent_id: String,
    pub user_id: String,
    pub shell_type: String,
    pub cwd: Option<String>,
    pub env: Option<sqlx::types::Json<HashMap<String, String>>>,
    pub cols: i32,
    pub rows: i32,
    pub state: SessionState,
    pub pid: Option<i32>,
    pub shell_path: Option<String>,
    pub output_cursor: i64,
    pub exit_code: Option<i32>,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: chrono::NaiveDateTime,
    pub closed_at: Option<chrono::NaiveDateTime>,
}

/// 输出记录
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct OutputRecord {
    pub id: i64,
    pub session_id: String,
    pub cursor_start: i64,
    pub cursor_end: i64,
    pub output_data: String,
    pub created_at: chrono::NaiveDateTime,
}

/// 输入记录
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct InputRecord {
    pub id: i64,
    pub session_id: String,
    pub client_seq: i64,
    pub input_data: String,
    pub created_at: chrono::NaiveDateTime,
}

/// Task 类型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "task_type", rename_all = "snake_case")]
pub enum TerminalTask {
    SessionOpen {
        task_id: String,
        revision: u32,
        payload: SessionOpenPayload,
    },
    SessionInput {
        task_id: String,
        revision: u32,
        payload: SessionInputPayload,
    },
    SessionResize {
        task_id: String,
        revision: u32,
        payload: SessionResizePayload,
    },
    SessionClose {
        task_id: String,
        revision: u32,
        payload: SessionClosePayload,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionOpenPayload {
    pub session_id: String,
    pub shell_type: ShellType,
    pub cwd: Option<String>,
    pub env: Option<HashMap<String, String>>,
    pub cols: u16,
    pub rows: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInputPayload {
    pub session_id: String,
    pub client_seq: u64,
    pub input_data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionResizePayload {
    pub session_id: String,
    pub cols: u16,
    pub rows: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionClosePayload {
    pub session_id: String,
    pub force: bool,
}

/// Agent 上报的会话状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionReport {
    pub task_id: String,
    pub status: String,
    pub result: SessionReportResult,
    pub output_cursor: u64,
    pub output_chunk: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionReportResult {
    pub session_id: String,
    pub state: SessionState,
    pub pid: Option<u32>,
    pub shell_path: Option<String>,
    pub exit_code: Option<i32>,
    pub error: Option<String>,
}

/// 输出查询响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutputResponse {
    pub session_id: String,
    pub from_cursor: u64,
    pub to_cursor: u64,
    pub output_data: String,
    pub has_more: bool,
}
