# 提案：集中式配置管理 (Central Configuration Management)

## 变更类型 (Change Type)
- [x] 新增功能 (New Feature)
- [x] 架构变更 (Architecture Change)
- [ ] 破坏性变更 (Breaking Change)

## 摘要 (Summary)
实现 Agent 配置的集中化管理，允许从云端（服务器）分层下发配置。支持全局配置、分组配置（基于注册令牌）和单机配置。

## 动机 (Motivation)
当前 Agent 配置完全依赖本地文件，难以进行批量管理、动态调整和统一策略下发。用户需要能够：
1. 从云端加载配置。
2. 对不同层级（全局/分组/单机）进行差异化配置。
3. 利用注册令牌作为设备分组的标识。

## 详细设计 (Detailed Design)

### 1. 配置分层与内存化 (Configuration Layering & In-Memory)
配置将按照以下优先级合并（由低到高）：
1. **默认配置 (Default)**: 代码内置默认值。
2. **全局配置 (Global)**: 适用于所有连接的 Agent。
3. **分组配置 (Group/Token)**: 基于 Agent 注册时使用的 Token 关联的配置。
4. **单机配置 (Device)**: 针对特定 Device ID 的配置。
5. **本地启动参数 (Bootstrap)**: 仅包含连接服务器所需的最少信息（URL, Token），通过 CLI 参数或环境变量传入。

**重点**: 从云端拉取的动态配置（全局/分组/单机）将**仅保留在内存中**，不会写入本地文件系统。这支持"单文件运行"模式，保持客户端轻量且不留痕迹。

### 2. 数据库变更 (Server)
新增 `configurations` 表用于存储各层级配置。
- `scope`: 枚举 `global`, `token`, `device`
- `target_id`: 对应 Token 字符串或 Device ID（Global 时为空）
- `content`: JSON 格式的配置内容

### 3. Agent 变更
- **启动流程**: 仅加载最基础的 "Bootstrap Config" (包含 Server URL, 证书等)。
- **握手/注册**: 连接成功后，发送当前配置指纹。
- **配置拉取**: 如果服务端发现配置变更，下发完整合并后的配置。
- **热更新**: Agent 接收新配置并在运行时应用（支持热更新的模块）。

### 4. 令牌作为分组 (Token as Group)
- 注册令牌 (`enrollment_tokens`) 将被视为"分组"的核心实体。
- 系统需内置或自动生成一个"默认令牌"，用于未指定令牌的设备或默认注册。
- 令牌无有效期限制 (`expires_at = NULL`)。
- 令牌包含 `description` 字段。

## 影响范围 (Impact)
- **Agent**: `src/config.rs`, `src/core/agent.rs` (握手逻辑), `src/main.rs`.
- **Server**: 数据库 Schema, API (`GET /api/v1/config/sync`).
- **Console**: 需要新增配置管理界面（本次提案主要关注后端与协议实现，前端UI适配视情况而定）.

## 替代方案 (Alternatives)
- 仅使用单机配置：管理成本过高。
- 仅使用全局配置：无法满足灰度发布或特定设备组的需求。

