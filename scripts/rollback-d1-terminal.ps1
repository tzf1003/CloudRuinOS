# scripts/rollback-d1-terminal.ps1
# 回滚终端表（删除表）

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("local", "test", "production")]
    [string]$Environment = "local"
)

$ErrorActionPreference = "Stop"

Write-Host "=== Cloudflare D1 终端表回滚 ===" -ForegroundColor Red
Write-Host "环境: $Environment" -ForegroundColor Yellow
Write-Host ""

# 切换到 server 目录
Set-Location -Path "$PSScriptRoot\..\server"

# 根据环境选择数据库
$dbName = switch ($Environment) {
    "local" { "ruinos-db-local" }
    "test" { "ruinos-db-test" }
    "production" { "ruinos-db-prod" }
}

Write-Host "目标数据库: $dbName" -ForegroundColor Red
Write-Host ""

# 警告
Write-Host "警告: 此操作将删除以下表及其所有数据:" -ForegroundColor Red
Write-Host "  - terminal_sessions" -ForegroundColor Yellow
Write-Host "  - terminal_outputs" -ForegroundColor Yellow
Write-Host "  - terminal_inputs" -ForegroundColor Yellow
Write-Host ""

# 确认执行
$confirm = Read-Host "确认删除? 输入数据库名称 '$dbName' 以继续"
if ($confirm -ne $dbName) {
    Write-Host "已取消" -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "正在执行回滚..." -ForegroundColor Red

# 回滚 SQL
$rollbackSQL = @"
-- 删除触发器
DROP TRIGGER IF EXISTS update_terminal_sessions_timestamp;

-- 删除表（按依赖顺序）
DROP TABLE IF EXISTS terminal_inputs;
DROP TABLE IF EXISTS terminal_outputs;
DROP TABLE IF EXISTS terminal_sessions;
"@

# 保存到临时文件
$tempFile = "migrations\rollback_terminal_temp.sql"
$rollbackSQL | Out-File -FilePath $tempFile -Encoding UTF8

try {
    if ($Environment -eq "local") {
        wrangler d1 execute $dbName --local --file=$tempFile
    } else {
        wrangler d1 execute $dbName --remote --file=$tempFile
    }
    
    Write-Host ""
    Write-Host "✓ 回滚执行成功!" -ForegroundColor Green
} catch {
    Write-Host ""
    Write-Host "✗ 回滚执行失败: $_" -ForegroundColor Red
    exit 1
} finally {
    # 删除临时文件
    Remove-Item $tempFile -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "=== 回滚完成 ===" -ForegroundColor Green
