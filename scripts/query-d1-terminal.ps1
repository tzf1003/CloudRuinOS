# scripts/query-d1-terminal.ps1
# 查询 D1 终端数据

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("local", "test", "production")]
    [string]$Environment = "local",
    
    [Parameter(Mandatory=$false)]
    [ValidateSet("sessions", "outputs", "inputs", "schema", "custom")]
    [string]$Query = "sessions",
    
    [Parameter(Mandatory=$false)]
    [string]$CustomSQL = "",
    
    [Parameter(Mandatory=$false)]
    [int]$Limit = 10
)

$ErrorActionPreference = "Stop"

# 切换到 server 目录
Set-Location -Path "$PSScriptRoot\..\server"

# 根据环境选择数据库
$dbName = switch ($Environment) {
    "local" { "ruinos-db-local" }
    "test" { "ruinos-db-test" }
    "production" { "ruinos-db-prod" }
}

$remote = if ($Environment -eq "local") { "--local" } else { "--remote" }

Write-Host "=== D1 终端数据查询 ===" -ForegroundColor Cyan
Write-Host "数据库: $dbName ($Environment)" -ForegroundColor Yellow
Write-Host ""

# 预定义查询
$sql = switch ($Query) {
    "sessions" {
        @"
SELECT 
    session_id,
    agent_id,
    user_id,
    shell_type,
    state,
    pid,
    output_cursor,
    created_at,
    updated_at
FROM terminal_sessions
ORDER BY created_at DESC
LIMIT $Limit;
"@
    }
    "outputs" {
        @"
SELECT 
    id,
    session_id,
    cursor_start,
    cursor_end,
    LENGTH(output_data) as output_size,
    created_at
FROM terminal_outputs
ORDER BY created_at DESC
LIMIT $Limit;
"@
    }
    "inputs" {
        @"
SELECT 
    id,
    session_id,
    client_seq,
    input_data,
    created_at
FROM terminal_inputs
ORDER BY created_at DESC
LIMIT $Limit;
"@
    }
    "schema" {
        @"
SELECT 
    type,
    name,
    sql
FROM sqlite_master
WHERE name LIKE 'terminal_%'
ORDER BY type, name;
"@
    }
    "custom" {
        if ([string]::IsNullOrWhiteSpace($CustomSQL)) {
            Write-Host "错误: 使用 -Query custom 时必须提供 -CustomSQL 参数" -ForegroundColor Red
            exit 1
        }
        $CustomSQL
    }
}

Write-Host "执行查询: $Query" -ForegroundColor Green
Write-Host "---" -ForegroundColor Gray
Write-Host $sql -ForegroundColor Gray
Write-Host "---" -ForegroundColor Gray
Write-Host ""

# 执行查询
try {
    $sql | wrangler d1 execute $dbName $remote --command
    Write-Host ""
    Write-Host "✓ 查询完成" -ForegroundColor Green
} catch {
    Write-Host ""
    Write-Host "✗ 查询失败: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "提示: 使用以下命令查看其他数据:" -ForegroundColor Cyan
Write-Host "  会话列表: .\scripts\query-d1-terminal.ps1 -Query sessions" -ForegroundColor Gray
Write-Host "  输出记录: .\scripts\query-d1-terminal.ps1 -Query outputs" -ForegroundColor Gray
Write-Host "  输入记录: .\scripts\query-d1-terminal.ps1 -Query inputs" -ForegroundColor Gray
Write-Host "  表结构:   .\scripts\query-d1-terminal.ps1 -Query schema" -ForegroundColor Gray
Write-Host "  自定义:   .\scripts\query-d1-terminal.ps1 -Query custom -CustomSQL 'SELECT * FROM terminal_sessions WHERE state=\"running\"'" -ForegroundColor Gray
Write-Host ""
