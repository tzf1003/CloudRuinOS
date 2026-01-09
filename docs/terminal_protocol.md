# 远程交互式终端协议规范

## 1. Task 类型

### 1.1 session_open - 创建终端会话

**Server → Agent**

```json
{
  "task_id": "term-session-uuid-1",
  "revision": 1,
  "task_type": "session_open",
  "payload": {
    "session_id": "sess-abc123",
    "shell_type": "bash",  // "cmd" | "powershell" | "pwsh" | "sh" | "bash" | "zsh"
    "cwd": "/home/user",   // 工作目录，可选
    "env": {               // 环境变量，可选
      "TERM": "xterm-256color",
      "LANG": "en_US.UTF-8"
    },
    "cols": 80,            // 终端列数
    "rows": 24             // 终端行数
  }
}
```

**Agent → Server (Report)**

```json
{
  "task_id": "term-session-uuid-1",
  "status": "completed",  // 或 "failed"
  "result": {
    "session_id": "sess-abc123",
    "state": "opened",    // "opened" | "failed"
    "pid": 12345,         // shell 进程 PID
    "shell_path": "/bin/bash",
    "error": null         // 失败时的错误信息
  },
  "output_cursor": 0,
  "output_chunk": ""      // 初始无输出
}
```

---

### 1.2 session_input - 输入事件流

**Server → Agent**

```json
{
  "task_id": "term-input-uuid-2",
  "revision": 1,
  "task_type": "session_input",
  "payload": {
    "session_id": "sess-abc123",
    "client_seq": 1001,        // 客户端序列号，用于去重
    "input_data": "ls -la\n"   // UTF-8 编码的输入数据
  }
}
```

**特殊输入示例**：
- 普通命令：`"ls -la\n"`
- Ctrl+C：`"\x03"`
- Ctrl+D：`"\x04"`
- 退格：`"\x7f"` 或 `"\x08"`
- 方向键上：`"\x1b[A"`

**Agent → Server (Report)**

```json
{
  "task_id": "term-input-uuid-2",
  "status": "completed",
  "result": {
    "session_id": "sess-abc123",
    "client_seq": 1001,
    "bytes_written": 7
  },
  "output_cursor": 1234,      // 当前输出游标
  "output_chunk": "total 48\ndrwxr-xr-x  5 user user 4096 Jan  9 10:30 .\n..."
}
```

---

### 1.3 session_resize - 调整窗口大小

**Server → Agent**

```json
{
  "task_id": "term-resize-uuid-3",
  "revision": 1,
  "task_type": "session_resize",
  "payload": {
    "session_id": "sess-abc123",
    "cols": 120,
    "rows": 30
  }
}
```

**Agent → Server (Report)**

```json
{
  "task_id": "term-resize-uuid-3",
  "status": "completed",
  "result": {
    "session_id": "sess-abc123",
    "cols": 120,
    "rows": 30
  },
  "output_cursor": 1234,
  "output_chunk": ""  // resize 通常不产生输出
}
```

---

### 1.4 session_close - 关闭会话

**Server → Agent**

```json
{
  "task_id": "term-close-uuid-4",
  "revision": 1,
  "task_type": "session_close",
  "payload": {
    "session_id": "sess-abc123",
    "force": false  // true 时强制 kill -9
  }
}
```

**Agent → Server (Report)**

```json
{
  "task_id": "term-close-uuid-4",
  "status": "completed",
  "result": {
    "session_id": "sess-abc123",
    "state": "closed",
    "exit_code": 0
  },
  "output_cursor": 5678,
  "output_chunk": "logout\n"  // 最后的输出
}
```

---

## 2. 心跳协议扩展

### 2.1 Agent → Server 心跳

```json
{
  "agent_id": "agent-001",
  "timestamp": "2026-01-09T10:30:00Z",
  "reports": [
    {
      "task_id": "term-session-uuid-1",
      "status": "running",
      "result": {
        "session_id": "sess-abc123",
        "state": "running",
        "pid": 12345
      },
      "output_cursor": 5678,
      "output_chunk": "new output data since last heartbeat..."
    }
  ]
}
```

**关键字段**：
- `output_cursor`: 单调递增的输出游标（字节偏移）
- `output_chunk`: 从上次 cursor 到当前的增量输出（UTF-8）
- `state`: `opened` | `running` | `closed` | `failed`

### 2.2 Server → Agent 心跳响应

```json
{
  "tasks": [
    {
      "task_id": "term-input-uuid-5",
      "revision": 1,
      "task_type": "session_input",
      "payload": { ... }
    }
  ],
  "cancels": [
    {
      "task_id": "term-session-uuid-1",
      "reason": "user_requested"
    }
  ]
}
```

---

## 3. 数据库模型

### 3.1 terminal_sessions 表

```sql
CREATE TABLE terminal_sessions (
    session_id VARCHAR(64) PRIMARY KEY,
    agent_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    shell_type VARCHAR(32) NOT NULL,
    cwd TEXT,
    env JSON,
    cols INT NOT NULL,
    rows INT NOT NULL,
    state VARCHAR(32) NOT NULL,  -- 'opening' | 'opened' | 'running' | 'closed' | 'failed'
    pid INT,
    shell_path TEXT,
    output_cursor BIGINT DEFAULT 0,
    exit_code INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    closed_at TIMESTAMP,
    INDEX idx_agent_state (agent_id, state),
    INDEX idx_user_state (user_id, state)
);
```

### 3.2 terminal_outputs 表

```sql
CREATE TABLE terminal_outputs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL,
    cursor_start BIGINT NOT NULL,  -- 起始游标
    cursor_end BIGINT NOT NULL,    -- 结束游标
    output_data MEDIUMTEXT NOT NULL,  -- UTF-8 输出内容
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session_cursor (session_id, cursor_start),
    FOREIGN KEY (session_id) REFERENCES terminal_sessions(session_id) ON DELETE CASCADE
);
```

### 3.3 terminal_inputs 表（可选，用于审计）

```sql
CREATE TABLE terminal_inputs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL,
    client_seq BIGINT NOT NULL,
    input_data TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_session_seq (session_id, client_seq),
    FOREIGN KEY (session_id) REFERENCES terminal_sessions(session_id) ON DELETE CASCADE
);
```

---

## 4. 幂等性与去重

### 4.1 输入去重

- Agent 维护每个 session 的 `last_client_seq`
- 收到 `session_input` 时：
  - 如果 `client_seq <= last_client_seq`：忽略（已处理）
  - 否则：写入 PTY，更新 `last_client_seq`

### 4.2 输出游标

- Agent 维护 `output_cursor`，每次写入输出时递增
- Server 记录 `last_cursor`，只存储 `cursor > last_cursor` 的数据
- 前端拉取时指定 `from_cursor`，Server 返回 `cursor >= from_cursor` 的所有输出

### 4.3 任务幂等

- `session_open`：如果 session 已存在且状态为 `opened/running`，返回成功
- `session_close`：如果 session 已关闭，返回成功
- `session_resize`：直接应用新尺寸，无副作用

---

## 5. 错误处理

### 5.1 Agent 端错误

- PTY 创建失败：回报 `state: "failed"`，包含错误信息
- Shell 进程崩溃：回报 `state: "closed"`，包含 `exit_code`
- 输入写入失败：回报 task `status: "failed"`

### 5.2 Server 端错误

- Session 不存在：返回 404
- Agent 离线：任务进入待下发队列，等待下次心跳
- 输出游标不连续：记录警告，但不阻塞（允许 Agent 重启后丢失部分输出）

### 5.3 前端错误

- 网络断开：停止轮询，显示"连接中断"
- 游标不连续：请求从 `last_cursor` 重新拉取

---

## 6. 并发与资源限制

### 6.1 Agent 端限制

- 最大并发 session 数：10（可配置）
- 单 session 输出缓冲区：10MB（环形缓冲）
- 超出限制时拒绝新 session，回报 `failed`

### 6.2 Server 端限制

- 单用户最大活跃 session 数：20
- 输出存储：按 session 分片，定期归档旧数据
- 输入队列：每个 session 最多缓存 100 条待下发输入

---

## 7. 生命周期管理

### 7.1 正常流程

1. 前端请求创建 session → Server 生成 `session_id`，状态 `opening`
2. Server 下发 `session_open` → Agent 创建 PTY，回报 `opened`
3. 用户输入 → Server 下发 `session_input` → Agent 写入 PTY
4. Agent 心跳回传输出增量 → Server 持久化 → 前端拉取
5. 用户关闭 → Server 下发 `session_close` → Agent 终止进程，回报 `closed`

### 7.2 异常流程

- **Agent 离线**：Server 标记 session 为 `disconnected`，保留 30 分钟后自动关闭
- **Shell 进程崩溃**：Agent 回报 `closed` + `exit_code`，Server 更新状态
- **超时无输出**：前端显示"无响应"，但不自动关闭（用户可能在运行长时间任务）

---

## 8. 安全考虑

1. **权限校验**：前端请求必须携带 token，Server 验证用户是否有权访问该 Agent
2. **输入过滤**：Server 不过滤输入（保留原始性），但记录审计日志
3. **输出脱敏**：可选，Server 可配置正则规则过滤敏感信息（如密码）
4. **资源隔离**：Agent 使用 cgroup/job object 限制 shell 进程资源
