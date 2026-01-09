// agent/src/task_handler.rs
// Agent 端任务处理器（集成终端任务）

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

use crate::terminal::{TerminalManager, SessionConfig, ShellType};

/// 会话 cursor 追踪器
pub struct SessionCursorTracker {
    last_reported_cursors: Arc<std::sync::Mutex<HashMap<String, u64>>>,
}

impl SessionCursorTracker {
    pub fn new() -> Self {
        Self {
            last_reported_cursors: Arc::new(std::sync::Mutex::new(HashMap::new())),
        }
    }

    /// 获取上次上报的 cursor
    pub fn get_last_cursor(&self, session_id: &str) -> u64 {
        self.last_reported_cursors
            .lock()
            .unwrap()
            .get(session_id)
            .copied()
            .unwrap_or(0)
    }

    /// 更新上报的 cursor
    pub fn update_cursor(&self, session_id: &str, cursor: u64) {
        self.last_reported_cursors
            .lock()
            .unwrap()
            .insert(session_id.to_string(), cursor);
    }

    /// 移除会话的 cursor 记录
    pub fn remove_session(&self, session_id: &str) {
        self.last_reported_cursors
            .lock()
            .unwrap()
            .remove(session_id);
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "task_type", rename_all = "snake_case")]
pub enum Task {
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
    // 其他任务类型...
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionOpenPayload {
    pub session_id: String,
    pub shell_type: ShellType,
    pub cwd: Option<String>,
    pub env: Option<std::collections::HashMap<String, String>>,
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
    #[serde(default)]
    pub force: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskReport {
    pub task_id: String,
    pub status: String,
    pub result: serde_json::Value,
    pub output_cursor: u64,
    pub output_chunk: String,
}

pub struct TaskHandler {
    terminal_manager: Arc<TerminalManager>,
    cursor_tracker: SessionCursorTracker,
}

impl TaskHandler {
    pub fn new(terminal_manager: Arc<TerminalManager>) -> Self {
        Self {
            terminal_manager,
            cursor_tracker: SessionCursorTracker::new(),
        }
    }

    /// 处理任务
    pub fn handle_task(&self, task: Task) -> TaskReport {
        match task {
            Task::SessionOpen { task_id, payload, .. } => {
                self.handle_session_open(task_id, payload)
            }
            Task::SessionInput { task_id, payload, .. } => {
                self.handle_session_input(task_id, payload)
            }
            Task::SessionResize { task_id, payload, .. } => {
                self.handle_session_resize(task_id, payload)
            }
            Task::SessionClose { task_id, payload, .. } => {
                self.handle_session_close(task_id, payload)
            }
        }
    }

    /// 处理 session_open
    fn handle_session_open(&self, task_id: String, payload: SessionOpenPayload) -> TaskReport {
        let config = SessionConfig {
            session_id: payload.session_id.clone(),
            shell_type: payload.shell_type,
            cwd: payload.cwd,
            env: payload.env,
            cols: payload.cols,
            rows: payload.rows,
        };

        match self.terminal_manager.create_session(config) {
            Ok(session) => {
                let state = session.get_state();
                let pid = session.get_pid();
                let shell_path = session.get_shell_path();
                let cursor = session.get_output_cursor();

                TaskReport {
                    task_id,
                    status: "completed".to_string(),
                    result: serde_json::json!({
                        "session_id": payload.session_id,
                        "state": state,
                        "pid": pid,
                        "shell_path": shell_path,
                        "error": null,
                    }),
                    output_cursor: cursor,
                    output_chunk: String::new(),
                }
            }
            Err(e) => TaskReport {
                task_id,
                status: "failed".to_string(),
                result: serde_json::json!({
                    "session_id": payload.session_id,
                    "state": "failed",
                    "pid": null,
                    "shell_path": null,
                    "error": e.to_string(),
                }),
                output_cursor: 0,
                output_chunk: String::new(),
            },
        }
    }

    /// 处理 session_input
    fn handle_session_input(&self, task_id: String, payload: SessionInputPayload) -> TaskReport {
        match self.terminal_manager.get_session(&payload.session_id) {
            Some(session) => {
                let input_bytes = payload.input_data.as_bytes();
                match session.write_input(payload.client_seq, input_bytes) {
                    Ok(bytes_written) => {
                        // 获取输出增量
                        let last_cursor = self.cursor_tracker.get_last_cursor(&payload.session_id);
                        let current_cursor = session.get_output_cursor();

                        let (new_cursor, chunk) = match session.get_output_chunk(last_cursor) {
                            Ok((cursor, data)) => (cursor, data),
                            Err(crate::terminal::session::BufferError::DataLost {
                                oldest_available,
                                ..
                            }) => {
                                // 数据丢失，从最旧可用位置开始
                                eprintln!(
                                    "Warning: Output data lost for session {}, resetting cursor from {} to {}",
                                    payload.session_id, last_cursor, oldest_available
                                );
                                session
                                    .get_output_chunk(oldest_available)
                                    .unwrap_or((current_cursor, Vec::new()))
                            }
                            Err(_) => (current_cursor, Vec::new()),
                        };

                        self.cursor_tracker
                            .update_cursor(&payload.session_id, new_cursor);

                        TaskReport {
                            task_id,
                            status: "completed".to_string(),
                            result: serde_json::json!({
                                "session_id": payload.session_id,
                                "client_seq": payload.client_seq,
                                "bytes_written": bytes_written,
                            }),
                            output_cursor: new_cursor,
                            output_chunk: String::from_utf8_lossy(&chunk).to_string(),
                        }
                    }
                    Err(e) => TaskReport {
                        task_id,
                        status: "failed".to_string(),
                        result: serde_json::json!({
                            "session_id": payload.session_id,
                            "error": e.to_string(),
                        }),
                        output_cursor: session.get_output_cursor(),
                        output_chunk: String::new(),
                    },
                }
            }
            None => TaskReport {
                task_id,
                status: "failed".to_string(),
                result: serde_json::json!({
                    "session_id": payload.session_id,
                    "error": "Session not found",
                }),
                output_cursor: 0,
                output_chunk: String::new(),
            },
        }
    }

    /// 处理 session_resize
    fn handle_session_resize(&self, task_id: String, payload: SessionResizePayload) -> TaskReport {
        match self.terminal_manager.get_session(&payload.session_id) {
            Some(session) => match session.resize(payload.cols, payload.rows) {
                Ok(_) => TaskReport {
                    task_id,
                    status: "completed".to_string(),
                    result: serde_json::json!({
                        "session_id": payload.session_id,
                        "cols": payload.cols,
                        "rows": payload.rows,
                    }),
                    output_cursor: session.get_output_cursor(),
                    output_chunk: String::new(),
                },
                Err(e) => TaskReport {
                    task_id,
                    status: "failed".to_string(),
                    result: serde_json::json!({
                        "session_id": payload.session_id,
                        "error": e.to_string(),
                    }),
                    output_cursor: session.get_output_cursor(),
                    output_chunk: String::new(),
                },
            },
            None => TaskReport {
                task_id,
                status: "failed".to_string(),
                result: serde_json::json!({
                    "session_id": payload.session_id,
                    "error": "Session not found",
                }),
                output_cursor: 0,
                output_chunk: String::new(),
            },
        }
    }

    /// 处理 session_close
    fn handle_session_close(&self, task_id: String, payload: SessionClosePayload) -> TaskReport {
        match self.terminal_manager.get_session(&payload.session_id) {
            Some(session) => {
                let last_cursor = self.cursor_tracker.get_last_cursor(&payload.session_id);
                let (final_cursor, final_chunk) = session
                    .get_output_chunk(last_cursor)
                    .unwrap_or_else(|_| (session.get_output_cursor(), Vec::new()));

                match session.close(payload.force) {
                    Ok(exit_code) => {
                        self.terminal_manager.remove_session(&payload.session_id);
                        self.cursor_tracker.remove_session(&payload.session_id);

                        TaskReport {
                            task_id,
                            status: "completed".to_string(),
                            result: serde_json::json!({
                                "session_id": payload.session_id,
                                "state": "closed",
                                "exit_code": exit_code,
                            }),
                            output_cursor: final_cursor,
                            output_chunk: String::from_utf8_lossy(&final_chunk).to_string(),
                        }
                    }
                    Err(e) => TaskReport {
                        task_id,
                        status: "failed".to_string(),
                        result: serde_json::json!({
                            "session_id": payload.session_id,
                            "error": e.to_string(),
                        }),
                        output_cursor: final_cursor,
                        output_chunk: String::from_utf8_lossy(&final_chunk).to_string(),
                    },
                }
            }
            None => TaskReport {
                task_id,
                status: "completed".to_string(), // 幂等：已关闭
                result: serde_json::json!({
                    "session_id": payload.session_id,
                    "state": "closed",
                    "exit_code": null,
                }),
                output_cursor: 0,
                output_chunk: String::new(),
            },
        }
    }

    /// 收集所有会话的输出增量（用于心跳）
    pub fn collect_output_reports(&self) -> Vec<TaskReport> {
        let sessions = self.terminal_manager.list_sessions();
        let mut reports = Vec::new();

        for info in sessions {
            if let Some(session) = self.terminal_manager.get_session(&info.session_id) {
                let last_cursor = self.cursor_tracker.get_last_cursor(&info.session_id);
                let current_cursor = session.get_output_cursor();

                // 只有当有新输出时才上报
                if current_cursor > last_cursor {
                    match session.get_output_chunk(last_cursor) {
                        Ok((new_cursor, chunk)) => {
                            if !chunk.is_empty() {
                                self.cursor_tracker.update_cursor(&info.session_id, new_cursor);

                                reports.push(TaskReport {
                                    task_id: format!("heartbeat-{}", info.session_id),
                                    status: "running".to_string(),
                                    result: serde_json::json!({
                                        "session_id": info.session_id,
                                        "state": info.state,
                                        "pid": info.pid,
                                    }),
                                    output_cursor: new_cursor,
                                    output_chunk: String::from_utf8_lossy(&chunk).to_string(),
                                });
                            }
                        }
                        Err(crate::terminal::session::BufferError::DataLost {
                            oldest_available,
                            ..
                        }) => {
                            // 数据丢失，从最旧可用位置重新开始
                            eprintln!(
                                "Warning: Output data lost for session {}, resetting cursor to {}",
                                info.session_id, oldest_available
                            );
                            if let Ok((new_cursor, chunk)) =
                                session.get_output_chunk(oldest_available)
                            {
                                self.cursor_tracker.update_cursor(&info.session_id, new_cursor);

                                reports.push(TaskReport {
                                    task_id: format!("heartbeat-{}", info.session_id),
                                    status: "running".to_string(),
                                    result: serde_json::json!({
                                        "session_id": info.session_id,
                                        "state": info.state,
                                        "pid": info.pid,
                                        "warning": "Output buffer overflow, some data may be lost",
                                    }),
                                    output_cursor: new_cursor,
                                    output_chunk: String::from_utf8_lossy(&chunk).to_string(),
                                });
                            }
                        }
                        Err(_) => {
                            // 其他错误，跳过
                        }
                    }
                }
            }
        }

        reports
    }
}
