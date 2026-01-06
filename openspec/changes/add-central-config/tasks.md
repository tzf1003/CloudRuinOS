#变更任务列表 (Change Tasks)

## Server Side
- [ ] **Schema Migration**: 创建 `configurations` 表。 <!-- id: server-migration -->
- [ ] **Config API**: 实现配置合并逻辑 (Global -> Token -> Device) 和获取接口 `GET /api/v1/config/sync`。 <!-- id: server-api -->
- [ ] **Token Logic**: 确保系统初始化时存在默认注册令牌。 <!-- id: server-token -->
- [ ] **Admin API**: 实现配置的 CRUD 接口 (Global/Token/Device) 供控制台使用。 <!-- id: server-admin-api -->

## Agent Side
- [ ] **Refactor Config**: 将 `AgentConfig` 拆分为 `BootstrapConfig` (本地) 和 `DynamicConfig` (云端)。 <!-- id: agent-config-refactor -->
- [ ] **Config Fetch**: 在 Agent 连接/握手阶段增加配置拉取步骤。 <!-- id: agent-fetch -->
- [ ] **Config Apply**: 实现配置的热重载逻辑 (Hot Reload) 或平滑重启。 <!-- id: agent-apply -->
- [ ] **Default Token**: 如果本地未配置 Token，尝试请求或使用默认流程。 <!-- id: agent-token -->

## Verification
- [ ] **Integration Test**: 测试从全流程：Server 设置配置 -> Agent 启动 -> Agent 拉取并生效。
