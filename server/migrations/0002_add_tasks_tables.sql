-- 任务表
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('config_update', 'cmd_exec')),
  desired_state TEXT NOT NULL CHECK(desired_state IN ('pending', 'running', 'succeeded', 'failed', 'canceled')),
  payload TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tasks_device_id ON tasks(device_id);
CREATE INDEX IF NOT EXISTS idx_tasks_desired_state ON tasks(desired_state);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);

-- 任务状态表（Agent 上报的状态）
CREATE TABLE IF NOT EXISTS task_states (
  task_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('received', 'running', 'succeeded', 'failed', 'canceled')),
  progress INTEGER DEFAULT 0,
  output_cursor INTEGER DEFAULT 0,
  error TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (task_id, device_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_states_device_id ON task_states(device_id);
CREATE INDEX IF NOT EXISTS idx_task_states_state ON task_states(state);

-- 任务输出日志表
CREATE TABLE IF NOT EXISTS task_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_logs_task_id ON task_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_task_logs_created_at ON task_logs(created_at);
