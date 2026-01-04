# 混合测试环境说明

## 概述

RMM 系统采用混合测试模式，结合本地开发环境和云端资源，实现高效的开发和测试流程。

## 架构说明

```
本地开发环境                    云端资源
┌─────────────────┐            ┌─────────────────┐
│ Wrangler Dev    │ ────────── │ D1 Database     │
│ (Local Runtime) │            │ KV Storage      │
│                 │            │ R2 Bucket       │
├─────────────────┤            └─────────────────┘
│ Console         │
│ (localhost:3000)│
├─────────────────┤
│ Agent           │
│ (Rust Binary)   │
└─────────────────┘
```

## 环境配置

### 1. 云端资源准备

在开始本地开发前，需要在 Cloudflare 创建以下资源：

```bash
# 创建 D1 数据库
wrangler d1 create rmm-db
wrangler d1 create rmm-db-test

# 创建 KV 命名空间
wrangler kv:namespace create "RMM_KV"
wrangler kv:namespace create "RMM_KV" --preview

# 创建 R2 存储桶
wrangler r2 bucket create rmm-files
wrangler r2 bucket create rmm-files-test
```

### 2. 配置文件更新

将创建的资源 ID 更新到 `server/wrangler.toml` 中：

```toml
[[d1_databases]]
binding = "DB"
database_name = "rmm-db"
database_id = "your-actual-d1-database-id"  # 替换为实际 ID

[[kv_namespaces]]
binding = "KV"
id = "your-actual-kv-namespace-id"  # 替换为实际 ID

[[r2_buckets]]
binding = "R2"
bucket_name = "rmm-files"
```

### 3. 环境变量配置

复制 `.env.example` 为 `.env` 并填入实际配置：

```bash
cp .env.example .env
# 编辑 .env 文件，填入 Cloudflare Account ID 和 API Token
```

## 开发流程

### 启动开发环境

#### Windows
```cmd
scripts\dev-setup.bat
```

#### Linux/macOS
```bash
./scripts/dev-setup.sh
```

### 手动启动（分步骤）

1. **启动 Worker 服务端**
   ```bash
   cd server
   npm install
   npm run dev  # 使用 wrangler dev --remote
   ```

2. **启动 Console 前端**
   ```bash
   cd console
   npm install
   npm run dev  # 启动 Vite 开发服务器
   ```

3. **编译和运行 Agent**
   ```bash
   cd agent
   cargo build
   cargo run
   ```

## 测试策略

### 1. 单元测试

```bash
# 服务端单元测试
cd server && npm test

# Agent 单元测试
cd agent && cargo test

# Console 单元测试
cd console && npm test
```

### 2. 集成测试（混合模式）

```bash
# 端到端测试（本地 runtime + 远程资源）
cd server && npm run test:e2e:hybrid
```

### 3. 云端集成测试

```bash
# 部署到测试环境
npm run deploy:test

# 运行云端集成测试
cd server && npm run test:integration:cloud
```

## 数据库管理

### 本地开发数据库迁移

```bash
# 对远程 D1 执行迁移（开发环境）
npm run db:migrate

# 对本地 D1 执行迁移（仅用于离线开发）
npm run db:migrate:local
```

### 测试数据管理

```bash
# 重置测试数据库
wrangler d1 execute rmm-db-test --file=migrations/reset.sql

# 插入测试数据
wrangler d1 execute rmm-db-test --file=migrations/seed.sql
```

## 网络配置

### Agent 连接配置

Agent 可以通过环境变量配置连接目标：

```bash
# 连接本地 Worker
export AGENT_SERVER_URL=http://localhost:8787

# 连接测试环境
export AGENT_SERVER_URL=https://rmm-server-test.your-subdomain.workers.dev

# 连接生产环境
export AGENT_SERVER_URL=https://rmm-server-prod.your-subdomain.workers.dev
```

### Console API 配置

Console 通过 Vite 代理连接 API：

```typescript
// vite.config.ts
server: {
  proxy: {
    '/api': {
      target: process.env.API_BASE_URL || 'http://localhost:8787',
      changeOrigin: true,
    },
  },
}
```

## 故障排查

### 常见问题

1. **Worker 无法连接 D1**
   - 检查 `wrangler.toml` 中的 database_id 是否正确
   - 确认已执行数据库迁移
   - 验证 Cloudflare API Token 权限

2. **Agent 连接失败**
   - 检查 Worker 是否正常启动（http://localhost:8787）
   - 验证防火墙设置
   - 查看 Agent 日志输出

3. **Console 无法加载数据**
   - 检查 API 代理配置
   - 验证 CORS 设置
   - 查看浏览器开发者工具网络面板

### 日志查看

```bash
# Worker 日志
wrangler tail

# Agent 日志
cd agent && RUST_LOG=debug cargo run

# Console 开发服务器日志
cd console && npm run dev
```

## 性能优化

### 开发环境优化

1. **使用 Remote Bindings**
   - 避免本地模拟 D1/KV/R2 的性能问题
   - 确保与生产环境一致的行为

2. **热重载配置**
   - Worker: 自动重载代码变更
   - Console: Vite HMR 热模块替换
   - Agent: 需要手动重新编译

3. **并行开发**
   - 三个组件可以独立开发和测试
   - 使用 monorepo 统一依赖管理

## 部署流程

### 测试环境部署

```bash
# 自动部署（推荐）
git push origin main  # 触发 GitHub Actions

# 手动部署
npm run deploy:test
```

### 生产环境部署

```bash
# 创建发布标签
git tag v1.0.0
git push origin v1.0.0  # 触发生产部署

# 手动部署
npm run deploy:prod
```

## 安全注意事项

1. **Secrets 管理**
   ```bash
   # 设置 Worker secrets
   wrangler secret put ENROLLMENT_SECRET
   wrangler secret put JWT_SECRET
   ```

2. **环境隔离**
   - 开发/测试/生产环境使用不同的资源
   - API Token 权限最小化原则

3. **本地开发安全**
   - `.env` 文件不要提交到版本控制
   - 使用测试用的 API Token，避免生产权限