# 部署指南

## 概述

本指南详细介绍了轻量�?Ruinos 系统的部署流程，包括开发环境搭建、生产环境部署、配置管理和故障排查。系统采�?Cloudflare 平台进行部署，支持全球分布式架构�?

## 环境要求

### 开发环�?

#### 系统要求
- **操作系统**: Windows 10+, macOS 10.15+, Ubuntu 18.04+
- **Node.js**: 18.0+ (推荐 LTS 版本)
- **Rust**: 1.70+ (stable channel)
- **Git**: 2.30+

#### 工具安装

**Node.js �?npm**:
```bash
# 使用 nvm 安装 (推荐)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install --lts
nvm use --lts

# 或直接下载安�?
# https://nodejs.org/
```

**Rust 工具�?*:
```bash
# 安装 Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# 安装跨平台编译目�?
rustup target add x86_64-pc-windows-gnu
rustup target add x86_64-apple-darwin
rustup target add x86_64-unknown-linux-gnu
```

**Wrangler CLI**:
```bash
npm install -g wrangler
wrangler login
```

### 生产环境

#### Cloudflare 账户要求
- **Workers Paid Plan**: 支持 Durable Objects
- **D1 Database**: 数据库服�?
- **KV Storage**: 键值存储服�?
- **R2 Storage**: 对象存储服务 (可�?
- **Pages**: 前端托管服务 (可�?

## 项目结构

```
lightweight-Ruinos/
├── server/                 # Cloudflare Workers 服务�?
�?  ├── src/
�?  ├── migrations/
�?  ├── wrangler.toml
�?  └── package.json
├── agent/                  # Rust Agent
�?  ├── src/
�?  ├── Cargo.toml
�?  └── Cross.toml
├── console/                # React 前端
�?  ├── src/
�?  ├── package.json
�?  └── vite.config.ts
├── scripts/                # 部署脚本
├── docs/                   # 文档
└── README.md
```

## 开发环境搭�?

### 1. 克隆项目

```bash
git clone https://github.com/your-org/lightweight-Ruinos.git
cd lightweight-Ruinos
```

### 2. 安装依赖

```bash
# 安装服务端依�?
cd server
npm install

# 安装前端依赖
cd ../console
npm install

# 构建 Agent
cd ../agent
cargo build
```

### 3. 配置环境变量

创建 `.env` 文件�?

```bash
# 复制环境变量模板
cp .env.example .env
```

编辑 `.env` 文件�?
```env
# Cloudflare 配置
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_API_TOKEN=your_api_token

# 数据库配�?
DATABASE_ID=your_d1_database_id
KV_NAMESPACE_ID=your_kv_namespace_id

# 安全配置
JWT_SECRET=your_jwt_secret_key
ENCRYPTION_KEY=your_encryption_key

# 开发配�?
NODE_ENV=development
API_BASE_URL=http://localhost:8787
```

### 4. 初始化云端资�?

```bash
# 创建 D1 数据�?
wrangler d1 create Ruinos-database

# 创建 KV 命名空间
wrangler kv:namespace create "Ruinos_KV"
wrangler kv:namespace create "Ruinos_KV" --preview

# 创建 R2 存储�?(可�?
wrangler r2 bucket create Ruinos-files
```

### 5. 数据库迁�?

```bash
cd server

# 执行数据库迁�?
wrangler d1 migrations apply Ruinos-database

# 验证迁移
wrangler d1 execute Ruinos-database --command "SELECT name FROM sqlite_master WHERE type='table';"
```

### 6. 启动开发服�?

**启动服务�?*:
```bash
cd server
npm run dev
# �?
wrangler dev --remote
```

**启动前端**:
```bash
cd console
npm run dev
```

**构建和运�?Agent**:
```bash
cd agent
cargo run -- --config config.toml
```

## 生产环境部署

### 1. CI/CD 配置

#### GitHub Actions 工作�?

创建 `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
          cache-dependency-path: |
            server/package-lock.json
            console/package-lock.json
      
      - name: Setup Rust
        uses: actions-rs/toolchain@v1
        with:
          toolchain: stable
          override: true
      
      - name: Install dependencies
        run: |
          cd server && npm ci
          cd ../console && npm ci
      
      - name: Run tests
        run: |
          cd server && npm test
          cd ../console && npm test
          cd ../agent && cargo test
      
      - name: Build Agent
        run: |
          cd agent
          cargo build --release

  deploy-server:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
          cache-dependency-path: server/package-lock.json
      
      - name: Install dependencies
        run: cd server && npm ci
      
      - name: Deploy to Cloudflare Workers
        run: cd server && npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}

  deploy-console:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
          cache-dependency-path: console/package-lock.json
      
      - name: Install dependencies
        run: cd console && npm ci
      
      - name: Build
        run: cd console && npm run build
        env:
          VITE_API_BASE_URL: https://your-Ruinos-server.example.com
      
      - name: Deploy to Cloudflare Pages
        run: cd console && npx wrangler pages deploy dist
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}

  build-agent:
    needs: test
    runs-on: ${{ matrix.os }}
    if: github.ref == 'refs/heads/main'
    strategy:
      matrix:
        include:
          - os: windows-latest
            target: x86_64-pc-windows-msvc
            artifact: ruinos-agent.exe
          - os: ubuntu-latest
            target: x86_64-unknown-linux-gnu
            artifact: ruinos-agent
          - os: macos-latest
            target: x86_64-apple-darwin
            artifact: ruinos-agent
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Rust
        uses: actions-rs/toolchain@v1
        with:
          toolchain: stable
          target: ${{ matrix.target }}
          override: true
      
      - name: Build Agent
        run: |
          cd agent
          cargo build --release --target ${{ matrix.target }}
      
      - name: Upload Artifact
        uses: actions/upload-artifact@v4
        with:
          name: ruinos-agent-${{ matrix.target }}
          path: agent/target/${{ matrix.target }}/release/${{ matrix.artifact }}
```

### 2. 服务端部�?

#### 配置 wrangler.toml

```toml
name = "Ruinos-server"
main = "src/index.ts"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

[env.production]
name = "Ruinos-server-prod"

[[env.production.d1_databases]]
binding = "DB"
database_name = "Ruinos-database"
database_id = "your-database-id"

[[env.production.kv_namespaces]]
binding = "KV"
namespace_id = "your-kv-namespace-id"

[[env.production.r2_buckets]]
binding = "FILES"
bucket_name = "Ruinos-files"

[env.production.durable_objects]
bindings = [
  { name = "SESSION", class_name = "SessionDurableObject" }
]

[[env.production.migrations]]
tag = "v1"
new_classes = ["SessionDurableObject"]

[env.production.vars]
ENVIRONMENT = "production"
LOG_LEVEL = "info"
```

#### 部署命令

```bash
cd server

# 部署到生产环�?
wrangler deploy --env production

# 执行数据库迁�?
wrangler d1 migrations apply Ruinos-database --env production

# 设置 secrets
wrangler secret put JWT_SECRET --env production
wrangler secret put ENCRYPTION_KEY --env production
```

### 3. 前端部署

#### 配置构建环境

创建 `console/.env.production`:
```env
VITE_API_BASE_URL=https://your-Ruinos-server.example.com
VITE_WS_BASE_URL=wss://your-Ruinos-server.example.com
VITE_ENVIRONMENT=production
```

#### 部署�?Cloudflare Pages

```bash
cd console

# 构建生产版本
npm run build

# 部署�?Pages
npx wrangler pages deploy dist --project-name Ruinos-console
```

#### 配置自定义域�?

```bash
# 添加自定义域�?
wrangler pages domain add Ruinos-console your-domain.com

# 配置 DNS 记录
# CNAME: your-domain.com -> Ruinos-console.pages.dev
```

### 4. Agent 分发

#### 跨平台构�?

使用 GitHub Actions 自动构建多平台版本，或本地使�?Cross 工具�?

```bash
cd agent

# 安装 Cross
cargo install cross

# 构建 Windows 版本
cross build --release --target x86_64-pc-windows-gnu

# 构建 Linux 版本
cross build --release --target x86_64-unknown-linux-gnu

# 构建 macOS 版本 (需要在 macOS 上构�?
cargo build --release --target x86_64-apple-darwin
```

#### 创建安装�?

**Windows (使用 WiX)**:
```xml
<!-- agent/installer/windows/ruinos-agent.wxs -->
<?xml version="1.0" encoding="UTF-8"?>
<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi">
  <Product Id="*" Name="Ruinos Agent" Language="1033" Version="1.0.0" 
           Manufacturer="Your Company" UpgradeCode="YOUR-UPGRADE-CODE">
    <Package InstallerVersion="200" Compressed="yes" InstallScope="perMachine" />
    
    <MajorUpgrade DowngradeErrorMessage="A newer version is already installed." />
    <MediaTemplate EmbedCab="yes" />
    
    <Feature Id="ProductFeature" Title="Ruinos Agent" Level="1">
      <ComponentGroupRef Id="ProductComponents" />
    </Feature>
  </Product>
  
  <Fragment>
    <Directory Id="TARGETDIR" Name="SourceDir">
      <Directory Id="ProgramFilesFolder">
        <Directory Id="INSTALLFOLDER" Name="Ruinos Agent" />
      </Directory>
    </Directory>
  </Fragment>
  
  <Fragment>
    <ComponentGroup Id="ProductComponents" Directory="INSTALLFOLDER">
      <Component Id="RuinosAgent" Guid="YOUR-COMPONENT-GUID">
        <File Id="RuinosAgentExe" Source="$(var.SourceDir)\ruinos-agent.exe" />
        <ServiceInstall Id="RuinosAgentService" Name="RuinosAgent" 
                       DisplayName="Ruinos Agent Service" Type="ownProcess" 
                       Start="auto" ErrorControl="normal" />
        <ServiceControl Id="StartRuinosAgent" Name="RuinosAgent" Start="install" 
                       Stop="both" Remove="uninstall" Wait="yes" />
      </Component>
    </ComponentGroup>
  </Fragment>
</Wix>
```

**Linux (使用 systemd)**:
```bash
# 创建 DEB �?
cd agent/installer/linux
dpkg-deb --build ruinos-agent

# 创建 RPM �?
rpmbuild -bb ruinos-agent.spec
```

## 配置管理

### 1. 环境配置

#### 开发环境配�?

```toml
# agent/config/development.toml
[agent]
name = "ruinos-agent"
version = "0.1.0"

[server]
base_url = "http://localhost:8787"
enrollment_endpoint = "/agent/enroll"
heartbeat_endpoint = "/agent/heartbeat"
websocket_endpoint = "/sessions"

[heartbeat]
interval = 30
retry_attempts = 3
retry_delay = 5

[security]
tls_verify = false  # 开发环境可以禁�?
certificate_pinning = false
doh_enabled = false
ech_enabled = false

[logging]
level = "debug"
file_path = "./logs/agent.log"
```

#### 生产环境配置

```toml
# agent/config/production.toml
[agent]
name = "ruinos-agent"
version = "0.1.0"

[server]
base_url = "https://your-Ruinos-server.example.com"
enrollment_endpoint = "/agent/enroll"
heartbeat_endpoint = "/agent/heartbeat"
websocket_endpoint = "/sessions"
connect_timeout = 30
request_timeout = 60

[heartbeat]
interval = 30
retry_attempts = 3
retry_delay = 5

[security]
tls_verify = true
certificate_pinning = true
certificate_pins = [
    "sha256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    "sha256:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB="
]
doh_enabled = true
doh_providers = [
    "https://cloudflare-dns.com/dns-query",
    "https://dns.google/dns-query"
]
ech_enabled = true

[logging]
level = "info"
file_path = "/var/log/ruinos-agent/agent.log"
max_file_size = "10MB"
max_files = 5

[paths]
config_dir = "/etc/ruinos-agent"
data_dir = "/var/lib/ruinos-agent"
log_dir = "/var/log/ruinos-agent"

[file_operations]
max_file_size = "100MB"
allow_hidden_files = false
blocked_paths = [
    "/etc/passwd",
    "/etc/shadow",
    "/root/.ssh"
]

[commands]
default_timeout = 300
max_concurrent = 5
blocked_commands = [
    "rm -rf /",
    "format",
    "fdisk"
]
```

### 2. Secrets 管理

#### Cloudflare Secrets

```bash
# 设置 JWT 密钥
wrangler secret put JWT_SECRET --env production
# 输入: your-super-secret-jwt-key

# 设置加密密钥
wrangler secret put ENCRYPTION_KEY --env production
# 输入: your-32-byte-encryption-key

# 设置数据库加密密�?
wrangler secret put DB_ENCRYPTION_KEY --env production
# 输入: your-database-encryption-key
```

#### Agent 凭证管理

```bash
# 生成设备密钥�?
cd agent
cargo run --bin keygen -- --output /etc/ruinos-agent/device.key

# 设置文件权限
chmod 600 /etc/ruinos-agent/device.key
chown ruinos-agent:ruinos-agent /etc/ruinos-agent/device.key
```

### 3. 监控配置

#### Cloudflare Analytics

�?`wrangler.toml` 中启用分析：

```toml
[env.production.analytics_engine_datasets]
binding = "ANALYTICS"
dataset = "Ruinos_analytics"
```

#### 日志配置

```typescript
// server/src/utils/logger.ts
export class Logger {
  static info(message: string, data?: any) {
    console.log(JSON.stringify({
      level: 'info',
      message,
      data,
      timestamp: new Date().toISOString()
    }))
  }
  
  static error(message: string, error?: Error) {
    console.error(JSON.stringify({
      level: 'error',
      message,
      error: error?.message,
      stack: error?.stack,
      timestamp: new Date().toISOString()
    }))
  }
}
```

## 故障排查

### 1. 常见问题

#### 服务端问�?

**问题**: Worker 部署失败
```
Error: A request to the Cloudflare API failed.
```

**解决方案**:
```bash
# 检�?API Token 权限
wrangler whoami

# 重新登录
wrangler logout
wrangler login

# 检�?wrangler.toml 配置
wrangler config list
```

**问题**: D1 数据库连接失�?
```
Error: D1_ERROR: database not found
```

**解决方案**:
```bash
# 检查数据库 ID
wrangler d1 list

# 更新 wrangler.toml 中的 database_id
# 重新部署
wrangler deploy --env production
```

#### Agent 问题

**问题**: Agent 无法连接服务�?
```
Error: Connection refused (os error 111)
```

**解决方案**:
```bash
# 检查网络连�?
curl -I https://your-Ruinos-server.example.com/health

# 检�?DNS 解析
nslookup your-Ruinos-server.example.com

# 检查防火墙设置
sudo ufw status
sudo iptables -L

# 检�?Agent 配置
cat /etc/ruinos-agent/config.toml
```

**问题**: 签名验证失败
```
Error: Invalid signature
```

**解决方案**:
```bash
# 检查设备密�?
ls -la /etc/ruinos-agent/device.key

# 重新生成密钥�?
sudo ruinos-agent --regenerate-keys

# 重新注册设备
sudo ruinos-agent --enroll --token YOUR_TOKEN
```

#### Console 问题

**问题**: API 请求失败
```
Error: Failed to fetch
```

**解决方案**:
```javascript
// 检�?API 基础 URL
console.log(import.meta.env.VITE_API_BASE_URL)

// 检�?CORS 设置
// 在浏览器开发者工具中查看网络请求
```

### 2. 日志分析

#### 服务端日�?

```bash
# 查看 Worker 日志
wrangler tail --env production

# 过滤错误日志
wrangler tail --env production --format pretty | grep ERROR

# 查看特定时间段的日志
wrangler tail --env production --since 2024-01-01T00:00:00Z
```

#### Agent 日志

```bash
# 查看 Agent 日志
tail -f /var/log/ruinos-agent/agent.log

# 查看错误日志
grep ERROR /var/log/ruinos-agent/agent.log

# 查看最近的连接尝试
grep "connection" /var/log/ruinos-agent/agent.log | tail -20
```

### 3. 性能监控

#### 关键指标

```typescript
// server/src/utils/metrics.ts
export class Metrics {
  static async recordAPICall(endpoint: string, duration: number, status: number) {
    // 记录�?Analytics Engine
    await env.ANALYTICS.writeDataPoint({
      blobs: [endpoint, status.toString()],
      doubles: [duration],
      indexes: [endpoint]
    })
  }
  
  static async recordDeviceHeartbeat(deviceId: string) {
    // 更新设备状�?
    await env.KV.put(`device:${deviceId}:last_seen`, Date.now().toString(), {
      expirationTtl: 300 // 5 分钟过期
    })
  }
}
```

#### 告警设置

```bash
# 使用 Cloudflare Workers �?Cron Triggers
# �?wrangler.toml 中添�?
[triggers]
crons = ["0 */5 * * * *"]  # �?5 分钟检查一�?
```

```typescript
// server/src/cron.ts
export async function handleCron(event: ScheduledEvent) {
  // 检查离线设�?
  const offlineDevices = await checkOfflineDevices()
  
  if (offlineDevices.length > 0) {
    await sendAlert(`${offlineDevices.length} devices are offline`)
  }
  
  // 清理过期数据
  await cleanupExpiredSessions()
  await cleanupOldAuditLogs()
}
```

### 4. 备份与恢�?

#### 数据库备�?

```bash
# 导出 D1 数据�?
wrangler d1 export Ruinos-database --output backup-$(date +%Y%m%d).sql

# 恢复数据�?
wrangler d1 execute Ruinos-database --file backup-20240101.sql
```

#### 配置备份

```bash
# 备份 Agent 配置
tar -czf agent-config-backup.tar.gz /etc/ruinos-agent/

# 恢复配置
tar -xzf agent-config-backup.tar.gz -C /
```

### 5. 安全检�?

#### 定期安全审计

```bash
# 检�?Agent 权限
ls -la /etc/ruinos-agent/
ps aux | grep ruinos-agent

# 检查网络连�?
netstat -tulpn | grep ruinos-agent
ss -tulpn | grep ruinos-agent

# 检查系统日�?
journalctl -u ruinos-agent --since "1 hour ago"
```

#### 证书更新

```bash
# 更新证书固定
# 获取新证书指�?
openssl s_client -connect your-Ruinos-server.example.com:443 | openssl x509 -pubkey -noout | openssl rsa -pubin -outform der | openssl dgst -sha256 -binary | openssl enc -base64

# 更新 Agent 配置中的 certificate_pins
# 重启 Agent 服务
sudo systemctl restart ruinos-agent
```

这个部署指南提供了从开发环境搭建到生产环境部署的完整流程，包括详细的配置说明、故障排查方法和最佳实践，确保系统能够稳定可靠地运行�