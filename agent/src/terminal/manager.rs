// agent/src/terminal/manager.rs
// 终端会话管理器

use std::collections::HashMap;
use std::io;
use std::sync::{Arc, Mutex};
use serde::{Deserialize, Serialize};

use super::session::{SessionConfig, SessionState, TerminalSession};

/// 终端管理器
pub struct TerminalManager {
    sessions: Arc<Mutex<HashMap<String, Arc<TerminalSession>>>>,
    max_sessions: usize,
}

impl TerminalManager {
    /// 创建新的管理器
    pub fn new(max_sessions: usize) -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            max_sessions,
        }
    }

    /// 创建新会话
    pub fn create_session(&self, config: SessionConfig) -> io::Result<Arc<TerminalSession>> {
        let mut sessions = self.sessions.lock().unwrap();

        // 检查并发限制
        if sessions.len() >= self.max_sessions {
            return Err(io::Error::new(
                io::ErrorKind::ResourceBusy,
                format!("Maximum sessions limit reached: {}", self.max_sessions),
            ));
        }

        // 检查是否已存在
        if sessions.contains_key(&config.session_id) {
            return Err(io::Error::new(
                io::ErrorKind::AlreadyExists,
                format!("Session already exists: {}", config.session_id),
            ));
        }

        let session = Arc::new(TerminalSession::new(config.clone())?);
        session.start(config.clone())?;

        sessions.insert(config.session_id.clone(), Arc::clone(&session));

        Ok(session)
    }

    /// 获取会话
    pub fn get_session(&self, session_id: &str) -> Option<Arc<TerminalSession>> {
        let sessions = self.sessions.lock().unwrap();
        sessions.get(session_id).cloned()
    }

    /// 移除会话
    pub fn remove_session(&self, session_id: &str) -> Option<Arc<TerminalSession>> {
        let mut sessions = self.sessions.lock().unwrap();
        sessions.remove(session_id)
    }

    /// 列出所有会话
    pub fn list_sessions(&self) -> Vec<SessionInfo> {
        let sessions = self.sessions.lock().unwrap();
        sessions
            .iter()
            .map(|(id, session)| SessionInfo {
                session_id: id.clone(),
                state: session.get_state(),
                pid: session.get_pid(),
                shell_path: session.get_shell_path(),
                output_cursor: session.get_output_cursor(),
            })
            .collect()
    }

    /// 清理已关闭的会话
    pub fn cleanup_closed_sessions(&self) {
        let mut sessions = self.sessions.lock().unwrap();
        sessions.retain(|_, session| {
            let state = session.get_state();
            state != SessionState::Closed && state != SessionState::Failed
        });
    }
}

/// 会话信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub session_id: String,
    pub state: SessionState,
    pub pid: Option<u32>,
    pub shell_path: Option<String>,
    pub output_cursor: u64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::terminal::session::ShellType;

    #[test]
    fn test_manager_max_sessions() {
        let manager = TerminalManager::new(2);

        let config1 = SessionConfig {
            session_id: "sess1".to_string(),
            shell_type: ShellType::Bash,
            cwd: None,
            env: None,
            cols: 80,
            rows: 24,
        };

        let config2 = SessionConfig {
            session_id: "sess2".to_string(),
            shell_type: ShellType::Bash,
            cwd: None,
            env: None,
            cols: 80,
            rows: 24,
        };

        let config3 = SessionConfig {
            session_id: "sess3".to_string(),
            shell_type: ShellType::Bash,
            cwd: None,
            env: None,
            cols: 80,
            rows: 24,
        };

        // 前两个应该成功
        assert!(manager.create_session(config1).is_ok());
        assert!(manager.create_session(config2).is_ok());

        // 第三个应该失败
        assert!(manager.create_session(config3).is_err());
    }
}
