-- 集中式配置管理 Schema
-- Migration: 0002_central_config
-- Created: 2024-01-06

-- 配置表 - 存储全局、分组(Token)和设备级别的配置
CREATE TABLE configurations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope TEXT NOT NULL CHECK(scope IN ('global', 'token', 'device')), -- 配置作用域
    target_id TEXT,                         -- 目标 ID (Global为NULL, Token为Token字符串, Device为DeviceID)
    content TEXT NOT NULL,                  -- JSON 格式的配置内容
    version INTEGER DEFAULT 1,              -- 配置版本号
    created_at INTEGER NOT NULL,            -- 创建时间
    updated_at INTEGER NOT NULL,            -- 更新时间
    updated_by TEXT DEFAULT 'system',       -- 更新者
    UNIQUE(scope, target_id)                -- 确保每个作用域下的目标只有一个配置
);

-- 初始化默认全局配置 (空配置，使用 Agent 内置默认值)
INSERT INTO configurations (scope, target_id, content, created_at, updated_at)
VALUES ('global', NULL, '{}', unixepoch(), unixepoch());

-- 确保默认注册令牌存在 (如果尚未存在)
INSERT INTO enrollment_tokens (token, description, created_at, is_active, max_usage)
SELECT 'default-token', 'Default Enrollment Token', unixepoch(), 1, NULL
WHERE NOT EXISTS (SELECT 1 FROM enrollment_tokens WHERE token = 'default-token');

-- 索引
CREATE INDEX idx_configurations_scope_target ON configurations(scope, target_id);
