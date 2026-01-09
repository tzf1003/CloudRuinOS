# 终端系统使用指南

本文档提供终端系统的部署、配置和使用说明。

## 1. 快速开始

### 1.1 环境要求

**Agent 端**：
- Rust 1.70+
- Windows: Windows 10 1809+ (ConPTY 支持)
- Linux/macOS: 标准 PTY 支持

**Server 端**：
- Rust 1.70+
- MySQL 8.0+ 或 MariaDB 10.5+
- 至少 2GB 内存

**前端**：
- Node.js 18+
- React 18+
- xterm.js 5.0+

### 1.2 数据库初始化

```bash
# 创建数据库
mysql -u root -p -e "CREATE DATABASE terminal_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 执行迁移脚本
mysql -u root -p terminal_db < server/migrations/001_create_terminal_tables.sql
```

### 1.3 启动 Server

```bash
cd server

# 配置环境变量
export DATABASE_URL="mysql://user:password@localhost/terminal_db"
export SERVER_PORT=8080

# 编译并运行
cargo build --release
./target/release/server
```

### 1.4 启动 Agent

```bash
cd agent

# 配置环境变量
export AGENT_ID="agent-001"
export SERVER_URL="http://localhost:8080"
export MAX_SESSIONS=10
export HEARTBEAT_INTERVAL=5

# 编译并运行
cargo build --release
./target/release/agent
```

### 1.5 启动前端

```bash
cd console

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

访问 `http://localhost:3000` 即可使用终端界面。

## 2. 配置说明

### 2.1 Agent 配置

**环境变量**：

```bash
# Agent 标识（必需）
AGENT_ID=agent-001

# Server 地址（必需）
SERVER_URL=http://localhost:8080

# 最大并发会话数（默认 10）
MAX_SESSIONS=10

# 心跳间隔（秒，默认 5）
HEARTBEAT_INTERVAL=5

# 输出缓冲区大小（MB，默认 10）
OUTPUT_BUFFER_SIZE=10

# 日志级别（debug/info/warn/error）
LOG_LEVEL=info
```

**配置文件** `agent/config.toml`：

```toml
[agent]
id = "agent-001"
server_url = "http://localhost:8080"
max_sessions = 10
heartbeat_interval = 5

[buffer]
output_size_mb = 10

[logging]
level = "info"
file = "/var/log/agent/terminal.log"
```

### 2.2 Server 配置

**环境变量**：

```bash
# 数据库连接（必需）
DATABASE_URL=mysql://user:password@localhost/terminal_db

# 服务器端口（默认 8080）
SERVER_PORT=8080

# 会话超时时间（分钟，默认 30）
SESSION_TIMEOUT=30

# 输出分页大小（默认 100）
OUTPUT_PAGE_SIZE=100

# 日志级别
LOG_LEVEL=info
```

**配置文件** `server/config.toml`：

```toml
[server]
host = "0.0.0.0"
port = 8080

[database]
url = "mysql://user:password@localhost/terminal_db"
max_connections = 20
min_connections = 5

[session]
timeout_minutes = 30
max_per_user = 50

[output]
page_size = 100
max_chunk_size_kb = 1024

[logging]
level = "info"
file = "/var/log/server/terminal.log"
```

### 2.3 前端配置

**环境变量** `.env`：

```bash
# API 地址
REACT_APP_API_URL=http://localhost:8080

# 轮询间隔（毫秒）
REACT_APP_POLL_INTERVAL=1000

# 滚动缓冲区大小（行数）
REACT_APP_SCROLL_BUFFER=10000

# 默认终端大小
REACT_APP_DEFAULT_COLS=80
REACT_APP_DEFAULT_ROWS=24
```

## 3. API 使用

### 3.1 创建会话

```bash
curl -X POST http://localhost:8080/api/terminal/create \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "agent-001",
    "shell_type": "bash",
    "cwd": "/home/user",
    "cols": 80,
    "rows": 24
  }'
```

**响应**：

```json
{
  "session_id": "sess-a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

### 3.2 发送输入

```bash
curl -X POST http://localhost:8080/api/terminal/input \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "sess-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "input_data": "ls -la\n"
  }'
```

### 3.3 获取输出

```bash
curl "http://localhost:8080/api/terminal/output/sess-a1b2c3d4-e5f6-7890-abcd-ef1234567890?from_cursor=0"
```

**响应**：

```json
{
  "session_id": "sess-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "from_cursor": 0,
  "to_cursor": 512,
  "output_data": "user@hostname:~$ ls -la\ntotal 48\n...",
  "has_more": false
}
```

### 3.4 调整窗口

```bash
curl -X POST http://localhost:8080/api/terminal/resize \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "sess-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "cols": 120,
    "rows": 30
  }'
```

### 3.5 关闭会话

```bash
curl -X POST "http://localhost:8080/api/terminal/close/sess-a1b2c3d4-e5f6-7890-abcd-ef1234567890?force=false"
```

### 3.6 列出会话

```bash
curl "http://localhost:8080/api/terminal/sessions"
```

**响应**：

```json
[
  {
    "session_id": "sess-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "agent_id": "agent-001",
    "user_id": "user-123",
    "shell_type": "bash",
    "state": "running",
    "pid": 12345,
    "output_cursor": 1024,
    "created_at": "2026-01-09T10:30:00Z"
  }
]
```

## 4. 前端集成

### 4.1 基本使用

```typescript
import { Terminal } from './components/Terminal';

function App() {
  return (
    <Terminal
      sessionId="sess-a1b2c3d4-e5f6-7890-abcd-ef1234567890"
      agentId="agent-001"
      shellType="bash"
      onClose={() => console.log('Terminal closed')}
    />
  );
}
```

### 4.2 创建新会话

```typescript
async function createSession(agentId: string, shellType: string) {
  const response = await fetch('/api/terminal/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agent_id: agentId,
      shell_type: shellType,
      cols: 80,
      rows: 24,
    }),
  });

  const data = await response.json();
  return data.session_id;
}
```

### 4.3 自定义主题

```typescript
const xterm = new XTerm({
  theme: {
    background: '#1e1e1e',
    foreground: '#d4d4d4',
    cursor: '#ffffff',
    selection: '#264f78',
    black: '#000000',
    red: '#cd3131',
    green: '#0dbc79',
    yellow: '#e5e510',
    blue: '#2472c8',
    magenta: '#bc3fbc',
    cyan: '#11a8cd',
    white: '#e5e5e5',
  },
});
```

## 5. 运维管理

### 5.1 监控指标

**Prometheus 指标**：

```
# 活跃会话数
terminal_sessions_active{agent_id="agent-001"} 5

# 累计输出字节数
terminal_output_bytes_total{session_id="sess-xxx"} 1048576

# 缓冲区溢出次数
terminal_buffer_overflow_total{agent_id="agent-001"} 2

# 心跳延迟（毫秒）
terminal_heartbeat_latency_ms{agent_id="agent-001"} 150

# 会话持续时间（秒）
terminal_session_duration_seconds{session_id="sess-xxx"} 3600
```

### 5.2 日志查看

**Agent 日志**：

```bash
# 查看实时日志
tail -f /var/log/agent/terminal.log

# 搜索特定会话
grep "sess-a1b2c3d4" /var/log/agent/terminal.log

# 查看错误
grep "ERROR" /var/log/agent/terminal.log
```

**Server 日志**：

```bash
# 查看实时日志
tail -f /var/log/server/terminal.log

# 查看心跳统计
grep "heartbeat" /var/log/server/terminal.log | wc -l

# 查看缓冲区溢出警告
grep "buffer overflow" /var/log/server/terminal.log
```

### 5.3 数据库维护

**清理旧会话**：

```sql
-- 删除 7 天前关闭的会话
DELETE FROM terminal_sessions
WHERE state = 'closed'
  AND closed_at < DATE_SUB(NOW(), INTERVAL 7 DAY);
```

**清理旧输出**：

```sql
-- 删除 30 天前的输出记录
DELETE FROM terminal_outputs
WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY);
```

**优化表**：

```sql
OPTIMIZE TABLE terminal_sessions;
OPTIMIZE TABLE terminal_outputs;
OPTIMIZE TABLE terminal_inputs;
```

### 5.4 定时任务

**Cron 配置** `/etc/cron.d/terminal-cleanup`：

```cron
# 每小时清理超时会话
0 * * * * curl -X POST http://localhost:8080/api/terminal/cleanup

# 每天凌晨 2 点清理旧数据
0 2 * * * mysql -u root -p terminal_db -e "DELETE FROM terminal_outputs WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY);"

# 每周日凌晨 3 点优化表
0 3 * * 0 mysql -u root -p terminal_db -e "OPTIMIZE TABLE terminal_sessions, terminal_outputs, terminal_inputs;"
```

## 6. 故障排查

### 6.1 会话无法创建

**症状**：前端显示 "Failed to create session"

**排查步骤**：

1. 检查 Agent 是否在线：

```bash
curl http://localhost:8080/api/agents
```

2. 查看 Agent 日志：

```bash
tail -f /var/log/agent/terminal.log | grep ERROR
```

3. 检查 Agent 会话数限制：

```bash
# 查看当前会话数
curl http://localhost:8080/api/terminal/sessions | jq '. | length'
```

4. 检查 shell 是否存在：

```bash
# Linux
which bash

# Windows
where powershell.exe
```

### 6.2 输出不更新

**症状**：前端终端无新输出

**排查步骤**：

1. 检查心跳是否正常：

```bash
# 查看最近心跳时间
grep "heartbeat" /var/log/server/terminal.log | tail -1
```

2. 检查 cursor 是否增长：

```sql
SELECT session_id, output_cursor, updated_at
FROM terminal_sessions
WHERE session_id = 'sess-xxx';
```

3. 检查输出表是否有新记录：

```sql
SELECT COUNT(*), MAX(created_at)
FROM terminal_outputs
WHERE session_id = 'sess-xxx';
```

4. 检查前端轮询：

```javascript
// 浏览器控制台
console.log('Last cursor:', outputCursor);
```

### 6.3 缓冲区溢出

**症状**：日志显示 "Output buffer overflow"

**解决方案**：

1. 增加 Agent 端缓冲区大小：

```bash
export OUTPUT_BUFFER_SIZE=20  # 增加到 20MB
```

2. 减少心跳间隔（更频繁传输）：

```bash
export HEARTBEAT_INTERVAL=3  # 减少到 3 秒
```

3. 限制命令输出：

```bash
# 使用 head 限制输出行数
find / | head -1000

# 使用重定向到文件
find / > output.txt
```

### 6.4 会话僵死

**症状**：会话状态为 running 但无响应

**排查步骤**：

1. 检查进程是否存在：

```bash
# Linux
ps aux | grep <pid>

# Windows
tasklist | findstr <pid>
```

2. 检查 PTY 是否正常：

```bash
# Agent 日志
grep "PTY" /var/log/agent/terminal.log | tail -20
```

3. 强制关闭会话：

```bash
curl -X POST "http://localhost:8080/api/terminal/close/sess-xxx?force=true"
```

### 6.5 性能问题

**症状**：终端响应缓慢

**排查步骤**：

1. 检查数据库性能：

```sql
SHOW PROCESSLIST;
SHOW TABLE STATUS LIKE 'terminal_%';
```

2. 检查输出表大小：

```sql
SELECT 
  session_id,
  COUNT(*) as chunk_count,
  SUM(LENGTH(output_data)) as total_bytes
FROM terminal_outputs
GROUP BY session_id
ORDER BY total_bytes DESC
LIMIT 10;
```

3. 优化查询：

```sql
-- 添加索引
CREATE INDEX idx_session_cursor ON terminal_outputs(session_id, cursor_start);

-- 分析查询计划
EXPLAIN SELECT * FROM terminal_outputs 
WHERE session_id = 'sess-xxx' AND cursor_end > 1000
ORDER BY cursor_start ASC LIMIT 100;
```

## 7. 安全最佳实践

### 7.1 认证与授权

```rust
// Server 端中间件
async fn auth_middleware(
    req: Request<Body>,
    next: Next<Body>,
) -> Result<Response, StatusCode> {
    let token = req.headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let user_id = verify_token(token)?;
    req.extensions_mut().insert(user_id);

    Ok(next.run(req).await)
}
```

### 7.2 输入过滤

```rust
// 限制输入大小
const MAX_INPUT_SIZE: usize = 4096;

if input_data.len() > MAX_INPUT_SIZE {
    return Err("Input too large");
}

// 过滤危险字符（可选）
let sanitized = input_data.replace('\0', "");
```

### 7.3 资源限制

```rust
// 限制每用户会话数
const MAX_SESSIONS_PER_USER: usize = 10;

let user_sessions = repo.count_user_sessions(user_id).await?;
if user_sessions >= MAX_SESSIONS_PER_USER {
    return Err("Too many sessions");
}
```

### 7.4 审计日志

```rust
// 记录所有输入
repo.save_input(session_id, client_seq, input_data).await?;

// 记录会话创建
audit_log::info!(
    "Session created: session_id={}, user_id={}, agent_id={}",
    session_id, user_id, agent_id
);
```

## 8. 性能调优

### 8.1 数据库优化

```sql
-- 分区表（按时间）
ALTER TABLE terminal_outputs
PARTITION BY RANGE (UNIX_TIMESTAMP(created_at)) (
    PARTITION p202601 VALUES LESS THAN (UNIX_TIMESTAMP('2026-02-01')),
    PARTITION p202602 VALUES LESS THAN (UNIX_TIMESTAMP('2026-03-01')),
    PARTITION p202603 VALUES LESS THAN (UNIX_TIMESTAMP('2026-04-01'))
);

-- 索引优化
CREATE INDEX idx_session_state ON terminal_sessions(session_id, state);
CREATE INDEX idx_output_cursor ON terminal_outputs(session_id, cursor_start, cursor_end);
```

### 8.2 连接池配置

```rust
let pool = MySqlPoolOptions::new()
    .max_connections(50)
    .min_connections(10)
    .acquire_timeout(Duration::from_secs(5))
    .idle_timeout(Duration::from_secs(600))
    .connect(&database_url)
    .await?;
```

### 8.3 缓存策略

```rust
// 使用 Redis 缓存会话状态
let session_cache = redis::Client::open("redis://localhost")?;

// 缓存最近输出
cache.set_ex(
    format!("session:{}:output", session_id),
    output_data,
    300, // 5 分钟过期
)?;
```

## 9. 高可用部署

### 9.1 多 Agent 部署

```yaml
# docker-compose.yml
version: '3.8'
services:
  agent-1:
    image: terminal-agent:latest
    environment:
      AGENT_ID: agent-001
      SERVER_URL: http://server:8080
    restart: always

  agent-2:
    image: terminal-agent:latest
    environment:
      AGENT_ID: agent-002
      SERVER_URL: http://server:8080
    restart: always
```

### 9.2 Server 负载均衡

```nginx
upstream terminal_servers {
    server server1:8080;
    server server2:8080;
    server server3:8080;
}

server {
    listen 80;
    location /api/ {
        proxy_pass http://terminal_servers;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 9.3 数据库主从复制

```sql
-- 主库配置
[mysqld]
server-id = 1
log-bin = mysql-bin
binlog-format = ROW

-- 从库配置
[mysqld]
server-id = 2
relay-log = mysql-relay-bin
read-only = 1
```

## 10. 常见问题 (FAQ)

**Q: 为什么不使用 WebSocket？**

A: 当前使用 HTTP 轮询 + 心跳协议，简化了实现并保证了幂等性。未来可以添加 WebSocket 支持以提高实时性。

**Q: 缓冲区溢出会丢失多少数据？**

A: Agent 端保留最近 10MB 输出，超出部分会丢失。Server 端会插入警告占位符。建议将大量输出重定向到文件。

**Q: 支持多用户协作吗？**

A: 当前不支持。每个会话只能由创建者访问。未来可以添加会话共享功能。

**Q: 如何备份会话数据？**

A: 定期备份 MySQL 数据库即可：

```bash
mysqldump -u root -p terminal_db > backup.sql
```

**Q: 支持会话录制吗？**

A: 所有输入输出都记录在数据库中，可以通过查询 `terminal_outputs` 表回放会话。
