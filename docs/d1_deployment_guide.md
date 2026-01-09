# Cloudflare D1 终端表部署指南

## 前置条件

1. **安装 Wrangler CLI**
```powershell
npm install -g wrangler
```

2. **登录 Cloudflare**
```powershell
wrangler login
```

3. **验证数据库配置**
检查 `server/wrangler.toml` 中的 D1 配置：
- `ruinos-db-local` (本地开发)
- `ruinos-db-test` (测试环境)
- `ruinos-db-prod` (生产环境)

---

## 快速部署

### 本地环境
```powershell
.\scripts\deploy-d1-terminal.ps1 -Environment local
```

### 测试环境
```powershell
.\scripts\deploy-d1-terminal.ps1 -Environment test
```

### 生产环境
```powershell
.\scripts\deploy-d1-terminal.ps1 -Environment production
```

---

## 手动部署步骤

### 1. 执行迁移
```powershell
cd server

# 本地环境
wrangler d1 execute ruinos-db-local --local --file=migrations/001_create_terminal_tables_d1.sql

# 远程环境（测试/生产）
wrangler d1 execute ruinos-db-prod --remote --file=migrations/001_create_terminal_tables_d1.sql
```

### 2. 验证表结构
```powershell
# 查看所有表
wrangler d1 execute ruinos-db-local --local --command="SELECT name FROM sqlite_master WHERE type='table'"

# 查看终端相关表
wrangler d1 execute ruinos-db-local --local --command="SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'terminal_%'"
```

### 3. 查看表结构详情
```powershell
wrangler d1 execute ruinos-db-local --local --command="SELECT sql FROM sqlite_master WHERE name='terminal_sessions'"
```

---

## 数据查询

### 使用查询脚本
```powershell
# 查看会话列表
.\scripts\query-d1-terminal.ps1 -Query sessions -Limit 10

# 查看输出记录
.\scripts\query-d1-terminal.ps1 -Query outputs -Limit 20

# 查看输入记录
.\scripts\query-d1-terminal.ps1 -Query inputs

# 查看表结构
.\scripts\query-d1-terminal.ps1 -Query schema

# 自定义查询
.\scripts\query-d1-terminal.ps1 -Query custom -CustomSQL "SELECT * FROM terminal_sessions WHERE state='running'"
```

### 手动查询
```powershell
# 查询活跃会话
wrangler d1 execute ruinos-db-local --local --command="SELECT session_id, agent_id, state, created_at FROM terminal_sessions WHERE state IN ('opened', 'running') ORDER BY created_at DESC LIMIT 10"

# 查询特定会话的输出
wrangler d1 execute ruinos-db-local --local --command="SELECT cursor_start, cursor_end, LENGTH(output_data) as size FROM terminal_outputs WHERE session_id='sess-xxx' ORDER BY cursor_start"

# 统计数据
wrangler d1 execute ruinos-db-local --local --command="SELECT state, COUNT(*) as count FROM terminal_sessions GROUP BY state"
```

---

## 回滚操作

### 使用回滚脚本
```powershell
# 本地环境
.\scripts\rollback-d1-terminal.ps1 -Environment local

# 测试环境
.\scripts\rollback-d1-terminal.ps1 -Environment test

# 生产环境（谨慎！）
.\scripts\rollback-d1-terminal.ps1 -Environment production
```

### 手动回滚
```powershell
cd server

# 删除表
wrangler d1 execute ruinos-db-local --local --command="DROP TABLE IF EXISTS terminal_inputs"
wrangler d1 execute ruinos-db-local --local --command="DROP TABLE IF EXISTS terminal_outputs"
wrangler d1 execute ruinos-db-local --local --command="DROP TABLE IF EXISTS terminal_sessions"
wrangler d1 execute ruinos-db-local --local --command="DROP TRIGGER IF EXISTS update_terminal_sessions_timestamp"
```

---

## 数据维护

### 清理旧数据
```powershell
# 删除 7 天前关闭的会话
wrangler d1 execute ruinos-db-local --local --command="DELETE FROM terminal_sessions WHERE state='closed' AND closed_at < datetime('now', '-7 days')"

# 删除孤立的输出记录（会话已删除）
wrangler d1 execute ruinos-db-local --local --command="DELETE FROM terminal_outputs WHERE session_id NOT IN (SELECT session_id FROM terminal_sessions)"
```

### 数据统计
```powershell
# 会话统计
wrangler d1 execute ruinos-db-local --local --command="SELECT state, COUNT(*) as count, AVG(output_cursor) as avg_output FROM terminal_sessions GROUP BY state"

# 输出大小统计
wrangler d1 execute ruinos-db-local --local --command="SELECT session_id, SUM(LENGTH(output_data)) as total_size FROM terminal_outputs GROUP BY session_id ORDER BY total_size DESC LIMIT 10"
```

---

## 故障排查

### 1. 迁移失败
**错误**: `table already exists`
**解决**: 表已存在，使用回滚脚本删除后重新部署

**错误**: `database not found`
**解决**: 检查 `wrangler.toml` 中的 `database_id` 是否正确

### 2. 查询失败
**错误**: `no such table`
**解决**: 确认迁移已成功执行

**错误**: `syntax error`
**解决**: 检查 SQL 语法是否符合 SQLite 规范

### 3. 权限问题
**错误**: `unauthorized`
**解决**: 运行 `wrangler login` 重新登录

---

## D1 与 MySQL 差异

| 特性 | MySQL | D1 (SQLite) |
|------|-------|-------------|
| 自增主键 | `AUTO_INCREMENT` | `AUTOINCREMENT` |
| 存储引擎 | `ENGINE=InnoDB` | 不支持 |
| 自动更新时间 | `ON UPDATE CURRENT_TIMESTAMP` | 使用触发器 |
| JSON 类型 | `JSON` | `TEXT` (存储 JSON 字符串) |
| 大文本 | `MEDIUMTEXT` | `TEXT` |
| 时间戳 | `TIMESTAMP` | `TEXT` (ISO 8601) |

---

## 性能优化建议

1. **索引优化**
   - 已创建索引：`agent_id + state`, `user_id + state`, `session_id + cursor_start`
   - 根据查询模式添加复合索引

2. **数据分片**
   - 输出数据按 session 自然分片
   - 考虑定期归档旧数据到 R2

3. **查询优化**
   - 使用 `LIMIT` 限制结果集
   - 避免全表扫描
   - 使用 `EXPLAIN QUERY PLAN` 分析查询

4. **D1 限制**
   - 单次查询最大 1MB 响应
   - 单个数据库最大 2GB
   - 每天最多 100,000 次读取（免费计划）

---

## 监控与告警

### 查看 D1 使用情况
```powershell
wrangler d1 info ruinos-db-local
```

### 监控指标
- 数据库大小
- 查询延迟
- 错误率
- 会话数量

### 告警阈值建议
- 数据库大小 > 1.5GB
- 活跃会话 > 1000
- 单会话输出 > 100MB

---

## 备份与恢复

### 导出数据
```powershell
# 导出所有终端数据
wrangler d1 export ruinos-db-local --local --output=backup_terminal.sql
```

### 导入数据
```powershell
# 从备份恢复
wrangler d1 execute ruinos-db-local --local --file=backup_terminal.sql
```

---

## 下一步

1. 更新 Rust 后端代码以支持 SQLite 语法（如果使用 sqlx）
2. 测试 API 端点与 D1 的集成
3. 配置生产环境的数据库 ID
4. 设置定期备份任务
5. 监控数据库性能指标
