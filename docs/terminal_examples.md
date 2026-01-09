# 远程交互式终端 - 完整示例

## 1. 创建会话

### 前端请求
```http
POST /api/terminal/create
Content-Type: application/json

{
  "agent_id": "agent-001",
  "shell_type": "bash",
  "cwd": "/home/user",
  "env": {
    "TERM": "xterm-256color",
    "LANG": "en_US.UTF-8"
  },
  "cols": 80,
  "rows": 24
}
```

### 后端响应
```json
{
  "session_id": "sess-abc123-def456"
}
```

### 后端下发任务（心跳响应）
```json
{
  "tasks": [
    {
      "task_type": "session_open",
      "task_id": "term-open-uuid-1",
      "revision": 1,
      "payload": {
        "session_id": "sess-abc123-def456",
        "shell_type": "bash",
        "cwd": "/home/user",
        "env": {
          "TERM": "xterm-256color",
          "LANG": "en_US.UTF-8"
        },
        "cols": 80,
        "rows": 24
      }
    }
  ],
  "cancels": []
}
```

### Agent 上报（心跳请求）
```json
{
  "agent_id": "agent-001",
  "timestamp": "2026-01-09T10:30:00Z",
  "reports": [
    {
      "task_id": "term-open-uuid-1",
      "status": "completed",
      "result": {
        "session_id": "sess-abc123-def456",
        "state": "opened",
        "pid": 12345,
        "shell_path": "/bin/bash",
        "error": null
      },
      "output_cursor": 0,
      "output_chunk": ""
    }
  ]
}
```

---

## 2. 发送输入

### 前端请求
```http
POST /api/terminal/input
Content-Type: application/json

{
  "session_id": "sess-abc123-def456",
  "input_data": "ls -la\n"
}
```

### 后端下发任务
```json
{
  "tasks": [
    {
      "task_type": "session_input",
      "task_id": "term-input-uuid-2",
      "revision": 1,
      "payload": {
        "session_id": "sess-abc123-def456",
        "client_seq": 1001,
        "input_data": "ls -la\n"
      }
    }
  ]
}
```

### Agent 上报（带输出增量）
```json
{
  "agent_id": "agent-001",
  "timestamp": "2026-01-09T10:30:05Z",
  "reports": [
    {
      "task_id": "term-input-uuid-2",
      "status": "completed",
      "result": {
        "session_id": "sess-abc123-def456",
        "client_seq": 1001,
        "bytes_written": 7
      },
      "output_cursor": 1234,
      "output_chunk": "total 48\ndrwxr-xr-x  5 user user 4096 Jan  9 10:30 .\ndrwxr-xr-x 20 root root 4096 Jan  1 00:00 ..\n-rw-r--r--  1 user user  220 Jan  1 00:00 .bash_logout\n..."
    }
  ]
}
```

---

## 3. 拉取输出

### 前端请求
```http
GET /api/terminal/output/sess-abc123-def456?from_cursor=0
```

### 后端响应
```json
{
  "session_id": "sess-abc123-def456",
  "from_cursor": 0,
  "to_cursor": 1234,
  "output_data": "total 48\ndrwxr-xr-x  5 user user 4096 Jan  9 10:30 .\n...",
  "has_more": false
}
```

---

## 4. 调整窗口大小

### 前端请求
```http
POST /api/terminal/resize
Content-Type: application/json

{
  "session_id": "sess-abc123-def456",
  "cols": 120,
  "rows": 30
}
```

### 后端下发任务
```json
{
  "tasks": [
    {
      "task_type": "session_resize",
      "task_id": "term-resize-uuid-3",
      "revision": 1,
      "payload": {
        "session_id": "sess-abc123-def456",
        "cols": 120,
        "rows": 30
      }
    }
  ]
}
```

### Agent 上报
```json
{
  "agent_id": "agent-001",
  "timestamp": "2026-01-09T10:30:10Z",
  "reports": [
    {
      "task_id": "term-resize-uuid-3",
      "status": "completed",
      "result": {
        "session_id": "sess-abc123-def456",
        "cols": 120,
        "rows": 30
      },
      "output_cursor": 1234,
      "output_chunk": ""
    }
  ]
}
```

---

## 5. 关闭会话

### 前端请求
```http
POST /api/terminal/close/sess-abc123-def456?force=false
```

### 后端下发任务
```json
{
  "tasks": [
    {
      "task_type": "session_close",
      "task_id": "term-close-uuid-4",
      "revision": 1,
      "payload": {
        "session_id": "sess-abc123-def456",
        "force": false
      }
    }
  ]
}
```

### Agent 上报
```json
{
  "agent_id": "agent-001",
  "timestamp": "2026-01-09T10:30:15Z",
  "reports": [
    {
      "task_id": "term-close-uuid-4",
      "status": "completed",
      "result": {
        "session_id": "sess-abc123-def456",
        "state": "closed",
        "exit_code": 0
      },
      "output_cursor": 5678,
      "output_chunk": "logout\n"
    }
  ]
}
```

---

## 6. 心跳中的输出增量上报

### Agent 心跳（无任务，仅上报输出）
```json
{
  "agent_id": "agent-001",
  "timestamp": "2026-01-09T10:30:20Z",
  "reports": [
    {
      "task_id": "heartbeat-sess-abc123-def456",
      "status": "running",
      "result": {
        "session_id": "sess-abc123-def456",
        "state": "running",
        "pid": 12345
      },
      "output_cursor": 6789,
      "output_chunk": "user@host:~$ echo 'hello'\nhello\nuser@host:~$ "
    }
  ]
}
```

---

## 7. 特殊输入示例

### Ctrl+C（中断）
```json
{
  "session_id": "sess-abc123-def456",
  "input_data": "\u0003"
}
```

### Ctrl+D（EOF）
```json
{
  "session_id": "sess-abc123-def456",
  "input_data": "\u0004"
}
```

### 方向键上
```json
{
  "session_id": "sess-abc123-def456",
  "input_data": "\u001b[A"
}
```

### Tab 补全
```json
{
  "session_id": "sess-abc123-def456",
  "input_data": "\t"
}
```

---

## 8. Windows 示例

### 创建 PowerShell 会话
```json
{
  "agent_id": "agent-win-001",
  "shell_type": "powershell",
  "cwd": "C:\\Users\\user",
  "cols": 80,
  "rows": 24
}
```

### 输入命令
```json
{
  "session_id": "sess-win-xyz",
  "input_data": "Get-ChildItem\r\n"
}
```

注意：Windows 使用 `\r\n` 作为换行符。

---

## 9. 错误处理示例

### Session 不存在
```json
{
  "error": "Session not found"
}
```

### Agent 离线
- 任务进入队列，等待下次心跳
- 前端显示"连接中断"

### Shell 进程崩溃
```json
{
  "task_id": "heartbeat-sess-abc123",
  "status": "running",
  "result": {
    "session_id": "sess-abc123",
    "state": "closed",
    "pid": 12345,
    "exit_code": 127
  },
  "output_cursor": 5000,
  "output_chunk": "bash: command not found\n"
}
```

---

## 10. 性能优化建议

### 前端
- 使用虚拟滚动（xterm.js 内置）
- 限制滚动缓冲区大小（10000 行）
- 输出轮询间隔：1 秒（可根据活跃度动态调整）

### 后端
- 输出分片存储（每 1MB 一个记录）
- 定期归档旧输出（7 天后移至对象存储）
- 使用 Redis 缓存最近输出

### Agent
- 环形缓冲区：10MB
- 输出读取线程：4KB 缓冲
- 心跳间隔：5 秒
