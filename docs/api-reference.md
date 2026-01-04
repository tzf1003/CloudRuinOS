# API 参考文档

## 概述

轻量化 RMM 系统提供 RESTful HTTP API 和 WebSocket 实时通信接口。所有 API 都基于 JSON 格式进行数据交换，并采用 Ed25519 签名验证确保请求安全性。

## 基础信息

- **Base URL**: `https://your-rmm-server.example.com`
- **API Version**: v1
- **Content-Type**: `application/json`
- **认证方式**: Ed25519 签名 + Nonce 防重放

## 认证机制

### 签名验证

所有需要认证的请求都必须包含以下 HTTP 头：

```http
X-Device-ID: {device_id}
X-Signature: {ed25519_signature}
X-Nonce: {random_nonce}
```

### 签名生成算法

```typescript
// 签名内容构造
const signaturePayload = `${method}|${path}|${body}|${nonce}|${timestamp}`

// Ed25519 签名
const signature = ed25519.sign(signaturePayload, privateKey)
```

## Agent API

### 设备注册

注册新设备到 RMM 系统。

**端点**: `POST /agent/enroll`

**请求头**:
```http
Content-Type: application/json
```

**请求体**:
```json
{
  "enrollment_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "device_info": {
    "name": "DESKTOP-ABC123",
    "platform": "windows",
    "version": "0.1.0",
    "architecture": "x86_64"
  },
  "public_key": "302a300506032b657003210000d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "device_id": "dev_1234567890abcdef",
    "server_public_key": "302a300506032b657003210000...",
    "endpoints": {
      "heartbeat": "/agent/heartbeat",
      "websocket": "/sessions"
    }
  }
}
```

**错误响应**:
```json
{
  "success": false,
  "error": {
    "code": "INVALID_TOKEN",
    "message": "Enrollment token is invalid or expired"
  }
}
```

### 心跳上报

定期上报设备状态和系统信息。

**端点**: `POST /agent/heartbeat`

**请求头**:
```http
Content-Type: application/json
X-Device-ID: dev_1234567890abcdef
X-Signature: {ed25519_signature}
X-Nonce: {random_nonce}
```

**请求体**:
```json
{
  "timestamp": "2024-01-01T00:00:00Z",
  "status": "online",
  "system_info": {
    "cpu_usage": 45.2,
    "memory_usage": 67.8,
    "disk_usage": 23.1,
    "uptime": 86400,
    "load_average": [1.2, 1.1, 1.0]
  },
  "agent_info": {
    "version": "0.1.0",
    "config_version": "1.0",
    "last_restart": "2024-01-01T00:00:00Z"
  }
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "next_heartbeat": 30,
    "server_time": "2024-01-01T00:00:30Z",
    "commands": [
      {
        "type": "upgrade_websocket",
        "session_id": "sess_abc123",
        "websocket_url": "wss://your-rmm-server.example.com/sessions/sess_abc123"
      }
    ]
  }
}
```

## Console API

### 设备管理

#### 获取设备列表

**端点**: `GET /devices`

**查询参数**:
- `page`: 页码 (默认: 1)
- `limit`: 每页数量 (默认: 20, 最大: 100)
- `status`: 设备状态过滤 (`online`, `offline`, `all`)
- `platform`: 平台过滤 (`windows`, `linux`, `macos`)

**响应**:
```json
{
  "success": true,
  "data": {
    "devices": [
      {
        "id": "dev_1234567890abcdef",
        "name": "DESKTOP-ABC123",
        "platform": "windows",
        "version": "0.1.0",
        "status": "online",
        "last_seen": "2024-01-01T00:00:00Z",
        "system_info": {
          "cpu_usage": 45.2,
          "memory_usage": 67.8,
          "disk_usage": 23.1
        },
        "created_at": "2024-01-01T00:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "pages": 1
    }
  }
}
```

#### 获取设备详情

**端点**: `GET /devices/{device_id}`

**响应**:
```json
{
  "success": true,
  "data": {
    "id": "dev_1234567890abcdef",
    "name": "DESKTOP-ABC123",
    "platform": "windows",
    "version": "0.1.0",
    "status": "online",
    "last_seen": "2024-01-01T00:00:00Z",
    "public_key": "302a300506032b657003210000...",
    "system_info": {
      "cpu_usage": 45.2,
      "memory_usage": 67.8,
      "disk_usage": 23.1,
      "uptime": 86400,
      "load_average": [1.2, 1.1, 1.0]
    },
    "agent_info": {
      "version": "0.1.0",
      "config_version": "1.0",
      "last_restart": "2024-01-01T00:00:00Z"
    },
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:30Z"
  }
}
```

### 会话管理

#### 创建实时会话

**端点**: `POST /sessions`

**请求体**:
```json
{
  "device_id": "dev_1234567890abcdef",
  "type": "interactive"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "session_id": "sess_abc123",
    "device_id": "dev_1234567890abcdef",
    "type": "interactive",
    "status": "pending",
    "websocket_url": "wss://your-rmm-server.example.com/sessions/sess_abc123",
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

#### 获取会话状态

**端点**: `GET /sessions/{session_id}`

**响应**:
```json
{
  "success": true,
  "data": {
    "session_id": "sess_abc123",
    "device_id": "dev_1234567890abcdef",
    "type": "interactive",
    "status": "active",
    "created_at": "2024-01-01T00:00:00Z",
    "connected_at": "2024-01-01T00:00:05Z",
    "last_activity": "2024-01-01T00:01:00Z"
  }
}
```

#### 终止会话

**端点**: `DELETE /sessions/{session_id}`

**响应**:
```json
{
  "success": true,
  "message": "Session terminated successfully"
}
```

### 文件管理

#### 获取文件列表

**端点**: `POST /files/list`

**请求体**:
```json
{
  "device_id": "dev_1234567890abcdef",
  "path": "/home/user",
  "recursive": false,
  "show_hidden": false
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "path": "/home/user",
    "files": [
      {
        "name": "document.txt",
        "path": "/home/user/document.txt",
        "type": "file",
        "size": 1024,
        "modified": "2024-01-01T00:00:00Z",
        "permissions": "rw-r--r--"
      },
      {
        "name": "folder",
        "path": "/home/user/folder",
        "type": "directory",
        "size": 0,
        "modified": "2024-01-01T00:00:00Z",
        "permissions": "rwxr-xr-x"
      }
    ]
  }
}
```

#### 下载文件

**端点**: `GET /files/download`

**查询参数**:
- `device_id`: 设备 ID
- `path`: 文件路径

**响应头**:
```http
Content-Type: application/octet-stream
Content-Disposition: attachment; filename="document.txt"
Content-Length: 1024
X-File-Checksum: sha256:abc123...
```

#### 上传文件

**端点**: `POST /files/upload`

**请求体** (multipart/form-data):
```
device_id: dev_1234567890abcdef
path: /home/user/uploaded.txt
file: [binary data]
```

**响应**:
```json
{
  "success": true,
  "data": {
    "path": "/home/user/uploaded.txt",
    "size": 1024,
    "checksum": "sha256:abc123...",
    "uploaded_at": "2024-01-01T00:00:00Z"
  }
}
```

### 审计日志

#### 获取审计日志

**端点**: `GET /audit`

**查询参数**:
- `page`: 页码 (默认: 1)
- `limit`: 每页数量 (默认: 50, 最大: 200)
- `device_id`: 设备 ID 过滤
- `action`: 操作类型过滤
- `start_date`: 开始日期 (ISO 8601)
- `end_date`: 结束日期 (ISO 8601)

**响应**:
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "id": 1,
        "device_id": "dev_1234567890abcdef",
        "session_id": "sess_abc123",
        "action": "command_executed",
        "details": {
          "command": "ls -la",
          "exit_code": 0,
          "duration": 0.5
        },
        "result": "success",
        "timestamp": "2024-01-01T00:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 1,
      "pages": 1
    }
  }
}
```

### 系统管理

#### 生成注册令牌

**端点**: `POST /admin/enrollment-tokens`

**请求体**:
```json
{
  "expires_in": 3600,
  "description": "New device registration"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
    "expires_at": "2024-01-01T01:00:00Z",
    "description": "New device registration"
  }
}
```

#### 健康检查

**端点**: `GET /health`

**响应**:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-01T00:00:00Z",
    "version": "1.0.0",
    "services": {
      "database": "healthy",
      "kv_store": "healthy",
      "object_storage": "healthy"
    },
    "metrics": {
      "active_devices": 10,
      "active_sessions": 2,
      "total_requests": 1000,
      "error_rate": 0.01
    }
  }
}
```

## WebSocket API

### 连接建立

**URL**: `wss://your-rmm-server.example.com/sessions/{session_id}`

**认证**: 通过查询参数传递设备 ID 和签名
```
?device_id={device_id}&signature={signature}&nonce={nonce}
```

### 消息格式

所有 WebSocket 消息都采用 JSON 格式：

```typescript
interface WSMessage {
  id: string          // 消息唯一标识
  type: string        // 消息类型
  payload: any        // 消息内容
  timestamp: string   // 时间戳 (ISO 8601)
}
```

### 消息类型

#### 命令执行

**发送** (Console → Agent):
```json
{
  "id": "cmd_123",
  "type": "command",
  "payload": {
    "command": "systeminfo",
    "args": [],
    "timeout": 30,
    "working_directory": "/home/user"
  },
  "timestamp": "2024-01-01T00:00:00Z"
}
```

**响应** (Agent → Console):
```json
{
  "id": "cmd_123",
  "type": "command_response",
  "payload": {
    "exit_code": 0,
    "stdout": "System information output...",
    "stderr": "",
    "duration": 2.5
  },
  "timestamp": "2024-01-01T00:00:02Z"
}
```

#### 文件操作

**文件列表请求**:
```json
{
  "id": "file_123",
  "type": "file_list",
  "payload": {
    "path": "/home/user",
    "recursive": false,
    "show_hidden": false
  },
  "timestamp": "2024-01-01T00:00:00Z"
}
```

**文件列表响应**:
```json
{
  "id": "file_123",
  "type": "file_list_response",
  "payload": {
    "path": "/home/user",
    "files": [
      {
        "name": "document.txt",
        "type": "file",
        "size": 1024,
        "modified": "2024-01-01T00:00:00Z"
      }
    ]
  },
  "timestamp": "2024-01-01T00:00:01Z"
}
```

#### 错误处理

**错误响应**:
```json
{
  "id": "cmd_123",
  "type": "error",
  "payload": {
    "code": "COMMAND_TIMEOUT",
    "message": "Command execution timed out after 30 seconds",
    "details": {
      "command": "long-running-command",
      "timeout": 30
    }
  },
  "timestamp": "2024-01-01T00:00:30Z"
}
```

## 错误代码

### HTTP 状态码

- `200 OK`: 请求成功
- `400 Bad Request`: 请求参数错误
- `401 Unauthorized`: 认证失败
- `403 Forbidden`: 权限不足
- `404 Not Found`: 资源不存在
- `429 Too Many Requests`: 请求频率限制
- `500 Internal Server Error`: 服务器内部错误

### 业务错误代码

#### 认证相关
- `INVALID_TOKEN`: 无效的注册令牌
- `TOKEN_EXPIRED`: 令牌已过期
- `INVALID_SIGNATURE`: 签名验证失败
- `NONCE_REUSED`: Nonce 重复使用
- `DEVICE_NOT_FOUND`: 设备不存在

#### 会话相关
- `SESSION_NOT_FOUND`: 会话不存在
- `SESSION_EXPIRED`: 会话已过期
- `SESSION_LIMIT_EXCEEDED`: 会话数量超限
- `WEBSOCKET_CONNECTION_FAILED`: WebSocket 连接失败

#### 文件操作相关
- `FILE_NOT_FOUND`: 文件不存在
- `ACCESS_DENIED`: 访问被拒绝
- `FILE_TOO_LARGE`: 文件过大
- `DISK_SPACE_INSUFFICIENT`: 磁盘空间不足
- `CHECKSUM_MISMATCH`: 校验和不匹配

#### 命令执行相关
- `COMMAND_TIMEOUT`: 命令执行超时
- `COMMAND_BLOCKED`: 命令被阻止
- `EXECUTION_FAILED`: 执行失败
- `PERMISSION_DENIED`: 权限不足

## 速率限制

### API 限制
- **注册 API**: 每 IP 每小时 10 次
- **心跳 API**: 每设备每分钟 2 次
- **文件上传**: 每设备每分钟 5 次
- **其他 API**: 每 IP 每分钟 100 次

### WebSocket 限制
- **消息频率**: 每秒最多 10 条消息
- **连接数**: 每设备最多 3 个并发连接
- **会话时长**: 最长 24 小时

## SDK 和示例

### JavaScript/TypeScript 客户端

```typescript
import { RMMClient } from '@rmm/client'

const client = new RMMClient({
  baseUrl: 'https://your-rmm-server.example.com',
  apiKey: 'your-api-key'
})

// 获取设备列表
const devices = await client.devices.list({
  status: 'online',
  limit: 20
})

// 创建会话
const session = await client.sessions.create({
  device_id: 'dev_123',
  type: 'interactive'
})

// WebSocket 连接
const ws = client.sessions.connect(session.session_id)
ws.on('message', (message) => {
  console.log('Received:', message)
})
```

### Rust Agent 客户端

```rust
use rmm_agent::{Agent, Config};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = Config::load_from_file("config.toml")?;
    let mut agent = Agent::new(config).await?;
    
    // 启动 Agent
    agent.run().await?;
    
    Ok(())
}
```

这个 API 参考文档提供了完整的接口规范，包括请求格式、响应格式、错误处理和使用示例，为客户端开发和集成提供了详细的技术指导。