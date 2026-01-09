// server/src/terminal/repository.rs
// 终端数据访问层

use sqlx::{MySqlPool, Result};
use std::collections::HashMap;

use super::models::{InputRecord, OutputRecord, SessionInfo, SessionState};

pub struct TerminalRepository {
    pool: MySqlPool,
}

impl TerminalRepository {
    pub fn new(pool: MySqlPool) -> Self {
        Self { pool }
    }

    /// 创建会话
    pub async fn create_session(
        &self,
        session_id: &str,
        agent_id: &str,
        user_id: &str,
        shell_type: &str,
        cwd: Option<&str>,
        env: Option<&HashMap<String, String>>,
        cols: u16,
        rows: u16,
    ) -> Result<()> {
        let env_json = env.map(|e| serde_json::to_value(e).unwrap());

        sqlx::query!(
            r#"
            INSERT INTO terminal_sessions 
            (session_id, agent_id, user_id, shell_type, cwd, env, cols, rows, state, output_cursor)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'opening', 0)
            "#,
            session_id,
            agent_id,
            user_id,
            shell_type,
            cwd,
            env_json,
            cols,
            rows
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// 获取会话信息
    pub async fn get_session(&self, session_id: &str) -> Result<Option<SessionInfo>> {
        let session = sqlx::query_as!(
            SessionInfo,
            r#"
            SELECT 
                session_id, agent_id, user_id, shell_type, cwd, 
                env as "env: sqlx::types::Json<HashMap<String, String>>",
                cols, rows, 
                state as "state: SessionState",
                pid, shell_path, output_cursor, exit_code,
                created_at, updated_at, closed_at
            FROM terminal_sessions
            WHERE session_id = ?
            "#,
            session_id
        )
        .fetch_optional(&self.pool)
        .await?;

        Ok(session)
    }

    /// 更新会话状态
    pub async fn update_session_state(
        &self,
        session_id: &str,
        state: SessionState,
        pid: Option<u32>,
        shell_path: Option<&str>,
        output_cursor: u64,
        exit_code: Option<i32>,
    ) -> Result<()> {
        let pid_i32 = pid.map(|p| p as i32);
        let cursor_i64 = output_cursor as i64;

        sqlx::query!(
            r#"
            UPDATE terminal_sessions
            SET state = ?, pid = ?, shell_path = ?, output_cursor = ?, exit_code = ?, updated_at = NOW()
            WHERE session_id = ?
            "#,
            state,
            pid_i32,
            shell_path,
            cursor_i64,
            exit_code,
            session_id
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// 关闭会话
    pub async fn close_session(&self, session_id: &str, exit_code: Option<i32>) -> Result<()> {
        sqlx::query!(
            r#"
            UPDATE terminal_sessions
            SET state = 'closed', exit_code = ?, closed_at = NOW(), updated_at = NOW()
            WHERE session_id = ?
            "#,
            exit_code,
            session_id
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// 保存输出
    pub async fn save_output(
        &self,
        session_id: &str,
        cursor_start: u64,
        cursor_end: u64,
        output_data: &str,
    ) -> Result<()> {
        let start_i64 = cursor_start as i64;
        let end_i64 = cursor_end as i64;

        sqlx::query!(
            r#"
            INSERT INTO terminal_outputs (session_id, cursor_start, cursor_end, output_data)
            VALUES (?, ?, ?, ?)
            "#,
            session_id,
            start_i64,
            end_i64,
            output_data
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// 获取输出（从指定 cursor 开始）
    pub async fn get_outputs(
        &self,
        session_id: &str,
        from_cursor: u64,
        limit: i64,
    ) -> Result<Vec<OutputRecord>> {
        let from_i64 = from_cursor as i64;

        let outputs = sqlx::query_as!(
            OutputRecord,
            r#"
            SELECT id, session_id, cursor_start, cursor_end, output_data, created_at
            FROM terminal_outputs
            WHERE session_id = ? AND cursor_end > ?
            ORDER BY cursor_start ASC
            LIMIT ?
            "#,
            session_id,
            from_i64,
            limit
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(outputs)
    }

    /// 保存输入（用于审计）
    pub async fn save_input(
        &self,
        session_id: &str,
        client_seq: u64,
        input_data: &str,
    ) -> Result<()> {
        let seq_i64 = client_seq as i64;

        sqlx::query!(
            r#"
            INSERT INTO terminal_inputs (session_id, client_seq, input_data)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE input_data = input_data
            "#,
            session_id,
            seq_i64,
            input_data
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// 列出用户的活跃会话
    pub async fn list_user_sessions(&self, user_id: &str) -> Result<Vec<SessionInfo>> {
        let sessions = sqlx::query_as!(
            SessionInfo,
            r#"
            SELECT 
                session_id, agent_id, user_id, shell_type, cwd,
                env as "env: sqlx::types::Json<HashMap<String, String>>",
                cols, rows,
                state as "state: SessionState",
                pid, shell_path, output_cursor, exit_code,
                created_at, updated_at, closed_at
            FROM terminal_sessions
            WHERE user_id = ? AND state IN ('opening', 'opened', 'running')
            ORDER BY created_at DESC
            "#,
            user_id
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(sessions)
    }

    /// 清理超时的断开会话（30分钟无心跳）
    pub async fn cleanup_stale_sessions(&self, timeout_minutes: i64) -> Result<u64> {
        let result = sqlx::query!(
            r#"
            UPDATE terminal_sessions
            SET state = 'closed', closed_at = NOW(), updated_at = NOW()
            WHERE state = 'disconnected' 
            AND updated_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
            "#,
            timeout_minutes
        )
        .execute(&self.pool)
        .await?;

        Ok(result.rows_affected())
    }
}
