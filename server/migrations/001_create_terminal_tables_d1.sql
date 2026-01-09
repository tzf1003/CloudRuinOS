-- server/migrations/001_create_terminal_tables_d1.sql
-- Cloudflare D1 (SQLite) 版本

-- 会话表
CREATE TABLE IF NOT EXISTS terminal_sessions (
    session_id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    shell_type TEXT NOT NULL,
    cwd TEXT,
    env TEXT, -- JSON 存储为 TEXT
    cols INTEGER NOT NULL,
    rows INTEGER NOT NULL,
    state TEXT NOT NULL DEFAULT 'opening',
    pid INTEGER,
    shell_path TEXT,
    output_cursor INTEGER NOT NULL DEFAULT 0,
    exit_code INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    closed_at TEXT
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_agent_state ON terminal_sessions(agent_id, state);
CREATE INDEX IF NOT EXISTS idx_user_state ON terminal_sessions(user_id, state);
CREATE INDEX IF NOT EXISTS idx_updated_at ON terminal_sessions(updated_at);

-- 触发器：自动更新 updated_at
CREATE TRIGGER IF NOT EXISTS update_terminal_sessions_timestamp 
AFTER UPDATE ON terminal_sessions
FOR EACH ROW
BEGIN
    UPDATE terminal_sessions SET updated_at = datetime('now') WHERE session_id = NEW.session_id;
END;

-- 输出表
CREATE TABLE IF NOT EXISTS terminal_outputs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    cursor_start INTEGER NOT NULL,
    cursor_end INTEGER NOT NULL,
    output_data TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES terminal_sessions(session_id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_session_cursor ON terminal_outputs(session_id, cursor_start);

-- 输入表（审计）
CREATE TABLE IF NOT EXISTS terminal_inputs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    client_seq INTEGER NOT NULL,
    input_data TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES terminal_sessions(session_id) ON DELETE CASCADE,
    UNIQUE(session_id, client_seq)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_session_seq ON terminal_inputs(session_id, client_seq);
