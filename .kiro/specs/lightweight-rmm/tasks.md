# Implementation Plan: 轻量化 RMM 系统

## Overview

本实现计划将轻量化 RMM 系统分解为增量开发的任务，采用 monorepo 结构，包含服务端（TypeScript + Cloudflare Workers）、Agent（Rust 跨平台）和 Console（前端应用）。重点关注本地开发与云端资源的混合测试模式，确保每个步骤都有可验证的输出。

## Tasks

- [x] 1. 项目结构初始化和基础配置
  - 创建 monorepo 目录结构：/server /agent /console /docs
  - 配置 Cloudflare Workers 项目和 wrangler.toml
  - 设置 Rust workspace 和跨平台 feature flags
  - 配置 TypeScript 项目和依赖管理
  - _Requirements: 8.1, 8.2, 6.1_

- [x] 1.1 配置混合测试环境
  - 配置 wrangler remote bindings 连接云端 D1/KV/R2
  - 创建本地开发启动脚本和环境变量配置
  - 编写 docs/test.md 说明混合测试流程
  - _Requirements: 8.1, 8.2, 8.5_

- [x] 2. 数据库 Schema 和基础存储
  - [x] 2.1 创建 D1 数据库迁移文件
    - 实现 devices, sessions, audit_logs, file_operations 表结构
    - 添加索引和外键约束
    - _Requirements: 1.4, 9.1_

  - [x] 2.2 编写数据库迁移属性测试
    - **Property 4: 设备信息持久化**
    - **Validates: Requirements 1.4**

  - [x] 2.3 实现 KV 存储结构定义
    - 定义 nonce、速率限制、会话缓存的数据结构
    - 实现 TTL 和清理策略
    - _Requirements: 2.4, 7.3_

- [x] 3. 服务端核心 API 实现
  - [x] 3.1 实现设备注册 API (/agent/enroll)
    - 验证 enrollment token 有效性和时效性
    - 生成 device_id 和 Ed25519 密钥对
    - 持久化设备信息到 D1
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 3.2 编写设备注册属性测试
    - **Property 1: 令牌生成时效性**
    - **Property 2: 设备注册唯一性**
    - **Property 3: 无效令牌拒绝**
    - **Validates: Requirements 1.1, 1.2, 1.3**

  - [x] 3.3 实现心跳 API (/agent/heartbeat)
    - 验证 Ed25519 签名和 nonce 防重放
    - 更新设备 last_seen 时间戳
    - 实现速率限制和错误处理
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.4 编写心跳机制属性测试
    - **Property 7: 心跳时间戳更新**
    - **Property 8: 签名验证机制**
    - **Property 9: 重放攻击防护**
    - **Validates: Requirements 2.2, 2.3, 2.4**

- [x] 4. Checkpoint - 基础 API 验证
  - 确保所有测试通过，验证本地 Worker + 远程 D1 连接正常
  - 如有问题请询问用户

- [x] 5. Durable Objects WebSocket 会话管理
  - [x] 5.1 实现 SessionDurableObject 类
    - WebSocket 连接管理和消息路由
    - 会话状态管理和超时清理
    - Agent 身份验证和会话绑定
    - _Requirements: 3.1, 3.3, 3.5_

  - [x] 5.2 编写会话管理属性测试
    - **Property 11: 会话创建机制**
    - **Property 13: 会话身份验证**
    - **Property 15: 会话超时清理**
    - **Validates: Requirements 3.1, 3.3, 3.5**

  - [x] 5.3 实现会话创建 API (/sessions)
    - 创建 Durable Object 实例
    - 生成会话 ID 和 WebSocket 升级指令
    - _Requirements: 3.1_

- [x] 6. Rust Agent 核心架构实现
  - [x] 6.1 实现 Agent 核心模块结构
    - core/: protocol, crypto, scheduler, state, reconnect
    - platform/: trait 定义和平台适配接口
    - transport/: HTTP/WebSocket 客户端和网络配置
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 6.2 编写跨平台架构属性测试
    - **Property 26: 平台接口隔离**
    - **Validates: Requirements 6.2**

  - [x] 6.3 实现设备注册客户端
    - 使用 enrollment token 注册设备
    - 生成和安全存储 Ed25519 密钥对
    - 持久化设备凭证到本地文件
    - _Requirements: 1.2, 1.5_

  - [x] 6.4 编写设备注册客户端属性测试
    - **Property 5: 凭证安全存储**
    - **Validates: Requirements 1.5**

- [-] 7. Agent 心跳和网络安全实现
  - [x] 7.1 实现心跳客户端
    - 定期发送签名心跳请求
    - 处理服务端响应和错误重试
    - _Requirements: 2.1, 7.2_

  - [x] 7.2 编写心跳客户端属性测试
    - **Property 6: 心跳定期发送**
    - **Property 30: 请求签名防篡改**
    - **Validates: Requirements 2.1, 7.2**

  - [x] 7.3 实现网络安全增强
    - 严格 TLS 证书验证和可选证书固定
    - DoH 解析器和多提供商回退策略
    - ECH 能力探测和优雅降级（预留接口）
    - _Requirements: 7.1, 7.4, 7.5_

  - [x] 7.4 编写网络安全属性测试
    - **Property 29: TLS 严格验证**
    - **Property 32: DoH 回退策略**
    - **Property 33: ECH 优雅降级**
    - **Validates: Requirements 7.1, 7.4, 7.5**

- [x] 8. Checkpoint - Agent 基础功能验证
  - 确保 Agent 能成功注册和发送心跳
  - 验证网络安全机制正常工作
  - 如有问题请询问用户

- [x] 9. WebSocket 实时通信实现
  - [x] 9.1 实现 Agent WebSocket 客户端
    - 接收 upgrade 指令并建立 WebSocket 连接
    - 实现自动重连机制和指数退避
    - WebSocket 消息序列化/反序列化
    - _Requirements: 3.2, 3.4_

  - [x] 9.2 编写 WebSocket 连接属性测试
    - **Property 12: WebSocket 连接建立**
    - **Property 14: 自动重连机制**
    - **Validates: Requirements 3.2, 3.4**

  - [x] 9.3 实现远程命令执行
    - 接收和解析命令消息
    - 跨平台命令执行和超时处理
    - 执行结果回传和错误处理
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 9.4 编写命令执行属性测试
    - **Property 16: 命令执行机制**
    - **Property 17: 结果回传机制**
    - **Property 18: 命令超时处理**
    - **Property 19: 命令错误处理**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**

- [x] 10. 文件管理功能实现
  - [x] 10.1 实现文件系统操作
    - 跨平台文件列表、读取、写入接口
    - 路径安全策略和权限检查
    - 文件大小限制和完整性验证
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 10.2 编写文件管理属性测试
    - **Property 21: 文件列表功能**
    - **Property 22: 文件下载完整性**
    - **Property 23: 文件上传限制**
    - **Property 24: 路径安全策略**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

  - [x] 10.3 实现服务端文件管理 API
    - /files/list, /files/download, /files/upload 端点
    - 与 Agent 的文件操作消息协议
    - R2 存储集成（可选，用于大文件缓存）
    - _Requirements: 5.1, 5.2, 5.3_

- [x] 11. 审计日志系统实现
  - [x] 11.1 实现审计日志记录
    - 设备注册、命令执行、文件操作事件记录
    - 会话生命周期事件跟踪
    - 敏感操作的详细审计
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 4.5, 5.5_

  - [x] 11.2 编写审计日志属性测试
    - **Property 34: 注册事件审计**
    - **Property 35: 命令执行审计**
    - **Property 36: 文件操作审计记录**
    - **Property 37: 会话生命周期审计**
    - **Property 20: 敏感操作审计**
    - **Property 25: 文件操作审计**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 4.5, 5.5**

  - [x] 11.3 实现审计日志查询 API
    - 按时间、设备、操作类型筛选
    - 分页和性能优化
    - _Requirements: 9.5_

  - [x] 11.4 编写审计查询属性测试
    - **Property 38: 审计日志查询**
    - **Validates: Requirements 9.5**

- [x] 12. Checkpoint - 核心功能完整性验证
  - 运行端到端测试：注册 → 心跳 → 会话 → 命令 → 文件 → 审计
  - 验证所有属性测试通过
  - 如有问题请询问用户

- [x] 13. Console 前端应用实现
  - [x] 13.1 创建 Console 项目结构
    - React/Vue.js 项目初始化
    - API 客户端和状态管理
    - 路由和页面组件结构
    - _Requirements: 8.3_

  - [x] 13.2 实现设备管理界面
    - 设备列表和在线状态显示
    - 设备注册令牌生成
    - 设备详情和历史记录查看
    - _Requirements: 1.1, 2.5_

  - [x] 13.3 编写设备状态显示属性测试
    - **Property 10: 离线状态检测**
    - **Validates: Requirements 2.5**

  - [x] 13.4 实现实时会话管理界面
    - 会话创建和状态监控
    - 命令执行界面和结果显示
    - 文件管理操作界面
    - _Requirements: 3.1, 4.1, 5.1_

  - [x] 13.5 实现审计日志查看界面
    - 日志筛选和搜索功能
    - 操作详情和时间线显示
    - _Requirements: 9.5_

- [x] 14. 部署和 CI/CD 配置
  - [x] 14.1 配置 GitHub Actions 工作流
    - 自动部署 Workers 到生产环境
    - Console 部署到 Cloudflare Pages
    - 测试环境和生产环境分离
    - _Requirements: 10.1, 10.4_

  - [x] 14.2 实现 Secrets 管理
    - Cloudflare secrets 配置
    - 环境变量和配置管理
    - _Requirements: 10.3_

  - [x] 14.3 配置监控和健康检查
    - 系统健康检查端点
    - 监控指标和告警配置
    - 回滚策略和故障恢复
    - _Requirements: 10.2, 10.5_

  - [x] 14.4 编写监控属性测试
    - **Property 39: 健康检查监控**
    - **Validates: Requirements 10.5**

- [x] 15. 跨平台编译和打包
  - [x] 15.1 配置 Rust 跨平台编译
    - Windows/Linux/macOS 编译目标
    - Feature flags 和条件编译配置
    - 静态链接和依赖管理
    - _Requirements: 6.1_

  - [x] 15.2 实现 Agent 安装和服务配置
    - 系统服务安装脚本（可选）
    - 配置文件模板和默认设置
    - 平台特定的安装包构建
    - _Requirements: 6.1_

- [x] 16. 最终集成测试和文档
  - [x] 16.1 运行完整端到端测试套件
    - 本地开发环境测试
    - 云端部署环境测试
    - 跨平台兼容性测试
    - _Requirements: 8.5_

  - [x] 16.2 编写网络功能配置属性测试
    - **Property 27: 网络功能开关**
    - **Property 28: 配置热更新**
    - **Validates: Requirements 6.4, 6.5**

  - [x] 16.3 完善项目文档
    - 架构文档和 API 文档
    - 部署指南和故障排查
    - 安全威胁模型和最佳实践
    - _Requirements: 所有需求的文档化_

- [x] 17. 最终 Checkpoint - 系统完整性验证
  - 确保所有功能正常工作，所有测试通过
  - 验证部署流程和回滚机制
  - 完成 MVP 交付和工程骨架搭建

## Notes

- 标记 `*` 的任务已全部设为必需，确保从一开始就全面覆盖测试和文档
- 每个任务都引用了具体的需求条目以确保可追溯性
- Checkpoint 任务确保增量验证和早期问题发现
- 属性测试验证通用正确性属性，单元测试验证具体示例和边界情况
- 混合测试环境（本地 runtime + 远程资源）是关键的开发和测试策略