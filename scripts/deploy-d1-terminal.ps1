# scripts/deploy-d1-terminal.ps1
# Deploy terminal tables to Cloudflare D1

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("local", "test", "production")]
    [string]$Environment = "local"
)

$ErrorActionPreference = "Stop"

Write-Host "=== Cloudflare D1 Terminal Tables Deployment ===" -ForegroundColor Cyan
Write-Host "Environment: $Environment" -ForegroundColor Yellow
Write-Host ""

# Change to server directory
Set-Location -Path "$PSScriptRoot\..\server"

# Select database based on environment
$dbName = switch ($Environment) {
    "local" { "ruinos-db-local" }
    "test" { "ruinos-db-test" }
    "production" { "ruinos-db-prod" }
}

Write-Host "Target database: $dbName" -ForegroundColor Green
Write-Host ""

# Check if wrangler is installed
try {
    $wranglerVersion = wrangler --version
    Write-Host "[OK] Wrangler installed: $wranglerVersion" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Wrangler not found" -ForegroundColor Red
    Write-Host "Please run: npm install -g wrangler" -ForegroundColor Yellow
    exit 1
}

# Check if migration file exists
$migrationFile = "migrations\001_create_terminal_tables_d1.sql"
if (-not (Test-Path $migrationFile)) {
    Write-Host "[ERROR] Migration file not found: $migrationFile" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Migration file found" -ForegroundColor Green
Write-Host ""

# Show SQL preview
Write-Host "--- SQL Preview (first 10 lines) ---" -ForegroundColor Cyan
Get-Content $migrationFile -TotalCount 10
Write-Host "..." -ForegroundColor Gray
Write-Host ""

# Confirm execution
$confirm = Read-Host "Continue with migration? (y/N)"
if ($confirm -ne "y" -and $confirm -ne "Y") {
    Write-Host "Cancelled" -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "Executing migration..." -ForegroundColor Cyan

# Execute migration
try {
    if ($Environment -eq "local") {
        wrangler d1 execute $dbName --local --file=$migrationFile
    } else {
        wrangler d1 execute $dbName --remote --file=$migrationFile
    }
    
    Write-Host ""
    Write-Host "[OK] Migration executed successfully!" -ForegroundColor Green
} catch {
    Write-Host ""
    Write-Host "[ERROR] Migration failed: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Verifying Tables ===" -ForegroundColor Cyan

# Verify tables were created
$verifySQL = "SELECT name, type FROM sqlite_master WHERE type='table' AND name LIKE 'terminal_%' ORDER BY name;"

try {
    if ($Environment -eq "local") {
        Write-Host "Local database tables:" -ForegroundColor Yellow
        wrangler d1 execute $dbName --local --command=$verifySQL
    } else {
        Write-Host "Remote database tables:" -ForegroundColor Yellow
        wrangler d1 execute $dbName --remote --command=$verifySQL
    }
    
    Write-Host ""
    Write-Host "[OK] Verification complete!" -ForegroundColor Green
} catch {
    Write-Host "Warning: Verification failed, but migration may have succeeded" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Deployment Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
$flag = if($Environment -eq 'local'){'local'}else{'remote'}
Write-Host "1. View schema: wrangler d1 execute $dbName --$flag --command=`"SELECT sql FROM sqlite_master WHERE name='terminal_sessions'`"" -ForegroundColor Gray
Write-Host "2. Test API: Create a terminal session via API" -ForegroundColor Gray
Write-Host "3. Query data: wrangler d1 execute $dbName --$flag --command=`"SELECT * FROM terminal_sessions LIMIT 5`"" -ForegroundColor Gray
Write-Host ""
