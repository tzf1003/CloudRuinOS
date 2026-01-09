# 终端协议 JSON 示例

本文档提供完整的协议交互示例，展示从创建会话到关闭的完整生命周期。

## 1. 创建会话流程

### 1.1 前端 → Server：创建会话请求

**HTTP POST** `/api/terminal/create`

```json
{
  "agent_id": "agent-win-001",
  "shell_type": "powershell",
  "cwd": "C:\\Users\\admin\\projects",
  "env": {
    "PROJECT_ROOT": "C:\\Users\\admin\\projects",
    "DEBUG": "true"
  },
  "cols": 120,
  "rows": 30
}
```

**响应**：

```json
{
  "session_id": "sess-a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

### 1.2 Server → Agent：下发 session_open 任务

**心跳响应** (Agent 下次心跳时获取)

```json
{
  "tasks": [
    {
      "task_type": "session_open",
      "task_id": "term-open-f9e8d7c6-b5a4-3210-9876-543210fedcba",
      "revision": 1,
      "payload": {
        "session_id": "sess-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "shell_type": "powershell",
        "cwd": "C:\\Users\\admin\\projects",
        "env": {
          "PROJECT_ROOT": "C:\\Users\\admin\\projects",
          "DEBUG": "true"
        },
        "cols": 120,
        "rows": 30
      }
    }
  ],
  "cancels": []
}
```

### 1.3 Agent → Server：上报会话已创建

**心跳请求** (5 秒后)

```json
{
  "agent_id": "agent-win-001",
  "timestamp": "2026-01-09T10:30:05Z",
  "reports": [
    {
      "task_id": "term-open-f9e8d7c6-b5a4-3210-9876-543210fedcba",
      "status": "completed",
      "result": {
        "session_id": "sess-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "state": "opened",
        "pid": 8472,
        "shell_path": "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
        "exit_code": null,
        "error": null
      },
      "output_cursor": 156,
      "output_chunk": "Windows PowerShell\r\nCopyright (C) Microsoft Corporation. All rights reserved.\r\n\r\nPS C:\\Users\\admin\\projects> "
    }
  ]
}
```

**说明**：
- `output_cursor=156`：初始提示符输出了 156 字节
- `output_chunk`：包含 PowerShell 启动信息和提示符

## 2. 输入输出流程

### 2.1 前端 → Server：发送命令

**HTTP POST** `/api/terminal/input`

```json
{
  "session_id": "sess-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "input_data": "Get-ChildItem\r\n"
}
```

**响应**：

```json
{
  "status": "ok"
}
```

### 2.2 Server → Agent：下发 session_input 任务

**心跳响应**

```json
{
  "tasks": [
    {
      "task_type": "session_input",
      "task_id": "term-input-12345678-abcd-ef01-2345-6789abcdef01",
      "revision": 1,
      "payload": {
        "session_id": "sess-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "client_seq": 1,
        "input_data": "Get-ChildItem\r\n"
      }
    }
  ],
  "cancels": []
}
```

### 2.3 Agent → Server：上报输出增量

**心跳请求** (5 秒后)

```json
{
  "agent_id": "agent-win-001",
  "timestamp": "2026-01-09T10:30:10Z",
  "reports": [
    {
      "task_id": "term-input-12345678-abcd-ef01-2345-6789abcdef01",
      "status": "completed",
      "result": {
        "session_id": "sess-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "client_seq": 1,
        "bytes_written": 16
      },
      "output_cursor": 892,
      "output_chunk": "Get-ChildItem\r\n\r\n    Directory: C:\\Users\\admin\\projects\r\n\r\nMode                 LastWriteTime         Length Name\r\n----                 -------------         ------ ----\r\nd-----         1/9/2026  10:15 AM                src\r\nd-----         1/9/2026  10:20 AM                docs\r\n-a----         1/9/2026  10:10 AM           1024 README.md\r\n-a----         1/9/2026  10:12 AM            512 Cargo.toml\r\n\r\nPS C:\\Users\\admin\\projects> "
    }
  ]
}
```

**说明**：
- `output_cursor` 从 156 增长到 892（增加了 736 字节）
- `output_chunk` 包含命令回显、输出结果和新提示符

### 2.4 前端 → Server：轮询输出

**HTTP GET** `/api/terminal/output/sess-a1b2c3d4-e5f6-7890-abcd-ef1234567890?from_cursor=156`

**响应**：

```json
{
  "session_id": "sess-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "from_cursor": 156,
  "to_cursor": 892,
  "output_data": "Get-ChildItem\r\n\r\n    Directory: C:\\Users\\admin\\projects\r\n\r\nMode                 LastWriteTime         Length Name\r\n----                 -------------         ------ ----\r\nd-----         1/9/2026  10:15 AM                src\r\nd-----         1/9/2026  10:20 AM                docs\r\n-a----         1/9/2026  10:10 AM           1024 README.md\r\n-a----         1/9/2026  10:12 AM            512 Cargo.toml\r\n\r\nPS C:\\Users\\admin\\projects> ",
  "has_more": false
}
```

## 3. 窗口调整流程

### 3.1 前端 → Server：调整窗口

**HTTP POST** `/api/terminal/resize`

```json
{
  "session_id": "sess-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "cols": 160,
  "rows": 40
}
```

### 3.2 Server → Agent：下发 session_resize 任务

**心跳响应**

```json
{
  "tasks": [
    {
      "task_type": "session_resize",
      "task_id": "term-resize-87654321-dcba-fe10-5432-10fedcba9876",
      "revision": 1,
      "payload": {
        "session_id": "sess-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "cols": 160,
        "rows": 40
      }
    }
  ],
  "cancels": []
}
```

### 3.3 Agent → Server：上报调整完成

**心跳请求**

```json
{
  "agent_id": "agent-win-001",
  "timestamp": "2026-01-09T10:30:15Z",
  "reports": [
    {
      "task_id": "term-resize-87654321-dcba-fe10-5432-10fedcba9876",
      "status": "completed",
      "result": {
        "session_id": "sess-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "cols": 160,
        "rows": 40
      },
      "output_cursor": 892,
      "output_chunk": ""
    }
  ]
}
```

## 4. 持续输出流程（长时间运行命令）

### 4.1 前端发送长时间运行命令

**HTTP POST** `/api/terminal/input`

```json
{
  "session_id": "sess-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "input_data": "ping google.com -n 100\r\n"
}
```

### 4.2 Agent 持续上报输出增量

**第 1 次心跳** (5 秒后)

```json
{
  "agent_id": "agent-win-001",
  "timestamp": "2026-01-09T10:30:20Z",
  "reports": [
    {
      "task_id": "heartbeat-sess-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "status": "running",
      "result": {
        "session_id": "sess-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "state": "running",
        "pid": 8472
      },
      "output_cursor": 1520,
      "output_chunk": "ping google.com -n 100\r\n\r\nPinging google.com [142.250.185.46] with 32 bytes of data:\r\nReply from 142.250.185.46: bytes=32 time=15ms TTL=117\r\nReply from 142.250.185.46: bytes=32 time=14ms TTL=117\r\nReply from 142.250.185.46: bytes=32 time=16ms TTL=117\r\n"
    }
  ]
}
```

**第 2 次心跳** (10 秒后)

```json
{
  "agent_id": "agent-win-001",
  "timestamp": "2026-01-09T10:30:25Z",
  "reports": [
    {
      "task_id": "heartbeat-sess-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "status": "running",
      "result": {
        "session_id": "sess-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "state": "running",
        "pid": 8472
      },
      "output_cursor": 2148,
      "output_chunk": "Reply from 142.250.185.46: bytes=32 time=15ms TTL=117\r\nReply from 142.250.185.46: bytes=32 time=13ms TTL=117\r\nReply from 142.250.185.46: bytes=32 time=17ms TTL=117\r\n"
    }
  ]
}
```

**说明**：
- 每次心跳只传输新增的输出（从 1520 到 2148）
- 前端通过轮询持续获取新输出并渲染

## 5. 缓冲区溢出场景

### 5.1 大量输出导致缓冲区满

假设 Agent 端缓冲区只有 10MB，某个命令输出了 15MB 数据。

**Agent → Server：上报数据丢失**

```json
{
  "agent_id": "agent-win-001",
  "timestamp": "2026-01-09T10:35:00Z",
  "reports": [
    {
      "task_id": "heartbeat-sess-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "status": "running",
      "result": {
        "session_id": "sess-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "state": "running",
        "pid": 8472,
        "warning": "Output buffer overflow, some data may be lost"
      },
      "output_cursor": 15728640,
      "output_chunk": "[从 oldest_available_cursor 开始的数据]\r\n... [最近 10MB 的输出] ..."
    }
  ]
}
```

**Server 端处理**：

```sql
-- 插入占位符
INSERT INTO terminal_outputs (session_id, cursor_start, cursor_end, output_data)
VALUES (
  'sess-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  5242880,  -- 上次 cursor
  10485760, -- oldest_available_cursor
  '\r\n[Warning: 5242880 bytes of output data lost due to buffer overflow]\r\n'
);

-- 插入实际数据
INSERT INTO terminal_outputs (session_id, cursor_start, cursor_end, output_data)
VALUES (
  'sess-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  10485760,
  15728640,
  '... [实际输出数据] ...'
);
```

## 6. 输入去重场景

### 6.1 网络重传导致重复任务

**第 1 次下发**

```json
{
  "tasks": [
    {
      "task_type": "session_input",
      "task_id": "term-input-dup-test-001",
      "revision": 1,
      "payload": {
        "session_id": "sess-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "client_seq": 5,
        "input_data": "echo hello\r\n"
      }
    }
  ],
  "cancels": []
}
```

**Agent 处理并上报**

```json
{
  "reports": [
    {
      "task_id": "term-input-dup-test-001",
      "status": "completed",
      "result": {
        "session_id": "sess-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "client_seq": 5,
        "bytes_written": 12
      },
      "output_cursor": 3000,
      "output_chunk": "echo hello\r\nhello\r\nPS C:\\> "
    }
  ]
}
```

**第 2 次下发（重传）**

```json
{
  "tasks": [
    {
      "task_type": "session_input",
      "task_id": "term-input-dup-test-001",
      "revision": 1,
      "payload": {
        "session_id": "sess-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "client_seq": 5,
        "input_data": "echo hello\r\n"
      }
    }
  ],
  "cancels": []
}
```

**Agent 去重处理**

```rust
// Agent 端代码
if client_seq <= last_client_seq {
    // 忽略重复输入，返回成功但不写入
    return TaskReport {
        task_id,
        status: "completed",
        result: json!({
            "session_id": session_id,
            "client_seq": client_seq,
            "bytes_written": 0,
            "note": "Duplicate input ignored"
        }),
        output_cursor: current_cursor,
        output_chunk: String::new(),
    };
}
```

## 7. 关闭会话流程

### 7.1 前端 → Server：关闭会话

**HTTP POST** `/api/terminal/close/sess-a1b2c3d4-e5f6-7890-abcd-ef1234567890?force=false`

**响应**：

```json
{
  "status": "ok"
}
```

### 7.2 Server → Agent：下发 session_close 任务

**心跳响应**

```json
{
  "tasks": [
    {
      "task_type": "session_close",
      "task_id": "term-close-final-001",
      "revision": 1,
      "payload": {
        "session_id": "sess-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "force": false
      }
    }
  ],
  "cancels": []
}
```

### 7.3 Agent → Server：上报会话已关闭

**心跳请求**

```json
{
  "agent_id": "agent-win-001",
  "timestamp": "2026-01-09T10:40:00Z",
  "reports": [
    {
      "task_id": "term-close-final-001",
      "status": "completed",
      "result": {
        "session_id": "sess-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "state": "closed",
        "exit_code": 0
      },
      "output_cursor": 3500,
      "output_chunk": "exit\r\n"
    }
  ]
}
```

## 8. 错误场景

### 8.1 会话不存在

**前端请求**

```json
{
  "session_id": "sess-nonexistent-1234",
  "input_data": "ls\r\n"
}
```

**Server 响应**

```json
{
  "error": "Session not found"
}
```

### 8.2 会话已关闭

**前端请求**

```json
{
  "session_id": "sess-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "input_data": "ls\r\n"
}
```

**Server 响应**

```json
{
  "error": "Session is closed"
}
```

### 8.3 Agent 端会话创建失败

**Agent 上报**

```json
{
  "reports": [
    {
      "task_id": "term-open-f9e8d7c6-b5a4-3210-9876-543210fedcba",
      "status": "failed",
      "result": {
        "session_id": "sess-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "state": "failed",
        "pid": null,
        "shell_path": null,
        "error": "Failed to create PTY: Permission denied"
      },
      "output_cursor": 0,
      "output_chunk": ""
    }
  ]
}
```

## 9. Linux/macOS 示例

### 9.1 创建 bash 会话

**前端请求**

```json
{
  "agent_id": "agent-linux-001",
  "shell_type": "bash",
  "cwd": "/home/user/projects",
  "env": {
    "LANG": "en_US.UTF-8",
    "TERM": "xterm-256color"
  },
  "cols": 80,
  "rows": 24
}
```

**Agent 上报**

```json
{
  "reports": [
    {
      "task_id": "term-open-linux-001",
      "status": "completed",
      "result": {
        "session_id": "sess-linux-001",
        "state": "opened",
        "pid": 12345,
        "shell_path": "/bin/bash",
        "exit_code": null,
        "error": null
      },
      "output_cursor": 45,
      "output_chunk": "user@hostname:~/projects$ "
    }
  ]
}
```

### 9.2 执行命令

**输入**

```json
{
  "session_id": "sess-linux-001",
  "input_data": "ls -la\n"
}
```

**输出**

```json
{
  "output_cursor": 512,
  "output_chunk": "ls -la\ntotal 48\ndrwxr-xr-x  5 user user 4096 Jan  9 10:30 .\ndrwxr-xr-x 20 user user 4096 Jan  9 10:00 ..\ndrwxr-xr-x  8 user user 4096 Jan  9 10:25 .git\n-rw-r--r--  1 user user 1024 Jan  9 10:10 README.md\ndrwxr-xr-x  3 user user 4096 Jan  9 10:15 src\nuser@hostname:~/projects$ "
}
```

## 10. 特殊控制字符

### 10.1 Ctrl+C (中断)

**输入**

```json
{
  "session_id": "sess-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "input_data": "\u0003"
}
```

**说明**：`\u0003` 是 ASCII 控制字符 ETX (End of Text)，对应 Ctrl+C

### 10.2 Ctrl+D (EOF)

**输入**

```json
{
  "session_id": "sess-linux-001",
  "input_data": "\u0004"
}
```

### 10.3 方向键

**输入（上箭头）**

```json
{
  "session_id": "sess-linux-001",
  "input_data": "\u001b[A"
}
```

**说明**：ANSI 转义序列
- 上箭头：`\u001b[A`
- 下箭头：`\u001b[B`
- 右箭头：`\u001b[C`
- 左箭头：`\u001b[D`

## 11. 完整交互示例（时序）

```
T=0s    前端: POST /api/terminal/create
        Server: 创建会话记录，返回 session_id

T=5s    Agent: 心跳请求（无上报）
        Server: 返回 session_open 任务

T=6s    Agent: 创建 PTY，启动 shell

T=10s   Agent: 心跳请求，上报 opened + 初始输出
        Server: 保存输出，更新状态

T=11s   前端: GET /api/terminal/output?from_cursor=0
        Server: 返回初始输出

T=12s   前端: POST /api/terminal/input (ls)
        Server: 保存输入，生成 session_input 任务

T=15s   Agent: 心跳请求，上报 completed + 输出增量
        Server: 保存输出

T=16s   前端: GET /api/terminal/output?from_cursor=156
        Server: 返回新输出

T=20s   Agent: 心跳请求（无新输出）
        Server: 返回空任务列表

T=25s   Agent: 心跳请求（无新输出）
        Server: 返回空任务列表

T=30s   前端: POST /api/terminal/close
        Server: 生成 session_close 任务

T=35s   Agent: 心跳请求，上报 closed
        Server: 更新状态，清理资源
```

## 12. 性能测试数据

### 12.1 典型场景

| 场景 | 输出大小 | 心跳次数 | 总传输量 | 备注 |
|------|---------|---------|---------|------|
| 简单命令 (ls) | 2 KB | 1 | 2 KB | 单次心跳完成 |
| 中等输出 (cat file) | 50 KB | 2 | 50 KB | 2 次心跳传输 |
| 大量输出 (find /) | 5 MB | 200 | 5 MB | 持续 16 分钟 |
| 缓冲区溢出 | 15 MB | 300 | 10 MB + 警告 | 丢失 5 MB |

### 12.2 带宽消耗

- **空闲会话**：0 B/s（无输出时不传输）
- **活跃会话**：取决于命令输出速度
- **心跳开销**：~200 B/次（无输出时）

### 12.3 延迟

- **输入到执行**：< 5 秒（心跳间隔）
- **输出到前端**：< 1 秒（轮询间隔）
- **端到端延迟**：< 6 秒（最坏情况）
