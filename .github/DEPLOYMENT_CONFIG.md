# CloudRuinOS 部署配置参考

> 📌 **AI 快速部署指南** - 此文件包含所有部署所需的配置参数，供 AI 协助快速搭建项目使用。

## 🔐 Cloudflare 账户配置

| 参数 | 当前值 | 用途 |
|:---|:---|:---|
| `CLOUDFLARE_ACCOUNT_ID` | `bca2779165ed559212c408087e84885a` | Cloudflare 账户标识 |
| `CLOUDFLARE_API_TOKEN` | `<需在 Dashboard 创建>` | API 访问令牌 |

### 创建 API Token 步骤
1. 访问 [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. 点击 "Create Token"
3. 选择 "Edit Cloudflare Workers" 模板
4. 添加以下权限：
   - Account > Workers KV Storage > Edit
   - Account > Workers R2 Storage > Edit
   - Account > D1 > Edit

---

## 💾 D1 数据库配置

| 环境 | 数据库名称 | DATABASE_ID |
|:---|:---|:---|
| 开发 (dev) | `rmm-db-dev-preview` | `5195f8dc-5709-4794-9720-3d218faff0aa` |
| 预览 (preview) | `rmm-db-preview` | `44aa0d9e-6ff1-4439-8a08-3742c4f59a6c` |
| 本地 (local) | `rmm-db-local` | `c59df70d-6c08-4205-a63d-44aea39f4615` |

**推荐**：开发环境使用 `rmm-db-dev-preview`，生产环境新建独立数据库。

---

## 📦 KV 命名空间配置

| 环境 | 名称 | KV_NAMESPACE_ID |
|:---|:---|:---|
| 主要 | `RMM_KV_LOCAL` | `f41b76e95ce84d4ba3a4953fa00dcae8` |
| 预览 | `RMM_KV_LOCAL_preview` | `9e2f2a3f16d34405b74b5eb775ef07cf` |

---

## 🗄️ R2 存储桶配置

| 环境 | R2_BUCKET_NAME | 用途 |
|:---|:---|:---|
| 开发 | `rmm-files-dev` | Agent 安装包、日志文件存储 |

---

## 🌐 域名配置

| 用途 | 域名 | 完整 URL |
|:---|:---|:---|
| API 服务 | `api.c.54321000.xyz` | `https://api.c.54321000.xyz` |
| 管理控制台 | `admin.c.54321000.xyz` | `https://admin.c.54321000.xyz` |
| Agent 下载 | `download.c.54321000.xyz` | `https://download.c.54321000.xyz` |

---

## 🔑 安全密钥

| 参数 | 值 | 字节数 |
|:---|:---|:---|
| `JWT_SECRET` | `aNQoCe9AHx6E5ivzlv3Fq+ErdB9GWfcgwdDIBJei2m5yxK1x+OedsT19CdRnTm66` | 48 |
| `ENCRYPTION_KEY` | `MNwneyEnqc4OiS9G46IYURTK7jhjHpg0mY2WkeCHmY4=` | 32 |

---

## 📁 配置文件位置

| 文件 | 路径 | 用途 |
|:---|:---|:---|
| 项目根配置 | `.env` | 所有环境变量汇总 |
| Server 配置 | `server/wrangler.toml` | Cloudflare Workers 部署配置 |
| Console 生产配置 | `console/.env` | 前端生产环境 |
| Console 开发配置 | `console/.env.development` | 前端开发环境 |
| Agent 配置 | `agent/install/config.toml` | Agent 运行时配置 |

---

## 🚀 快速部署命令

### 1. 设置 Secrets（首次部署）
```bash
wrangler secret put JWT_SECRET
wrangler secret put ENCRYPTION_KEY
wrangler secret put ADMIN_PASSWORD
```

### 2. 数据库迁移
```bash
cd server
wrangler d1 migrations apply rmm-db-local
```

### 3. 部署服务端
```bash
cd server
wrangler deploy                    # 开发环境
wrangler deploy --env production   # 生产环境
```

### 4. 部署前端
```bash
cd console
npm run build
npx wrangler pages deploy dist --project-name rmm-console
```

### 5. 构建 Agent
```bash
cd agent
cargo build --release
```

---

## 📋 GitHub Actions Secrets

在 GitHub 仓库设置中添加以下 Secrets：

| Secret 名称 | 值来源 |
|:---|:---|
| `CLOUDFLARE_ACCOUNT_ID` | `bca2779165ed559212c408087e84885a` |
| `CLOUDFLARE_API_TOKEN` | 在 Cloudflare Dashboard 创建 |

---

## ⚠️ 注意事项

1. **安全密钥**：JWT_SECRET 和 ENCRYPTION_KEY 不应提交到 Git
2. **API Token**：需要手动在 Cloudflare Dashboard 创建
3. **生产数据库**：建议为生产环境创建独立的 D1 数据库
4. **域名 DNS**：需要在 Cloudflare DNS 中配置相应的 CNAME 记录
