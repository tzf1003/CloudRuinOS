// server/src/terminal/service.rs
// 终端服务层（状态机与任务编排）

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use uuid::Uuid;

use super::models::*;
use super::repository::TerminalRepository;

/// 待下发任务队列
type TaskQueue = Arc<Mutex<HashMap<String, Vec<TerminalTask>>>>;

pub struct TerminalService {
    repo: TerminalRepository,
    task_queue: TaskQueue,
    client_seq_counter: Arc<Mutex<HashMap<String, u64>>>,
}

impl TerminalService {
    pub fn new(repo: TerminalRepository) -> Self {
        Self {
            repo,
            task_queue: Arc::new(Mutex::new(HashMap::new())),
            client_seq_counter: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// 创建会话
    pub async fn create_session(
        &self,
        user_id: &str,
        req: SessionCreateRequest,
    ) -> Result<String, String> {
        let session_id = format!("sess-{}", Uuid::new_v4());
        let task_id = format!("term-open-{}", Uuid::new_v4());

        // 保存到数据库
        self.repo
            .create_session(
                &session_id,
                &req.agent_id,
                user_id,
                &format!("{:?}", req.shell_type).to_lowercase(),
                req.cwd.as_deref(),
                req.env.as_ref(),
                req.cols,
                req.rows,
            )
            .await
            .map_err(|e| format!("Database error: {}", e))?;

        // 创建任务
        let task = TerminalTask::SessionOpen {
            task_id: task_id.clone(),
            revision: 1,
            payload: SessionOpenPayload {
                session_id: session_id.clone(),
                shell_type: req.shell_type,
                cwd: req.cwd,
                env: req.env,
                cols: req.cols,
                rows: req.rows,
            },
        };

        // 加入任务队列
        self.enqueue_task(&req.agent_id, task).await;

        Ok(session_id)
    }

    /// 发送输入
    pub async fn send_input(&self, req: SessionInputRequest) -> Result<(), String> {
        // 获取会话信息
        let session = self
            .repo
            .get_session(&req.session_id)
            .await
            .map_err(|e| format!("Database error: {}", e))?
            .ok_or_else(|| "Session not found".to_string())?;

        if session.state == SessionState::Closed || session.state == SessionState::Failed {
            return Err("Session is closed".to_string());
        }

        // 生成 client_seq
        let client_seq = self.next_client_seq(&req.session_id).await;

        // 保存输入（审计）
        self.repo
            .save_input(&req.session_id, client_seq, &req.input_data)
            .await
            .map_err(|e| format!("Database error: {}", e))?;

        // 创建任务
        let task_id = format!("term-input-{}", Uuid::new_v4());
        let task = TerminalTask::SessionInput {
            task_id,
            revision: 1,
            payload: SessionInputPayload {
                session_id: req.session_id,
                client_seq,
                input_data: req.input_data,
            },
        };

        // 加入任务队列
        self.enqueue_task(&session.agent_id, task).await;

        Ok(())
    }

    /// 调整窗口大小
    pub async fn resize_session(&self, req: SessionResizeRequest) -> Result<(), String> {
        let session = self
            .repo
            .get_session(&req.session_id)
            .await
            .map_err(|e| format!("Database error: {}", e))?
            .ok_or_else(|| "Session not found".to_string())?;

        if session.state == SessionState::Closed || session.state == SessionState::Failed {
            return Err("Session is closed".to_string());
        }

        let task_id = format!("term-resize-{}", Uuid::new_v4());
        let task = TerminalTask::SessionResize {
            task_id,
            revision: 1,
            payload: SessionResizePayload {
                session_id: req.session_id,
                cols: req.cols,
                rows: req.rows,
            },
        };

        self.enqueue_task(&session.agent_id, task).await;

        Ok(())
    }

    /// 关闭会话
    pub async fn close_session(&self, session_id: &str, force: bool) -> Result<(), String> {
        let session = self
            .repo
            .get_session(session_id)
            .await
            .map_err(|e| format!("Database error: {}", e))?
            .ok_or_else(|| "Session not found".to_string())?;

        if session.state == SessionState::Closed {
            return Ok(()); // 幂等
        }

        let task_id = format!("term-close-{}", Uuid::new_v4());
        let task = TerminalTask::SessionClose {
            task_id,
            revision: 1,
            payload: SessionClosePayload {
                session_id: session_id.to_string(),
                force,
            },
        };

        self.enqueue_task(&session.agent_id, task).await;

        Ok(())
    }

    /// 处理 Agent 上报
    pub async fn handle_report(&self, report: SessionReport) -> Result<(), String> {
        let session_id = &report.result.session_id;

        // 获取当前会话状态
        let session = self
            .repo
            .get_session(session_id)
            .await
            .map_err(|e| format!("Database error: {}", e))?
            .ok_or_else(|| "Session not found".to_string())?;

        // 检查 cursor 连续性
        let expected_cursor = session.output_cursor as u64;
        if !report.output_chunk.is_empty() {
            if report.output_cursor < expected_cursor {
                // Agent 的 cursor 回退了，可能是重启或缓冲区溢出
                eprintln!(
                    "Warning: Output cursor rollback for session {}: expected >= {}, got {}",
                    session_id, expected_cursor, report.output_cursor
                );
                // 记录警告但继续处理
            }

            // 保存输出增量
            let cursor_start = expected_cursor;
            let cursor_end = report.output_cursor;

            // 如果有 cursor 跳跃，插入占位符
            if cursor_start < cursor_end && report.output_chunk.is_empty() {
                // 空输出但 cursor 增加，可能是数据丢失
                let placeholder = format!(
                    "\r\n[Warning: {} bytes of output data lost due to buffer overflow]\r\n",
                    cursor_end - cursor_start
                );
                self.repo
                    .save_output(session_id, cursor_start, cursor_end, &placeholder)
                    .await
                    .map_err(|e| format!("Database error: {}", e))?;
            } else if !report.output_chunk.is_empty() {
                self.repo
                    .save_output(session_id, cursor_start, cursor_end, &report.output_chunk)
                    .await
                    .map_err(|e| format!("Database error: {}", e))?;
            }
        }

        // 更新会话状态
        self.repo
            .update_session_state(
                session_id,
                report.result.state.clone(),
                report.result.pid,
                report.result.shell_path.as_deref(),
                report.output_cursor,
                report.result.exit_code,
            )
            .await
            .map_err(|e| format!("Database error: {}", e))?;

        // 如果会话已关闭，更新数据库
        if report.result.state == SessionState::Closed {
            self.repo
                .close_session(session_id, report.result.exit_code)
                .await
                .map_err(|e| format!("Database error: {}", e))?;
        }

        Ok(())
    }

    /// 获取输出
    pub async fn get_output(
        &self,
        session_id: &str,
        from_cursor: u64,
    ) -> Result<OutputResponse, String> {
        let outputs = self
            .repo
            .get_outputs(session_id, from_cursor, 100)
            .await
            .map_err(|e| format!("Database error: {}", e))?;

        if outputs.is_empty() {
            return Ok(OutputResponse {
                session_id: session_id.to_string(),
                from_cursor,
                to_cursor: from_cursor,
                output_data: String::new(),
                has_more: false,
            });
        }

        let mut combined_output = String::new();
        let mut to_cursor = from_cursor;

        for output in &outputs {
            combined_output.push_str(&output.output_data);
            to_cursor = output.cursor_end as u64;
        }

        Ok(OutputResponse {
            session_id: session_id.to_string(),
            from_cursor,
            to_cursor,
            output_data: combined_output,
            has_more: outputs.len() == 100,
        })
    }

    /// 获取待下发任务（心跳响应）
    pub async fn get_pending_tasks(&self, agent_id: &str) -> Vec<TerminalTask> {
        let mut queue = self.task_queue.lock().await;
        queue.remove(agent_id).unwrap_or_default()
    }

    /// 加入任务队列
    async fn enqueue_task(&self, agent_id: &str, task: TerminalTask) {
        let mut queue = self.task_queue.lock().await;
        queue
            .entry(agent_id.to_string())
            .or_insert_with(Vec::new)
            .push(task);
    }

    /// 生成下一个 client_seq
    async fn next_client_seq(&self, session_id: &str) -> u64 {
        let mut counter = self.client_seq_counter.lock().await;
        let seq = counter.entry(session_id.to_string()).or_insert(0);
        *seq += 1;
        *seq
    }

    /// 列出用户会话
    pub async fn list_sessions(&self, user_id: &str) -> Result<Vec<SessionInfo>, String> {
        self.repo
            .list_user_sessions(user_id)
            .await
            .map_err(|e| format!("Database error: {}", e))
    }

    /// 清理超时会话
    pub async fn cleanup_stale_sessions(&self) -> Result<u64, String> {
        self.repo
            .cleanup_stale_sessions(30)
            .await
            .map_err(|e| format!("Database error: {}", e))
    }
}
