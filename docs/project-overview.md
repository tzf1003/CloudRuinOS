# 轻量�?Ruinos 系统项目概览

## 项目简�?

轻量�?Ruinos（Remote Monitoring and Management）系统是一个基于现代云原生技术栈的远程设备管理解决方案。系统采用三端架构设计，包含基于 Cloudflare Workers 的服务端、Rust 跨平�?Agent �?React 管理控制台，提供设备注册、实时监控、远程命令执行和文件管理等核心功能�?

## 项目特色

### 🌐 云原生架�?
- **全球分布**: 基于 Cloudflare 全球边缘网络，提供低延迟访问
- **无服务器**: 采用 Workers �?Durable Objects，自动扩展，按需付费
- **现代技术栈**: TypeScript + Rust + React，类型安全，性能优异

### 🔒 企业级安�?
- **多层加密**: TLS + Ed25519 签名 + 应用层加�?
- **网络增强**: DoH/ECH 支持，防劫持和隐私保�?
- **零信任架�?*: 严格身份验证，最小权限原�?

### 🚀 开发友�?
- **混合测试**: 本地开�?+ 云端资源，真实环境测�?
- **属性测�?*: 基于 Property-Based Testing 的质量保�?
- **CI/CD 集成**: 自动化构建、测试和部署

### 📊 可观测�?
- **全链路监�?*: �?Agent 到服务端的完整监�?
- **审计日志**: 详细的操作记录和安全事件追踪
- **实时告警**: 异常检测和自动告警机制

## 系统架构

### 整体架构
```
┌─────────────────�?   ┌─────────────────────────────────�?   ┌─────────────────�?
�?  管理控制�?    �?   �?       Cloudflare 服务�?        �?   �?  受控�?Agent   �?
�?               �?   �?                               �?   �?               �?
�? React + TS    │◄──►│  Workers + Durable Objects     │◄──►│  Rust 跨平�?   �?
�? Tailwind UI   �?   �? D1 + KV + R2                 �?   �? 网络安全增强    �?
�? 实时监控界面   �?   �? 全球边缘网络                   �?   �? 系统集成       �?
└─────────────────�?   └─────────────────────────────────�?   └─────────────────�?
```

### 技术栈详情

#### 服务�?(Cloudflare Platform)
- **计算**: Workers (V8 Runtime) + Durable Objects
- **存储**: D1 (SQLite) + KV Store + R2 (S3-compatible)
- **网络**: 全球 CDN + DDoS 防护
- **语言**: TypeScript + Hono.js 框架

#### 受控�?(Rust Agent)
- **语言**: Rust 2021 Edition
- **异步**: Tokio 运行�?
- **网络**: Reqwest + Tokio-tungstenite
- **加密**: Ed25519-dalek + Ring
- **跨平�?*: Windows + Linux + macOS

#### 管理�?(React Console)
- **框架**: React 18 + TypeScript
- **构建**: Vite + SWC
- **UI**: Tailwind CSS + Shadcn/ui
- **状�?*: React Hooks + Context

## 核心功能

### 1. 设备管理
- **安全注册**: 基于时效性令牌的设备注册机制
- **身份验证**: Ed25519 数字签名验证
- **状态监�?*: 实时心跳和系统信息收�?
- **设备分组**: 按平台、状态、标签分组管�?

### 2. 实时会话
- **WebSocket 通信**: 基于 Durable Objects 的实时会�?
- **命令执行**: 非交互式命令远程执行
- **会话管理**: 多会话并发，自动超时清理
- **连接恢复**: Agent 自动重连机制

### 3. 文件管理
- **文件浏览**: 远程目录和文件列�?
- **文件传输**: 安全的上传下载功�?
- **权限控制**: 基于路径的访问控制策�?
- **完整性验�?*: 文件传输校验和验�?

### 4. 审计日志
- **操作记录**: 完整的用户操作审�?
- **安全事件**: 异常行为检测和记录
- **日志查询**: 多维度筛选和搜索
- **合规支持**: 满足各种合规性要�?

## 安全特�?

### 网络安全
- **TLS 1.3**: 强制加密传输
- **证书固定**: 防止中间人攻�?
- **DoH 支持**: DNS over HTTPS 防劫�?
- **ECH 支持**: 加密 Client Hello 隐私保护

### 身份安全
- **Ed25519 签名**: 高性能椭圆曲线数字签名
- **Nonce 防重�?*: 防止请求重放攻击
- **时间戳验�?*: 防止过期请求攻击
- **设备指纹**: 基于硬件特征的设备识�?

### 数据安全
- **端到端加�?*: 敏感数据全程加密
- **密钥管理**: 安全的密钥生成和存储
- **数据脱敏**: 日志中的敏感信息脱敏
- **安全删除**: 数据删除时的安全清理

## 开发流�?

### 1. 环境搭建
```bash
# 克隆项目
git clone https://github.com/your-org/lightweight-Ruinos.git
cd lightweight-Ruinos

# 安装依赖
npm install  # 根目�?
cd server && npm install
cd ../console && npm install
cd ../agent && cargo build

# 配置环境
cp .env.example .env
# 编辑 .env 文件配置 Cloudflare 凭证

# 初始化云端资�?
wrangler d1 create Ruinos-database
wrangler kv:namespace create "Ruinos_KV"

# 启动开发服�?
npm run dev  # 启动所有服�?
```

### 2. 测试策略
- **单元测试**: 每个模块的独立功能测�?
- **集成测试**: 跨模块的接口测试
- **端到端测�?*: 完整用户流程测试
- **属性测�?*: 基于 Property-Based Testing 的随机测�?
- **安全测试**: 渗透测试和漏洞扫描

### 3. 部署流程
```yaml
# CI/CD 流程
开�?�?代码审查 �?自动测试 �?构建打包 �?部署�?Staging �?生产部署
```

## 项目结构

```
lightweight-Ruinos/
├── 📁 server/                    # Cloudflare Workers 服务�?
�?  ├── 📁 src/
�?  �?  ├── 📁 api/              # API 路由和处理器
�?  �?  ├── 📁 database/         # 数据库操�?
�?  �?  ├── 📁 storage/          # KV/R2 存储
�?  �?  ├── 📁 utils/            # 工具函数
�?  �?  └── 📄 index.ts          # 入口文件
�?  ├── 📁 migrations/           # 数据库迁�?
�?  ├── 📁 test/                 # 测试文件
�?  ├── 📄 wrangler.toml         # Cloudflare 配置
�?  └── 📄 package.json
�?
├── 📁 agent/                     # Rust Agent
�?  ├── 📁 src/
�?  �?  ├── 📁 core/             # 核心逻辑
�?  �?  ├── 📁 platform/         # 平台适配
�?  �?  ├── 📁 transport/        # 网络传输
�?  �?  └── 📄 main.rs           # 入口文件
�?  ├── 📁 install/              # 安装脚本
�?  ├── 📁 tests/                # 测试文件
�?  ├── 📄 Cargo.toml            # Rust 配置
�?  └── 📄 Cross.toml            # 跨平台编译配�?
�?
├── 📁 console/                   # React 前端
�?  ├── 📁 src/
�?  �?  ├── 📁 components/       # React 组件
�?  �?  ├── 📁 pages/            # 页面组件
�?  �?  ├── 📁 hooks/            # 自定�?Hooks
�?  �?  ├── 📁 lib/              # 工具�?
�?  �?  └── 📄 main.tsx          # 入口文件
�?  ├── 📄 package.json
�?  └── 📄 vite.config.ts        # Vite 配置
�?
├── 📁 scripts/                   # 构建和部署脚�?
�?  ├── 📄 build-cross-platform.sh
�?  ├── 📄 dev-setup.sh
�?  └── 📄 test-cross-platform.sh
�?
├── 📁 docs/                      # 项目文档
�?  ├── 📄 architecture.md       # 架构文档
�?  ├── 📄 api-reference.md      # API 参�?
�?  ├── 📄 deployment-guide.md   # 部署指南
�?  ├── 📄 security-guide.md     # 安全指南
�?  └── 📄 project-overview.md   # 项目概览
�?
├── 📁 .github/                   # GitHub Actions
�?  └── 📁 workflows/
�?      ├── 📄 build-cross-platform.yml
�?      ├── 📄 deploy-server.yml
�?      └── 📄 test-agent.yml
�?
├── 📄 README.md                  # 项目说明
├── 📄 .env.example              # 环境变量模板
└── 📄 package.json              # 根项目配�?
```

## 性能指标

### 延迟指标
- **API 响应时间**: < 100ms (P95)
- **WebSocket 连接**: < 200ms
- **心跳间隔**: 30�?(可配�?
- **文件传输**: 取决于文件大小和网络条件

### 吞吐量指�?
- **并发设备**: 10,000+ (理论上无限制)
- **并发会话**: 1,000+ 每个 Durable Object
- **API QPS**: 10,000+ (Cloudflare Workers 限制)
- **文件大小**: 最�?100MB (可配�?

### 可用性指�?
- **服务可用�?*: 99.9% (Cloudflare SLA)
- **数据持久�?*: 99.999999999% (11�?)
- **故障恢复**: < 1分钟 (自动故障转移)
- **备份恢复**: < 1小时 (数据库备�?

## 成本分析

### Cloudflare 成本 (月度估算)
```
Workers:
- 免费额度: 100,000 请求/�?
- 付费: $5/�?+ $0.50/百万请求

Durable Objects:
- 免费额度: 1,000,000 请求/�?
- 付费: $12.50/�?+ $0.15/百万请求

D1 Database:
- 免费额度: 5GB 存储 + 25B 读取/�?
- 付费: $5/�?+ $1/GB + $1/百万读取

KV Store:
- 免费额度: 100,000 读取/�?
- 付费: $5/�?+ $0.50/百万读取

总计 (1000 设备):
- 开�?测试: $0-50/�?
- 生产环境: $100-500/�?
```

### 开发成�?
- **开发时�?*: 3-6个月 (2-3人团�?
- **维护成本**: 1�?* 20% 时间
- **基础设施**: 主要�?Cloudflare 费用
- **第三方服�?*: 监控、告警、CI/CD �?

## 路线�?

### Phase 1: MVP (已完�?
- �?基础架构搭建
- �?设备注册和心�?
- �?实时会话管理
- �?基础文件操作
- �?审计日志记录

### Phase 2: 增强功能 (进行�?
- 🔄 网络安全增强 (DoH/ECH)
- 🔄 跨平�?Agent 优化
- 🔄 性能监控和告�?
- 🔄 批量操作支持

### Phase 3: 企业功能 (计划�?
- 📋 多租户支�?
- 📋 RBAC 权限管理
- 📋 API 限流和配�?
- 📋 高级分析和报�?

### Phase 4: 生态扩�?(未来)
- 📋 插件系统
- 📋 第三方集�?
- 📋 移动端支�?
- 📋 AI 辅助运维

## 贡献指南

### 开发规�?
- **代码风格**: 使用 Prettier + ESLint (TS) �?rustfmt (Rust)
- **提交规范**: 遵循 Conventional Commits
- **分支策略**: Git Flow 工作�?
- **代码审查**: 所�?PR 必须经过审查

### 测试要求
- **单元测试覆盖�?*: > 80%
- **集成测试**: 关键路径必须覆盖
- **性能测试**: 关键接口性能基准
- **安全测试**: 定期安全扫描

### 文档要求
- **API 文档**: 所有接口必须有文档
- **代码注释**: 复杂逻辑必须有注�?
- **变更日志**: 记录所有重要变�?
- **用户文档**: 面向用户的使用指�?

## 许可�?

本项目采�?MIT 许可证，详见 [LICENSE](../LICENSE) 文件�?

## 联系方式

- **项目主页**: https://github.com/your-org/lightweight-Ruinos
- **问题反馈**: https://github.com/your-org/lightweight-Ruinos/issues
- **讨论�?*: https://github.com/your-org/lightweight-Ruinos/discussions
- **邮件联系**: Ruinos-team@your-org.com

---

*本文档最后更新时�? 2024-01-01*