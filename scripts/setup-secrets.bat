@echo off
REM Ruinos System Secrets Management Script for Windows
REM This script helps set up Cloudflare secrets for different environments

setlocal enabledelayedexpansion

REM Check if arguments provided
if "%1"=="" goto :usage
if "%1"=="help" goto :usage
if "%1"=="--help" goto :usage

REM Check if wrangler is installed
where wrangler >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] wrangler CLI is not installed. Please install it first:
    echo npm install -g wrangler
    echo.
    pause
    exit /b 1
)

REM Check if user is logged in
wrangler whoami >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] You are not logged in to Cloudflare. Please run:
    echo wrangler login
    echo.
    pause
    exit /b 1
)

REM Handle commands
if "%1"=="setup" goto :setup_command
if "%1"=="list" goto :list_command
goto :usage

:setup_command
if "%2"=="" (
    echo.
    echo [ERROR] Environment name required
    echo Usage: %0 setup ^<environment^>
    echo Environments: development, test, production
    echo.
    pause
    exit /b 1
)
set ENV=%2
echo.
echo ==========================================
echo Ruinos Secrets Setup
echo Environment: %ENV%
echo ==========================================
echo.
goto :setup_secrets

:list_command
if "%2"=="" (
    echo.
    echo [ERROR] Environment name required
    echo Usage: %0 list ^<environment^>
    echo.
    pause
    exit /b 1
)
set ENV=%2
echo.
echo [INFO] Listing secrets for environment: %ENV%
echo.
cd server
wrangler secret list --env %ENV%
cd ..
goto :end

:setup_secrets
echo Setting up 6 required secrets for %ENV% environment...
echo.
echo This will generate secure random values for:
echo   - ENROLLMENT_SECRET
echo   - JWT_SECRET
echo   - WEBHOOK_SECRET
echo   - DB_ENCRYPTION_KEY
echo   - ADMIN_API_KEY
echo.
echo And prompt you to set:
echo   - ADMIN_PASSWORD (console login password)
echo.
pause

REM Generate and set ENROLLMENT_SECRET
echo.
echo [1/6] Setting ENROLLMENT_SECRET...
call :generate_secret ENROLLMENT_SECRET
cd server
echo !ENROLLMENT_SECRET! | wrangler secret put ENROLLMENT_SECRET --env %ENV%
cd ..

REM Generate and set JWT_SECRET
echo.
echo [2/6] Setting JWT_SECRET...
call :generate_secret JWT_SECRET
cd server
echo !JWT_SECRET! | wrangler secret put JWT_SECRET --env %ENV%
cd ..

REM Generate and set WEBHOOK_SECRET
echo.
echo [3/6] Setting WEBHOOK_SECRET...
call :generate_secret WEBHOOK_SECRET
cd server
echo !WEBHOOK_SECRET! | wrangler secret put WEBHOOK_SECRET --env %ENV%
cd ..

REM Generate and set DB_ENCRYPTION_KEY
echo.
echo [4/6] Setting DB_ENCRYPTION_KEY...
call :generate_secret DB_ENCRYPTION_KEY
cd server
echo !DB_ENCRYPTION_KEY! | wrangler secret put DB_ENCRYPTION_KEY --env %ENV%
cd ..

REM Generate and set ADMIN_API_KEY
echo.
echo [5/6] Setting ADMIN_API_KEY...
call :generate_secret ADMIN_API_KEY
cd server
echo !ADMIN_API_KEY! | wrangler secret put ADMIN_API_KEY --env %ENV%
cd ..

REM Set ADMIN_PASSWORD (user input)
echo.
echo [6/6] Setting ADMIN_PASSWORD...
echo IMPORTANT: This password is for console web UI login.
echo You'll need to remember this password to access the console.
echo.
cd server
wrangler secret put ADMIN_PASSWORD --env %ENV%
cd ..

echo.
echo ==========================================
echo Secrets setup completed successfully!
echo ==========================================
echo.
echo IMPORTANT: Save your ADMIN_PASSWORD securely!
echo You'll need it to login at:
echo   - Production: https://ruinos-console.pages.dev
echo.
echo To verify secrets were set:
echo   %0 list %ENV%
echo.
pause
goto :end

:generate_secret
set "chars=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
set "result="
for /l %%i in (1,1,64) do (
    set /a "rand=!random! %% 62"
    for %%j in (!rand!) do set "result=!result!!chars:~%%j,1!"
)
set "%1=!result!"
goto :eof

:usage
echo.
echo ==========================================
echo Ruinos System Secrets Management
echo ==========================================
echo.
echo Usage: %0 ^<command^> ^<environment^>
echo.
echo Commands:
echo   setup ^<env^>    Set up all required secrets for environment
echo   list ^<env^>     List current secrets for environment
echo   help          Show this help message
echo.
echo Environments:
echo   development   Development environment
echo   test          Test environment
echo   production    Production environment
echo.
echo Examples:
echo   %0 setup production
echo   %0 list test
echo.
echo Required secrets that will be configured:
echo   1. ENROLLMENT_SECRET    - Device enrollment tokens
echo   2. JWT_SECRET           - JWT token signing
echo   3. WEBHOOK_SECRET       - Webhook verification
echo   4. DB_ENCRYPTION_KEY    - Database encryption
echo   5. ADMIN_API_KEY        - API authentication
echo   6. ADMIN_PASSWORD       - Console login password
echo.
pause
exit /b 0

:end
endlocal
