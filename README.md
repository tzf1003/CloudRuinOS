# Ruinos

远程监控与管理系统 - 基于 Cloudflare Workers 的轻量化远程设备管理解决方案

## 项目结构

```
ruinos/
├── server/          # Cloudflare Workers 服务端
├── agent/           # Rust 跨平台 Agent 客户端
├── console/         # React 前端管理控制台
├── docs/            # 项目文档
├── scripts/         # 开发和部署脚本
└── .kiro/specs/     # 功能规格说明
```

## 快速开始

### 环境要求

- Node.js 18+
- Rust 1.70+
- Wrangler CLI
- Cloudflare 账户

### 开发环境设置

1. **克隆项目并安装依赖**
   ```bash
   git clone <repository-url>
   cd ruinos
   npm install
   ```

2. **配置环境变量**
   ```bash
   cp .env.example .env
   # 编辑 .env 文件，填入 Cloudflare 配置
   ```

3. **启动开发环境**
   
   **Windows:**
   ```cmd
   scripts\dev-setup.bat
   ```
   
   **Linux/macOS:**
   ```bash
   ./scripts/dev-setup.sh
   ```

### 访问地址

- **Worker API**: http://localhost:8787
- **Console 控制台**: http://localhost:3000
- **健康检查**: http://localhost:8787/health

## 架构特点

### 🌐 三端架构
- **服务端**: Cloudflare Workers + D1/KV/R2
- **Agent**: Rust 跨平台客户端
- **Console**: React 管理界面

### 🔒 安全机制
- Ed25519 数字签名
- 严格 TLS 验证
- DoH/ECH 网络增强
- 防重放攻击

### 🧪 混合测试
- 本地 runtime + 远程资源
- 端到端测试覆盖
- 属性测试验证

## 开发指南

### 服务端开发
```bash
cd server
npm run dev          # 启动开发服务器
npm test             # 运行单元测试
npm run type-check   # 类型检查
```

### Agent 开发
```bash
cd agent
cargo build          # 编译
cargo test           # 运行测试
cargo run            # 运行 Agent
```

### Console 开发
```bash
cd console
npm run dev          # 启动开发服务器
npm test             # 运行测试
npm run build        # 构建生产版本
```

## 部署

### 测试环境
```bash
npm run deploy:test
```

### 生产环境
```bash
npm run deploy:prod
```

## 📚 文档

完整的项目文档位于 `docs/` 目录：

- **[项目概览](docs/project-overview.md)** - 项目简介、特色和路线图
- **[架构文档](docs/architecture.md)** - 系统架构、技术栈和组件设计
- **[API 参考](docs/api-reference.md)** - 完整的 API 接口文档
- **[部署指南](docs/deployment-guide.md)** - 开发环境搭建和生产部署
- **[安全指南](docs/security-guide.md)** - 威胁模型分析和安全最佳实践
- **[测试文档](docs/test.md)** - 混合测试环境说明
- **[密钥管理](docs/secrets-management.md)** - 密钥和凭证管理指南

### 规格文档
- [功能需求规格](.kiro/specs/lightweight-rmm/requirements.md)
- [系统设计文档](.kiro/specs/lightweight-rmm/design.md)
- [实现任务清单](.kiro/specs/lightweight-rmm/tasks.md)

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

---

**注意**: 这是一个正在开发中的项目，当前版本为 MVP 骨架，核心功能将按照任务清单逐步实现。