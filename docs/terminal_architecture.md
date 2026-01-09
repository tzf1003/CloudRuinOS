# 远程交互式终端架构文档

## 1. 系统概述

本系统实现了一套完整的远程交互式终端解决方案，支持通过心跳协议在 Agent、Server、前端三端之间传输终端输入输出。

### 1.1 核心特性

- **持久会话**：Agent 端维护长期运行的 PTY/ConPTY 会话，不因心跳间隔中断
- **增量传输**：使用 cursor 机制只传输新增输出，避免重复数据
- **幂等性保证**：通过 task_id + revision 和 client_seq 实现去重
- **缓冲区管理**：Agent 端 10MB 环形缓冲区，Server 端完整持久化
- **跨平台支持**：Windows (CMD/PowerShell/Pwsh) 和 Linux/macOS (sh/bash/zsh)
- **实时性**：前端 1 秒轮询，心跳 5 秒间隔，输出从数据库读取

## 2. 三端架构

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│   前端 (React)  │         │  后端 (Rust)    │         │  Agent (Rust)   │
│   Terminal UI   │◄───────►│  Server         │◄───────►│  PTY/ConPTY     │
│   (xterm.js)    │  HTTP/  │  (中转+状态机)  │  心跳   │  会话管理       │
│                 │  REST   │                 │  协议   │                 │
└─────────────────┘         └─────────────────┘         └─────────────────┘
│                           │                           │
│ 1. 创建会话请求           │                           │
├──────────────────────────►│                           │
│                           │ 2. 下发 session_open      │
│                           ├──────────────────────────►│
│                           │                           │ 3. 创建 PTY
│                           │                           │    启动 shell
│                           │ 4. 心跳回报 opened        │
│                           │◄──────────────────────────┤
│ 5. 轮询输出 (1s)          │                           │
│◄──────────────────────────┤                           │
│                           │                           │
│ 6. 用户输入命令           │                           │
├──────────────────────────►│                           │
│                           │ 7. 下发 session_input     │
│                           ├──────────────────────────►│
│                           │                           │ 8. 写入 PTY
│                           │                           │    (去重 seq)
│                           │ 9. 心跳回传输出增量       │
│                           │◄──────────────────────────┤
│                           │    (cursor + chunk)       │
│ 10. 拉取新输出            │                           │
│◄──────────────────────────┤                           │
│                           │                           │
│ 11. 关闭会话              │                           │
├──────────────────────────►│                           │
│                           │ 12. 下发 session_close    │
│                           ├──────────────────────────►│
│                           │                           │ 13. 终止进程
│                           │ 14. 心跳回报 closed       │
│                           │◄──────────────────────────┤
```

## 3. 协议设计

### 3.1 任务类型 (Server → Agent)

#### A) session_open - 创建终端会话

```json
{
  "task_type": "session_open",
  "task_id": "term-open-uuid-1234",
  "revision": 1,
  "payload": {
    "session_id": "sess-uuid-5678",
    "shell_type": "bash",
    "cwd": "/home/user",
    "env": {
      "PATH": "/usr/bin:/bin",
      "LANG": "en_US.UTF-8"
    },
    "cols": 80,
    "rows": 24
  }
}
```

**字段说明**：
- `session_id`: 全局唯一会话标识
- `shell_type`: 枚举值 `cmd | powershell | pwsh | sh | bash | zsh`
- `cwd`: 工作目录（可选）
- `env`: 环境变量（可选）
- `cols/rows`: 终端窗口大小

#### B) session_input - 输入事件流

```json
{
  "task_type": "session_input",
  "task_id": "term-input-uuid-9012",
  "revision": 1,
  "payload": {
    "session_id": "sess-uuid-5678",
    "client_seq": 42,
    "input_data": "ls -la\n"
  }
}
```

**字段说明**：
- `client_seq`: 单调递增序列号，用于去重
- `input_data`: UTF-8 编码的输入数据（支持控制字符）

#### C) session_resize - 窗口调整

```json
{
  "task_type": "session_resize",
  "task_id": "term-resize-uuid-3456",
  "revision": 1,
  "payload": {
    "session_id": "sess-uuid-5678",
    "cols": 120,
    "rows": 30
  }
}
```

#### D) session_close - 关闭会话

```json
{
  "task_type": "session_close",
  "task_id": "term-close-uuid-7890",
  "revision": 1,
  "payload": {
    "session_id": "sess-uuid-5678",
    "force": false
  }
}
```

**字段说明**：
- `force`: true = SIGKILL/TerminateProcess，false = SIGTERM/优雅关闭

### 3.2 上报格式 (Agent → Server)

#### 心跳请求

```json
{
  "agent_id": "agent-001",
  "timestamp": "2026-01-09T10:30:00Z",
  "reports": [
    {
      "task_id": "term-open-uuid-1234",
      "status": "completed",
      "result": {
        "session_id": "sess-uuid-5678",
        "state": "opened",
        "pid": 12345,
        "shell_path": "/bin/bash",
        "exit_code": null,
        "error": null
      },
      "output_cursor": 0,
      "output_chunk": ""
    },
    {
      "task_id": "heartbeat-sess-uuid-5678",
      "status": "running",
      "result": {
        "session_id": "sess-uuid-5678",
        "state": "running",
        "pid": 12345
      },
      "output_cursor": 1024,
      "output_chunk": "total 48\ndrwxr-xr-x  12 user  staff   384 Jan  9 10:30 .\n..."
    }
  ]
}
```

#### 心跳响应

```json
{
  "tasks": [
    {
      "task_type": "session_input",
      "task_id": "term-input-uuid-9012",
      "revision": 1,
      "payload": {
        "session_id": "sess-uuid-5678",
        "client_seq": 43,
        "input_data": "pwd\n"
      }
    }
  ],
  "cancels": []
}
```

### 3.3 会话状态机

```
opening ──► opened ──► running ──► closed
   │           │          │           ▲
   │           │          │           │
   └───────────┴──────────┴──────► failed
```

- **opening**: 会话创建中
- **opened**: PTY 已创建，shell 已启动
- **running**: 有活跃输入输出
- **closed**: 正常关闭
- **failed**: 异常失败

## 4. 核心机制

### 4.1 为什么不全量发送输出？

**问题**：每次心跳发送完整终端屏幕内容会导致：

1. **带宽浪费**：80x24 屏幕 ≈ 2KB，5 秒心跳 = 400 B/s 基线开销
2. **CPU 浪费**：Server 需要对比去重，Agent 需要重复序列化
3. **状态不一致**：网络丢包时无法判断哪部分输出丢失
4. **无法回溯**：只有当前屏幕，丢失滚动缓冲区

**增量方案优势**：

1. 只传输新增内容（cursor 机制）
2. Server 可持久化完整输出流
3. 支持断线重连后从 last_cursor 续传
4. 前端可自行管理滚动缓冲区

### 4.2 Cursor 机制

```
Agent 端环形缓冲区 (10MB):
┌─────────────────────────────────────┐
│ [oldest_cursor=1000] ... [cursor=5000] │
└─────────────────────────────────────┘
         ▲                      ▲
         │                      │
    最旧可用数据            当前写入位置

Server 端记录:
- session.output_cursor = 4500  (上次接收到的 cursor)

Agent 心跳上报:
- output_cursor = 5000
- output_chunk = buffer.read_from(4500)  // 返回 [4500, 5000) 的数据

Server 保存:
- INSERT INTO terminal_outputs (cursor_start=4500, cursor_end=5000, data=...)
- UPDATE terminal_sessions SET output_cursor=5000
```

### 4.3 幂等性保证

#### 任务幂等 (task_id + revision)

```rust
// Agent 端维护已处理任务集合
let mut processed_tasks: HashSet<String> = HashSet::new();

for task in tasks {
    let key = format!("{}-{}", task.task_id, task.revision);
    if processed_tasks.contains(&key) {
        continue; // 跳过重复任务
    }
    handle_task(task);
    processed_tasks.insert(key);
}
```

#### 输入去重 (client_seq)

```rust
// Agent 端记录每个会话的最后处理序列号
let mut last_seq = session.last_client_seq.lock().unwrap();
if client_seq <= *last_seq {
    return Ok(0); // 忽略重复输入
}
*last_seq = client_seq;
```

### 4.4 缓冲区溢出处理

当 Agent 端环形缓冲区满时：

```rust
// Agent 端
pub enum BufferError {
    DataLost {
        requested_cursor: u64,
        oldest_available: u64,
    },
}

// 处理逻辑
match session.get_output_chunk(last_cursor) {
    Ok((cursor, data)) => { /* 正常处理 */ },
    Err(BufferError::DataLost { oldest_available, .. }) => {
        // 从最旧可用位置重新开始
        eprintln!("Warning: Output data lost, resetting cursor");
        session.get_output_chunk(oldest_available)
    }
}
```

Server 端插入占位符：

```rust
let placeholder = format!(
    "\r\n[Warning: {} bytes of output data lost due to buffer overflow]\r\n",
    cursor_end - cursor_start
);
repo.save_output(session_id, cursor_start, cursor_end, &placeholder).await?;
```

## 5. 平台差异处理

### 5.1 Windows (ConPTY)

```rust
// 创建 ConPTY 时启用 UTF-8 模式
CreatePseudoConsole(
    coord,
    pipe_in_read,
    pipe_out_write,
    1, // PSEUDOCONSOLE_INHERIT_CURSOR，启用 UTF-8
    &mut pseudo_console,
);

// PowerShell 启动参数
"powershell.exe -NoLogo -NoProfile -Command \"[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\""

// CMD 启动参数
"cmd.exe /K chcp 65001 >nul"  // 切换到 UTF-8 代码页
```

### 5.2 Unix (PTY)

```rust
// 创建 PTY
let master_fd = libc::posix_openpt(libc::O_RDWR | libc::O_NOCTTY);
libc::grantpt(master_fd);
libc::unlockpt(master_fd);

// 设置环境变量
cmd.env("TERM", "xterm-256color");

// 创建新会话
cmd.pre_exec(|| {
    libc::setsid();  // 创建新会话
    libc::ioctl(0, libc::TIOCSCTTY, 0);  // 设置控制终端
    Ok(())
});
```

## 6. 数据库设计

### 6.1 terminal_sessions 表

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
    state VARCHAR(32) NOT NULL,
    pid INT,
    shell_path VARCHAR(255),
    output_cursor BIGINT NOT NULL DEFAULT 0,
    exit_code INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    closed_at TIMESTAMP,
    INDEX idx_agent_id (agent_id),
    INDEX idx_user_id (user_id),
    INDEX idx_state (state)
);
```

### 6.2 terminal_outputs 表

```sql
CREATE TABLE terminal_outputs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL,
    cursor_start BIGINT NOT NULL,
    cursor_end BIGINT NOT NULL,
    output_data MEDIUMTEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session_cursor (session_id, cursor_start),
    FOREIGN KEY (session_id) REFERENCES terminal_sessions(session_id) ON DELETE CASCADE
);
```

### 6.3 terminal_inputs 表（审计）

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

## 7. 性能优化

### 7.1 输出缓冲策略

- **Agent 端**：10MB 环形缓冲区，超出丢弃最旧数据
- **Server 端**：完整持久化到数据库（MEDIUMTEXT 支持 16MB）
- **前端**：xterm.js 默认保留 1000 行滚动缓冲

### 7.2 心跳间隔与实时性

- **心跳间隔**：5 秒（可配置）
- **前端轮询**：1 秒（可配置）
- **输出来源**：前端从数据库读取，不依赖心跳实时性

### 7.3 并发限制

```rust
pub struct TerminalManager {
    sessions: Arc<Mutex<HashMap<String, Arc<TerminalSession>>>>,
    max_sessions: usize,  // 默认 10
}
```

## 8. 错误处理

### 8.1 网络中断

- Agent 端：会话继续运行，输出累积在缓冲区
- Server 端：标记会话为 `disconnected`
- 恢复后：从 last_cursor 续传

### 8.2 缓冲区溢出

- Agent 端：返回 `BufferError::DataLost`
- Server 端：插入警告占位符
- 前端：显示警告但继续

### 8.3 会话崩溃

- Agent 端：读取线程检测到 EOF，设置状态为 `closed`
- Server 端：记录 exit_code
- 前端：显示会话已关闭

## 9. 安全考虑

### 9.1 权限控制

- 每个会话关联 `user_id`
- API 层验证用户只能访问自己的会话

### 9.2 输入审计

- 所有输入记录到 `terminal_inputs` 表
- 包含时间戳和 client_seq

### 9.3 资源限制

- 最大并发会话数限制
- 输出缓冲区大小限制
- 超时会话自动清理（30 分钟）

## 10. 部署建议

### 10.1 Agent 端

```bash
# 启动 Agent（最大 10 个并发会话）
./agent --max-sessions 10 --heartbeat-interval 5s
```

### 10.2 Server 端

```bash
# 启动 Server
./server --db-url mysql://user:pass@localhost/terminal_db

# 定期清理超时会话（cron）
0 * * * * curl -X POST http://localhost:8080/api/terminal/cleanup
```

### 10.3 前端

```typescript
// 配置轮询间隔
const POLL_INTERVAL = 1000; // 1 秒
const SCROLL_BUFFER_SIZE = 10000; // 保留 10000 行
```

## 11. 监控指标

- `terminal_sessions_active`: 活跃会话数
- `terminal_output_bytes_total`: 累计输出字节数
- `terminal_buffer_overflow_total`: 缓冲区溢出次数
- `terminal_heartbeat_latency`: 心跳延迟
- `terminal_session_duration`: 会话持续时间

## 12. 未来扩展

- WebSocket 支持（替代轮询）
- 会话录制与回放
- 多用户协作终端
- 终端快照与恢复
- 自定义主题与字体
