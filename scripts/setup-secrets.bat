@echo off
REM Ruinos System Secrets Management Script for Windows
REM This script helps set up Cloudflare secrets for different environments

setlocal enabledelayedexpansion

REM Check if wrangler is installed
where wrangler >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] wrangler CLI is not installed. Please install it first:
    echo npm install -g wrangler
    exit /b 1
)

REM Check if user is logged in
wrangler whoami >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] You are not logged in to Cloudflare. Please run:
    echo wrangler login
    exit /b 1
)

REM Function to generate random secret (simplified for Windows)
set "chars=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
set "secret="
for /l %%i in (1,1,32) do (
    set /a "rand=!random! %% 62"
    for %%j in (!rand!) do set "secret=!secret!!chars:~%%j,1!"
)

REM Function to set secret
:set_secret
set env=%1
set secret_name=%2
set secret_value=%3

if "%secret_value%"=="" (
    echo [WARN] Skipping empty secret: %secret_name% for environment: %env%
    goto :eof
)

echo [INFO] Setting secret %secret_name% for environment: %env%
cd server
echo %secret_value% | wrangler secret put %secret_name% --env %env%
cd ..
goto :eof

REM Main setup function
:setup_secrets
set env=%1

echo [INFO] Setting up secrets for environment: %env%

REM Generate secrets if not provided
if "%ENROLLMENT_SECRET%"=="" (
    call :generate_secret ENROLLMENT_SECRET
    echo [INFO] Generated ENROLLMENT_SECRET
)
call :set_secret %env% ENROLLMENT_SECRET %ENROLLMENT_SECRET%

if "%JWT_SECRET%"=="" (
    call :generate_secret JWT_SECRET
    echo [INFO] Generated JWT_SECRET
)
call :set_secret %env% JWT_SECRET %JWT_SECRET%

if "%WEBHOOK_SECRET%"=="" (
    call :generate_secret WEBHOOK_SECRET
    echo [INFO] Generated WEBHOOK_SECRET
)
call :set_secret %env% WEBHOOK_SECRET %WEBHOOK_SECRET%

if "%DB_ENCRYPTION_KEY%"=="" (
    call :generate_secret DB_ENCRYPTION_KEY
    echo [INFO] Generated DB_ENCRYPTION_KEY
)
call :set_secret %env% DB_ENCRYPTION_KEY %DB_ENCRYPTION_KEY%

if "%ADMIN_API_KEY%"=="" (
    call :generate_secret ADMIN_API_KEY
    echo [INFO] Generated ADMIN_API_KEY
)
call :set_secret %env% ADMIN_API_KEY %ADMIN_API_KEY%

echo.
echo [WARN] ADMIN_PASSWORD must be set manually. This is for console login.
echo Please enter a strong password when prompted.
cd server
wrangler secret put ADMIN_PASSWORD --env %env%
cd ..

echo [INFO] Secrets setup completed for environment: %env%
echo [WARN] Important: Save your ADMIN_PASSWORD - you'll need it to access the console!
goto :eof

:generate_secret
set "chars=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
set "secret="
for /l %%i in (1,1,32) do (
    set /a "rand=!random! %% 62"
    for %%j in (!rand!) do set "secret=!secret!!chars:~%%j,1!"
)
set "%1=!secret!"
goto :eof

REM Function to list secrets
:list_secrets
set env=%1
echo [INFO] Listing secrets for environment: %env%
cd server
wrangler secret list --env %env%
cd ..
goto :eof

REM Main script logic
if "%1"=="setup" (
    if "%2"=="" (
        echo [ERROR] Usage: %0 setup ^<environment^>
        echo [ERROR] Environments: development, test, production
        exit /b 1
    )
    call :setup_secrets %2
) else if "%1"=="list" (
    if "%2"=="" (
        echo [ERROR] Usage: %0 list ^<environment^>
        exit /b 1
    )
    call :list_secrets %2
) else (
    echo Ruinos System Secrets Management
    echo.
    echo Usage: %0 ^<command^> [arguments]
    echo.
    echo Commands:
    echo   setup ^<env^>           Set up secrets for environment (development/test/production^)
    echo   list ^<env^>            List current secrets for environment
    echo.
    echo Examples:
    echo   %0 setup production
    echo   %0 list test
    echo.
)