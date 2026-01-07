-- Migration: 0003_tasks_and_state
-- Description: Add mac_address to devices, create tasks table and task states

-- Add MAC address to devices
ALTER TABLE devices ADD COLUMN mac_address TEXT;
CREATE UNIQUE INDEX idx_devices_mac_address ON devices(mac_address) WHERE mac_address IS NOT NULL;

-- Tasks table
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('config_update', 'cmd_exec')),
    revision INTEGER NOT NULL DEFAULT 1,
    desired_state TEXT NOT NULL CHECK(desired_state IN ('pending', 'running', 'succeeded', 'failed', 'canceled')),
    payload TEXT NOT NULL, -- JSON Content
    timeout_s INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

-- Task State tracking (what the agent reported last)
CREATE TABLE task_states (
    task_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('received', 'running', 'succeeded', 'failed', 'canceled')),
    progress INTEGER DEFAULT 0,
    output_cursor INTEGER DEFAULT 0,
    error TEXT,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (task_id, device_id),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Task Output Logs
CREATE TABLE task_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Index for finding pending tasks for a device
CREATE INDEX idx_tasks_device_state ON tasks(device_id, desired_state);
