# 终端系统快速参考

## 一、核心概念

### 1.1 三端架构

```
前端 (React) ──HTTP──► Server (Rust) ──心跳──► Agent (Rust)
     │                      │                      │
  xterm.js            状态机+DB              PTY/ConPTY
  1秒轮询              任务队列              持久会话
```

### 1.2 关键机制

| 机制 | 作用 | 实现 |
|------|------|------|
| cursor | 增量传输 | 单调递增游标，只传输新数据 |
| client_seq | 输入去重 | 单调递增序列号，防止重复 |
| task_id + revision | 任务幂等 | 唯一标识，防止重复执行 |
| 环形缓冲区 | 内存控制 | 10MB 固定大小，覆盖最旧数据 |

## 二、快速命令

### 2.1 启动服务

```bash
# 数据库
mysql -u root -p terminal_db < server/migrations/001_create_terminal_tables.sql

# Server
cd server && cargo run --release

# Agent
cd agent && cargo run --release

# 前端
cd console && npm run dev
```

### 2.2 API 调用

```bash
# 创建会话
curl -X POST http://localhost:8080/api/terminal/create \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"agent-001","shell_type":"bash","cols":80,"rows":24}'

# 发送输入
curl -X POST http://localhost:8080/api/terminal/input \
  -H "Content-Type: application/json" \
  -d '{"session_id":"sess-xxx","input_data":"ls\n"}'

# 获取输出
curl "http://localhost:8080/api/terminal/output/sess-xxx?from_cursor=0"

# 关闭会话
curl -X POST "http://localhost:8080/api/terminal/close/sess-xxx"
```

### 2.3 数据库查询

```sql
-- 查看活跃会话
SELECT session_id, agent_id, state, output_cursor, created_at
FROM terminal_sessions
WHERE state IN ('opening', 'opened', 'running')
ORDER BY created_at DESC;

-- 查看会话输出
SELECT cursor_start, cursor_end, LENGTH(output_data) as size, created_at
FROM terminal_outputs
WHERE session_id = 'sess-xxx'
ORDER BY cursor_start;

-- 查看输入历史
SELECT client_seq, input_data, created_at
FROM terminal_inputs
WHERE session_id = 'sess-xxx'
ORDER BY client_seq;

-- 清理旧数据
DELETE FROM terminal_outputs WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY);
```

## 三、协议速查

### 3.1 任务类型

| 任务 | 方向 | 作用 |
|------|------|------|
| session_open | Server→Agent | 创建会话 |
| session_input | Server→Agent | 发送输入 |
| session_resize | Server→Agent | 调整窗口 |
| session_close | Server→Agent | 关闭会话 |

### 3.2 会话状态

```
opening → opened → running → closed
   ↓         ↓        ↓         ↑
   └─────────┴────────┴────► failed
```

### 3.3 JSON 模板

**创建会话**：
```json
{
  "task_type": "session_open",
  "task_id": "term-open-{uuid}",
  "revision": 1,
  "payload": {
    "session_id": "sess-{uuid}",
    "shell_type": "bash|cmd|powershell|pwsh|sh|zsh",
    "cwd": "/path/to/dir",
    "env": {"KEY": "value"},
    "cols": 80,
    "rows": 24
  }
}
```

**发送输入**：
```json
{
  "task_type": "session_input",
  "task_id": "term-input-{uuid}",
  "revision": 1,
  "payload": {
    "session_id": "sess-{uuid}",
    "client_seq": 1,
    "input_data": "command\n"
  }
}
```

**上报输出**：
```json
{
  "task_id": "term-input-{uuid}",
  "status": "completed",
  "result": {
    "session_id": "sess-{uuid}",
    "state": "running",
    "pid": 12345
  },
  "output_cursor": 1024,
  "output_chunk": "output data..."
}
```

## 四、配置速查

### 4.1 环境变量

**Agent**：
```bash
AGENT_ID=agent-001
SERVER_URL=http://localhost:8080
MAX_SESSIONS=10
HEARTBEAT_INTERVAL=5
OUTPUT_BUFFER_SIZE=10
```

**Server**：
```bash
DATABASE_URL=mysql://user:pass@localhost/terminal_db
SERVER_PORT=8080
SESSION_TIMEOUT=30
OUTPUT_PAGE_SIZE=100
```

**前端**：
```bash
REACT_APP_API_URL=http://localhost:8080
REACT_APP_POLL_INTERVAL=1000
REACT_APP_SCROLL_BUFFER=10000
```

### 4.2 性能参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| 心跳间隔 | 5 秒 | Agent→Server 心跳频率 |
| 轮询间隔 | 1 秒 | 前端→Server 轮询频率 |
| 缓冲区大小 | 10 MB | Agent 端环形缓冲区 |
| 最大会话数 | 10 | 每个 Agent 并发限制 |
| 会话超时 | 30 分钟 | 无心跳自动关闭 |

## 五、故障排查

### 5.1 常见问题

| 症状 | 可能原因 | 解决方案 |
|------|---------|---------|
| 会话无法创建 | Agent 离线 | 检查 Agent 状态 |
| 输出不更新 | 心跳中断 | 查看 Agent 日志 |
| 缓冲区溢出 | 输出过大 | 增加缓冲区或限制输出 |
| 会话僵死 | 进程崩溃 | 强制关闭会话 |
| 响应缓慢 | 数据库慢 | 优化索引或清理旧数据 |

### 5.2 日志位置

```bash
# Agent 日志
/var/log/agent/terminal.log

# Server 日志
/var/log/server/terminal.log

# 查看错误
grep ERROR /var/log/agent/terminal.log
grep "buffer overflow" /var/log/server/terminal.log
```

### 5.3 监控指标

```bash
# Prometheus 查询
terminal_sessions_active{agent_id="agent-001"}
terminal_output_bytes_total{session_id="sess-xxx"}
terminal_buffer_overflow_total{agent_id="agent-001"}
terminal_heartbeat_latency_ms{agent_id="agent-001"}
```

## 六、代码片段

### 6.1 Agent 端

**创建会话**：
```rust
let config = SessionConfig {
    session_id: "sess-001".to_string(),
    shell_type: ShellType::Bash,
    cwd: Some("/home/user".to_string()),
    env: None,
    cols: 80,
    rows: 24,
};

let session = terminal_manager.create_session(config)?;
```

**写入输入**：
```rust
let client_seq = 1;
let input_data = b"ls -la\n";
session.write_input(client_seq, input_data)?;
```

**读取输出**：
```rust
let from_cursor = 0;
let (current_cursor, output_chunk) = session.get_output_chunk(from_cursor)?;
```

### 6.2 Server 端

**创建会话**：
```rust
let req = SessionCreateRequest {
    agent_id: "agent-001".to_string(),
    shell_type: ShellType::Bash,
    cwd: None,
    env: None,
    cols: 80,
    rows: 24,
};

let session_id = service.create_session("user-123", req).await?;
```

**处理上报**：
```rust
let report = SessionReport {
    task_id: "term-open-001".to_string(),
    status: "completed".to_string(),
    result: SessionReportResult {
        session_id: "sess-001".to_string(),
        state: SessionState::Opened,
        pid: Some(12345),
        shell_path: Some("/bin/bash".to_string()),
        exit_code: None,
        error: None,
    },
    output_cursor: 156,
    output_chunk: "user@host:~$ ".to_string(),
};

service.handle_report(report).await?;
```

### 6.3 前端

**创建会话**：
```typescript
const response = await fetch('/api/terminal/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    agent_id: 'agent-001',
    shell_type: 'bash',
    cols: 80,
    rows: 24,
  }),
});

const { session_id } = await response.json();
```

**发送输入**：
```typescript
await fetch('/api/terminal/input', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    session_id: sessionId,
    input_data: 'ls\n',
  }),
});
```

**轮询输出**：
```typescript
const response = await fetch(
  `/api/terminal/output/${sessionId}?from_cursor=${cursor}`
);

const data = await response.json();
if (data.output_data) {
  xterm.write(data.output_data);
  setCursor(data.to_cursor);
}
```

## 七、测试命令

### 7.1 功能测试

```bash
# 创建会话
SESSION_ID=$(curl -s -X POST http://localhost:8080/api/terminal/create \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"agent-001","shell_type":"bash","cols":80,"rows":24}' \
  | jq -r '.session_id')

# 发送命令
curl -X POST http://localhost:8080/api/terminal/input \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":\"$SESSION_ID\",\"input_data\":\"echo hello\\n\"}"

# 等待 2 秒
sleep 2

# 获取输出
curl "http://localhost:8080/api/terminal/output/$SESSION_ID?from_cursor=0"

# 关闭会话
curl -X POST "http://localhost:8080/api/terminal/close/$SESSION_ID"
```

### 7.2 压力测试

```bash
# 创建 10 个并发会话
for i in {1..10}; do
  curl -X POST http://localhost:8080/api/terminal/create \
    -H "Content-Type: application/json" \
    -d '{"agent_id":"agent-001","shell_type":"bash","cols":80,"rows":24}' &
done
wait

# 查看会话数
curl http://localhost:8080/api/terminal/sessions | jq '. | length'
```

### 7.3 缓冲区测试

```bash
# 发送大量输出命令
curl -X POST http://localhost:8080/api/terminal/input \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":\"$SESSION_ID\",\"input_data\":\"find / 2>/dev/null\\n\"}"

# 监控缓冲区溢出
tail -f /var/log/agent/terminal.log | grep "buffer overflow"
```

## 八、安全检查清单

- [ ] 启用认证（JWT/OAuth）
- [ ] 限制每用户会话数
- [ ] 启用输入审计
- [ ] 配置会话超时
- [ ] 限制输入大小
- [ ] 过滤危险命令
- [ ] 启用 HTTPS
- [ ] 配置 CORS
- [ ] 定期备份数据库
- [ ] 监控异常行为

## 九、性能优化清单

- [ ] 配置数据库连接池
- [ ] 添加输出缓存（Redis）
- [ ] 启用数据库分区
- [ ] 优化数据库索引
- [ ] 配置 CDN（前端）
- [ ] 启用 gzip 压缩
- [ ] 调整心跳间隔
- [ ] 增加缓冲区大小
- [ ] 部署多个 Agent
- [ ] 配置负载均衡

## 十、文档索引

| 文档 | 内容 |
|------|------|
| `terminal_architecture.md` | 架构设计、协议详解 |
| `terminal_protocol_examples.md` | JSON 示例、交互流程 |
| `terminal_usage_guide.md` | 部署、配置、故障排查 |
| `terminal_implementation_summary.md` | 实现总结、功能清单 |
| `terminal_quick_reference.md` | 本文档，快速参考 |

---

**提示**：将本文档打印或保存为 PDF，方便随时查阅。
