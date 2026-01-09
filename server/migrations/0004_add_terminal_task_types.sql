-- Migration: 0004_add_terminal_task_types
-- Description: 扩展 tasks 表的 type 字段，支持终端相关任务类型

-- 删除旧的 CHECK 约束并重新创建表（SQLite 不支持直接修改约束）
-- 1. 创建新表
CREATE TABLE tasks_new (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN (
        'config_update', 
        'cmd_exec',
        'terminal_open',
        'terminal_input',
        'terminal_close',
        'terminal_resize'
    )),
    revision INTEGER NOT NULL DEFAULT 1,
    desired_state TEXT NOT NULL CHECK(desired_state IN ('pending', 'running', 'succeeded', 'failed', 'canceled')),
    payload TEXT NOT NULL,
    timeout_s INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

-- 2. 复制数据
INSERT INTO tasks_new SELECT * FROM tasks;

-- 3. 删除旧表
DROP TABLE tasks;

-- 4. 重命名新表
ALTER TABLE tasks_new RENAME TO tasks;

-- 5. 重建索引
CREATE INDEX idx_tasks_device_state ON tasks(device_id, desired_state);
