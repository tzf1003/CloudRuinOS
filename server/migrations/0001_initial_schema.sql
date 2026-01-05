-- 轻量�?RMM 系统初始数据�?Schema
-- Migration: 0001_initial_schema
-- Created: 2024-12-31

-- 设备�?- 存储所有注册设备的信息
CREATE TABLE devices (
    id TEXT PRIMARY KEY,                    -- 设备唯一标识�?
    enrollment_token TEXT,                  -- 注册时使用的令牌（可选，注册后可清空�?
    public_key TEXT NOT NULL,               -- Ed25519 公钥，用于验证设备签�?
    platform TEXT NOT NULL,                -- 设备平台 (windows/linux/macos)
    version TEXT NOT NULL,                  -- Agent 版本�?
    last_seen INTEGER NOT NULL,             -- 最后心跳时间戳 (Unix timestamp)
    status TEXT DEFAULT 'online',           -- 设备状�?(online/offline/error)
    created_at INTEGER NOT NULL,            -- 创建时间�?
    updated_at INTEGER NOT NULL             -- 更新时间�?
);

-- 注册令牌�?- 存储注册令牌信息以支持管理界�?
CREATE TABLE enrollment_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,  -- 自增主键
    token TEXT UNIQUE NOT NULL,             -- 令牌字符�?
    description TEXT,                       -- 令牌描述
    created_by TEXT DEFAULT 'console',      -- 创建�?
    created_at INTEGER NOT NULL,            -- 创建时间�?
    expires_at INTEGER,                     -- 过期时间�?(NULL 表示永不过期)
    used_at INTEGER,                        -- 使用时间�?
    used_by_device TEXT,                    -- 使用该令牌的设备 ID
    is_active BOOLEAN DEFAULT 1,            -- 是否激�?
    usage_count INTEGER DEFAULT 0,          -- 使用次数
    max_usage INTEGER DEFAULT 1,            -- 最大使用次�?(NULL 表示无限�?
    FOREIGN KEY (used_by_device) REFERENCES devices(id) ON DELETE SET NULL
);

-- 会话�?- 存储 WebSocket 会话信息
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,                    -- 会话唯一标识�?
    device_id TEXT NOT NULL,               -- 关联的设�?ID
    durable_object_id TEXT NOT NULL,       -- Durable Object 实例 ID
    status TEXT DEFAULT 'active',          -- 会话状�?(active/inactive/expired)
    created_at INTEGER NOT NULL,           -- 会话创建时间
    expires_at INTEGER NOT NULL,           -- 会话过期时间
    last_activity INTEGER,                 -- 最后活动时�?
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

-- 审计日志�?- 记录所有重要操作的审计信息
CREATE TABLE audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,  -- 自增主键
    device_id TEXT NOT NULL,               -- 操作相关的设�?ID
    session_id TEXT,                       -- 操作相关的会�?ID（可选）
    action_type TEXT NOT NULL,             -- 操作类型 (register/heartbeat/command/file_op/session)
    action_data TEXT,                      -- 操作详细数据 (JSON 格式)
    result TEXT,                           -- 操作结果 (success/error/timeout)
    error_message TEXT,                    -- 错误信息（如果有�?
    timestamp INTEGER NOT NULL,            -- 操作时间�?
    ip_address TEXT,                       -- 客户�?IP 地址
    user_agent TEXT,                       -- 客户�?User-Agent
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
);

-- 文件操作记录�?- 记录所有文件操作的详细信息
CREATE TABLE file_operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,  -- 自增主键
    device_id TEXT NOT NULL,               -- 操作的设�?ID
    session_id TEXT,                       -- 操作的会�?ID
    operation_type TEXT NOT NULL,          -- 操作类型 (list/get/put/delete)
    file_path TEXT NOT NULL,               -- 文件路径
    file_size INTEGER,                     -- 文件大小（字节）
    checksum TEXT,                         -- 文件校验�?(SHA-256)
    status TEXT NOT NULL,                  -- 操作状�?(success/error/pending)
    error_message TEXT,                    -- 错误信息（如果有�?
    timestamp INTEGER NOT NULL,            -- 操作时间�?
    duration_ms INTEGER,                   -- 操作耗时（毫秒）
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
);

-- 创建索引以优化查询性能

-- 设备表索�?
CREATE INDEX idx_devices_status ON devices(status);
CREATE INDEX idx_devices_last_seen ON devices(last_seen);
CREATE INDEX idx_devices_platform ON devices(platform);
CREATE INDEX idx_devices_created_at ON devices(created_at);

-- 注册令牌表索�?
CREATE INDEX idx_enrollment_tokens_token ON enrollment_tokens(token);
CREATE INDEX idx_enrollment_tokens_created_at ON enrollment_tokens(created_at);
CREATE INDEX idx_enrollment_tokens_expires_at ON enrollment_tokens(expires_at);
CREATE INDEX idx_enrollment_tokens_is_active ON enrollment_tokens(is_active);
CREATE INDEX idx_enrollment_tokens_used_by_device ON enrollment_tokens(used_by_device);

-- 会话表索�?
CREATE INDEX idx_sessions_device_id ON sessions(device_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_created_at ON sessions(created_at);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_sessions_last_activity ON sessions(last_activity);

-- 审计日志表索�?
CREATE INDEX idx_audit_logs_device_id ON audit_logs(device_id);
CREATE INDEX idx_audit_logs_session_id ON audit_logs(session_id);
CREATE INDEX idx_audit_logs_action_type ON audit_logs(action_type);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_logs_result ON audit_logs(result);
-- 复合索引用于常见查询模式
CREATE INDEX idx_audit_logs_device_timestamp ON audit_logs(device_id, timestamp);
CREATE INDEX idx_audit_logs_type_timestamp ON audit_logs(action_type, timestamp);

-- 文件操作记录表索�?
CREATE INDEX idx_file_operations_device_id ON file_operations(device_id);
CREATE INDEX idx_file_operations_session_id ON file_operations(session_id);
CREATE INDEX idx_file_operations_operation_type ON file_operations(operation_type);
CREATE INDEX idx_file_operations_timestamp ON file_operations(timestamp);
CREATE INDEX idx_file_operations_status ON file_operations(status);
-- 复合索引用于常见查询模式
CREATE INDEX idx_file_operations_device_timestamp ON file_operations(device_id, timestamp);
CREATE INDEX idx_file_operations_path_timestamp ON file_operations(file_path, timestamp);