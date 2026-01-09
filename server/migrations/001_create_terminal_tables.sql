
-- server/migrations/001_create_terminal_tables.sql
-- 终端相关表结构

-- 会话表
CREATE TABLE IF NOT EXISTS terminal_sessions (
    session_id VARCHAR(64) PRIMARY KEY,
    agent_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    shell_type VARCHAR(32) NOT NULL,
    cwd TEXT,
    env JSON,
    cols INT NOT NULL,
    rows INT NOT NULL,
    state VARCHAR(32) NOT NULL DEFAULT 'opening',
    pid INT,
    shell_path TEXT,
    output_cursor BIGINT NOT NULL DEFAULT 0,
    exit_code INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    closed_at TIMESTAMP,
    INDEX idx_agent_state (agent_id, state),
    INDEX idx_user_state (user_id, state),
    INDEX idx_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 输出表
CREATE TABLE IF NOT EXISTS terminal_outputs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL,
    cursor_start BIGINT NOT NULL,
    cursor_end BIGINT NOT NULL,
    output_data MEDIUMTEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session_cursor (session_id, cursor_start),
    FOREIGN KEY (session_id) REFERENCES terminal_sessions(session_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 输入表（审计）
CREATE TABLE IF NOT EXISTS terminal_inputs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL,
    client_seq BIGINT NOT NULL,
    input_data TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_session_seq (session_id, client_seq),
    FOREIGN KEY (session_id) REFERENCES terminal_sessions(session_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
