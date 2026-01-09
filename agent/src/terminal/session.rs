// agent/src/terminal/session.rs
// 单个终端会话的状态与逻辑

use std::collections::HashMap;
use std::io::{self, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use serde::{Deserialize, Serialize};

#[cfg(unix)]
use crate::terminal::pty::unix::UnixPty;
#[cfg(windows)]
use crate::terminal::pty::windows::WindowsPty;

/// Shell 类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ShellType {
    Cmd,
    PowerShell,
    Pwsh,
    Sh,
    Bash,
    Zsh,
}

impl ShellType {
    /// 获取 shell 可执行文件路径
    pub fn get_shell_path(&self) -> io::Result<String> {
        match self {
            #[cfg(windows)]
            ShellType::Cmd => Ok("cmd.exe".to_string()),
            #[cfg(windows)]
            ShellType::PowerShell => Ok("powershell.exe".to_string()),
            #[cfg(windows)]
            ShellType::Pwsh => Ok("pwsh.exe".to_string()),
            
            #[cfg(unix)]
            ShellType::Sh => Ok("/bin/sh".to_string()),
            #[cfg(unix)]
            ShellType::Bash => Ok("/bin/bash".to_string()),
            #[cfg(unix)]
            ShellType::Zsh => {
                // 尝试常见路径
                if std::path::Path::new("/bin/zsh").exists() {
                    Ok("/bin/zsh".to_string())
                } else if std::path::Path::new("/usr/bin/zsh").exists() {
                    Ok("/usr/bin/zsh".to_string())
                } else {
                    Err(io::Error::new(io::ErrorKind::NotFound, "zsh not found"))
                }
            }
            
            #[cfg(not(any(unix, windows)))]
            _ => Err(io::Error::new(io::ErrorKind::Unsupported, "Unsupported platform")),
        }
    }
}

/// 会话状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SessionState {
    Opening,
    Opened,
    Running,
    Closed,
    Failed,
}

/// 终端会话配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionConfig {
    pub session_id: String,
    pub shell_type: ShellType,
    pub cwd: Option<String>,
    pub env: Option<HashMap<String, String>>,
    pub cols: u16,
    pub rows: u16,
}

/// 终端会话
pub struct TerminalSession {
    pub session_id: String,
    pub state: Arc<Mutex<SessionState>>,
    pub pid: Arc<Mutex<Option<u32>>>,
    pub shell_path: Arc<Mutex<Option<String>>>,
    pub output_cursor: Arc<Mutex<u64>>,
    pub output_buffer: Arc<Mutex<RingBuffer>>,
    pub last_client_seq: Arc<Mutex<u64>>,
    
    #[cfg(unix)]
    pty: Arc<Mutex<Option<UnixPty>>>,
    #[cfg(windows)]
    pty: Arc<Mutex<Option<WindowsPty>>>,
    
    reader_thread: Arc<Mutex<Option<thread::JoinHandle<()>>>>,
}

/// 环形缓冲区（10MB）
pub struct RingBuffer {
    buffer: Vec<u8>,
    capacity: usize,
    write_pos: usize,
    total_written: u64,
    oldest_available_cursor: u64, // 最旧可用数据的 cursor
}

impl RingBuffer {
    pub fn new(capacity: usize) -> Self {
        Self {
            buffer: Vec::with_capacity(capacity),
            capacity,
            write_pos: 0,
            total_written: 0,
            oldest_available_cursor: 0,
        }
    }

    /// 写入数据
    pub fn write(&mut self, data: &[u8]) {
        for &byte in data {
            if self.buffer.len() < self.capacity {
                self.buffer.push(byte);
            } else {
                self.buffer[self.write_pos] = byte;
                // 缓冲区已满，更新最旧可用 cursor
                self.oldest_available_cursor = self.total_written - self.capacity as u64 + 1;
            }
            self.write_pos = (self.write_pos + 1) % self.capacity;
            self.total_written += 1;
        }
    }

    /// 读取从 cursor 开始的数据
    pub fn read_from(&self, cursor: u64) -> Result<Vec<u8>, BufferError> {
        if cursor > self.total_written {
            return Err(BufferError::CursorTooLarge); // cursor 超出范围
        }

        let available = self.total_written - cursor;
        if available == 0 {
            return Ok(Vec::new()); // 无新数据
        }

        // 如果请求的数据已被覆盖
        if cursor < self.oldest_available_cursor {
            return Err(BufferError::DataLost {
                requested_cursor: cursor,
                oldest_available: self.oldest_available_cursor,
            });
        }

        // 计算实际可读取的数据量
        let actual_available = std::cmp::min(available, self.buffer.len() as u64);
        let start_offset = if self.buffer.len() < self.capacity {
            cursor as usize
        } else {
            ((cursor % self.capacity as u64) as usize)
        };
        
        let len = actual_available as usize;
        let mut result = Vec::with_capacity(len);
        
        for i in 0..len {
            let pos = (start_offset + i) % self.buffer.len();
            result.push(self.buffer[pos]);
        }

        Ok(result)
    }

    pub fn total_written(&self) -> u64 {
        self.total_written
    }

    pub fn oldest_available_cursor(&self) -> u64 {
        self.oldest_available_cursor
    }
}

/// 缓冲区错误类型
#[derive(Debug)]
pub enum BufferError {
    CursorTooLarge,
    DataLost {
        requested_cursor: u64,
        oldest_available: u64,
    },
}

impl TerminalSession {
    /// 创建新会话
    pub fn new(config: SessionConfig) -> io::Result<Self> {
        let session_id = config.session_id.clone();
        let state = Arc::new(Mutex::new(SessionState::Opening));
        
        Ok(Self {
            session_id,
            state,
            pid: Arc::new(Mutex::new(None)),
            shell_path: Arc::new(Mutex::new(None)),
            output_cursor: Arc::new(Mutex::new(0)),
            output_buffer: Arc::new(Mutex::new(RingBuffer::new(10 * 1024 * 1024))), // 10MB
            last_client_seq: Arc::new(Mutex::new(0)),
            pty: Arc::new(Mutex::new(None)),
            reader_thread: Arc::new(Mutex::new(None)),
        })
    }

    /// 启动会话
    pub fn start(&self, config: SessionConfig) -> io::Result<()> {
        let shell_path = config.shell_type.get_shell_path()?;
        
        #[cfg(unix)]
        let mut pty = UnixPty::new(config.cols, config.rows)?;
        #[cfg(windows)]
        let mut pty = WindowsPty::new(config.cols, config.rows)?;

        let pid = pty.spawn(&shell_path, config.cwd.as_deref(), config.env.as_ref())?;

        *self.pid.lock().unwrap() = Some(pid);
        *self.shell_path.lock().unwrap() = Some(shell_path);
        *self.state.lock().unwrap() = SessionState::Opened;

        // 启动输出读取线程
        self.start_reader_thread(pty)?;

        Ok(())
    }

    /// 启动输出读取线程
    #[cfg(unix)]
    fn start_reader_thread(&self, pty: UnixPty) -> io::Result<()> {
        let output_buffer = Arc::clone(&self.output_buffer);
        let output_cursor = Arc::clone(&self.output_cursor);
        let state = Arc::clone(&self.state);
        let pty = Arc::new(Mutex::new(Some(pty)));

        let handle = thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                let pty_guard = pty.lock().unwrap();
                if pty_guard.is_none() {
                    break;
                }
                let pty_ref = pty_guard.as_ref().unwrap();

                match pty_ref.read(&mut buf) {
                    Ok(0) => {
                        // EOF
                        *state.lock().unwrap() = SessionState::Closed;
                        break;
                    }
                    Ok(n) => {
                        let data = &buf[..n];
                        output_buffer.lock().unwrap().write(data);
                        *output_cursor.lock().unwrap() += n as u64;
                    }
                    Err(e) if e.kind() == io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(10));
                    }
                    Err(_) => {
                        *state.lock().unwrap() = SessionState::Failed;
                        break;
                    }
                }
            }
        });

        *self.reader_thread.lock().unwrap() = Some(handle);
        *self.pty.lock().unwrap() = Some(pty.lock().unwrap().take().unwrap());

        Ok(())
    }

    #[cfg(windows)]
    fn start_reader_thread(&self, pty: WindowsPty) -> io::Result<()> {
        let output_buffer = Arc::clone(&self.output_buffer);
        let output_cursor = Arc::clone(&self.output_cursor);
        let state = Arc::clone(&self.state);
        let pty = Arc::new(Mutex::new(Some(pty)));

        let handle = thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                let pty_guard = pty.lock().unwrap();
                if pty_guard.is_none() {
                    break;
                }
                let pty_ref = pty_guard.as_ref().unwrap();

                match pty_ref.read(&mut buf) {
                    Ok(0) => {
                        *state.lock().unwrap() = SessionState::Closed;
                        break;
                    }
                    Ok(n) => {
                        let data = &buf[..n];
                        // Windows ConPTY 输出已是 UTF-8（如果配置正确）
                        output_buffer.lock().unwrap().write(data);
                        *output_cursor.lock().unwrap() += n as u64;
                    }
                    Err(e) if e.kind() == io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(10));
                    }
                    Err(_) => {
                        *state.lock().unwrap() = SessionState::Failed;
                        break;
                    }
                }
            }
        });

        *self.reader_thread.lock().unwrap() = Some(handle);
        *self.pty.lock().unwrap() = Some(pty.lock().unwrap().take().unwrap());

        Ok(())
    }

    /// 写入输入（带去重）
    pub fn write_input(&self, client_seq: u64, data: &[u8]) -> io::Result<usize> {
        let mut last_seq = self.last_client_seq.lock().unwrap();
        if client_seq <= *last_seq {
            // 重复输入，忽略
            return Ok(0);
        }

        let pty_guard = self.pty.lock().unwrap();
        if let Some(ref pty) = *pty_guard {
            let written = pty.write(data)?;
            *last_seq = client_seq;
            Ok(written)
        } else {
            Err(io::Error::new(io::ErrorKind::NotConnected, "PTY not initialized"))
        }
    }

    /// 调整窗口大小
    pub fn resize(&self, cols: u16, rows: u16) -> io::Result<()> {
        let pty_guard = self.pty.lock().unwrap();
        if let Some(ref pty) = *pty_guard {
            pty.resize(cols, rows)
        } else {
            Err(io::Error::new(io::ErrorKind::NotConnected, "PTY not initialized"))
        }
    }

    /// 获取输出增量
    pub fn get_output_chunk(&self, from_cursor: u64) -> Result<(u64, Vec<u8>), BufferError> {
        let buffer = self.output_buffer.lock().unwrap();
        let current_cursor = *self.output_cursor.lock().unwrap();
        
        if from_cursor > current_cursor {
            return Err(BufferError::CursorTooLarge);
        }

        let data = buffer.read_from(from_cursor)?;
        Ok((current_cursor, data))
    }

    /// 获取最旧可用 cursor
    pub fn get_oldest_available_cursor(&self) -> u64 {
        self.output_buffer.lock().unwrap().oldest_available_cursor()
    }

    /// 关闭会话
    pub fn close(&self, force: bool) -> io::Result<Option<i32>> {
        *self.state.lock().unwrap() = SessionState::Closed;

        let pty_guard = self.pty.lock().unwrap();
        if let Some(ref pty) = *pty_guard {
            pty.close(force)?;
        }

        // 等待读取线程结束
        if let Some(handle) = self.reader_thread.lock().unwrap().take() {
            let _ = handle.join();
        }

        // 获取退出码（平台相关）
        #[cfg(unix)]
        {
            if let Some(ref pty) = *pty_guard {
                return Ok(pty.get_exit_code());
            }
        }
        #[cfg(windows)]
        {
            if let Some(ref pty) = *pty_guard {
                return Ok(pty.get_exit_code());
            }
        }

        Ok(None)
    }

    /// 获取当前状态
    pub fn get_state(&self) -> SessionState {
        self.state.lock().unwrap().clone()
    }

    /// 获取 PID
    pub fn get_pid(&self) -> Option<u32> {
        *self.pid.lock().unwrap()
    }

    /// 获取 shell 路径
    pub fn get_shell_path(&self) -> Option<String> {
        self.shell_path.lock().unwrap().clone()
    }

    /// 获取当前输出游标
    pub fn get_output_cursor(&self) -> u64 {
        *self.output_cursor.lock().unwrap()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ring_buffer() {
        let mut buf = RingBuffer::new(10);
        
        buf.write(b"hello");
        assert_eq!(buf.total_written(), 5);
        assert_eq!(buf.read_from(0).unwrap(), b"hello");
        
        buf.write(b"world!");
        assert_eq!(buf.total_written(), 11);
        // 缓冲区只有 10 字节，最早的 'h' 被覆盖
        assert_eq!(buf.read_from(1).unwrap(), b"elloworld!");
        
        // 请求已丢失的数据
        match buf.read_from(0) {
            Err(BufferError::DataLost { requested_cursor, oldest_available }) => {
                assert_eq!(requested_cursor, 0);
                assert_eq!(oldest_available, 1);
            }
            _ => panic!("Expected DataLost error"),
        }
    }

    #[test]
    fn test_ring_buffer_no_data_loss() {
        let mut buf = RingBuffer::new(100);
        
        buf.write(b"test");
        assert_eq!(buf.oldest_available_cursor(), 0);
        assert_eq!(buf.read_from(0).unwrap(), b"test");
        assert_eq!(buf.read_from(2).unwrap(), b"st");
    }
}
