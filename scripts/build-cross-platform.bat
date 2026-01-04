@echo off
REM 跨平台编译脚本 - Windows 版本
REM 支持 Windows, Linux, macOS 目标平台

setlocal enabledelayedexpansion

echo [INFO] 开始跨平台编译...

REM 切换到 agent 目录
cd /d "%~dp0\..\agent"

REM 检查 Rust 工具链
where rustc >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Rust 未安装，请先安装 Rust
    exit /b 1
)

REM 检查 cross 工具
where cross >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARN] cross 未安装，正在安装...
    cargo install cross --git https://github.com/cross-rs/cross
)

REM 安装目标平台
echo [INFO] 安装跨平台编译目标...
rustup target add x86_64-pc-windows-gnu
rustup target add x86_64-pc-windows-msvc
rustup target add x86_64-unknown-linux-musl
rustup target add x86_64-unknown-linux-gnu

REM 编译 Windows 目标
echo [INFO] 编译 Windows 目标...
cargo build --release --target x86_64-pc-windows-msvc --features "windows,tls-strict"
if %errorlevel% neq 0 (
    echo [ERROR] Windows MSVC 编译失败
    exit /b 1
)

cargo build --release --target x86_64-pc-windows-gnu --features "windows,tls-strict"
if %errorlevel% neq 0 (
    echo [ERROR] Windows GNU 编译失败
    exit /b 1
)

REM 编译 Linux 目标
echo [INFO] 编译 Linux 目标...
cross build --release --target x86_64-unknown-linux-musl --features "linux,tls-strict,doh,static-link"
if %errorlevel% neq 0 (
    echo [ERROR] Linux musl 编译失败
    exit /b 1
)

cross build --release --target x86_64-unknown-linux-gnu --features "linux,tls-strict,doh"
if %errorlevel% neq 0 (
    echo [ERROR] Linux GNU 编译失败
    exit /b 1
)

REM 创建输出目录并复制文件
echo [INFO] 复制编译产物...

mkdir target\release-x86_64-pc-windows-msvc 2>nul
copy target\x86_64-pc-windows-msvc\release\rmm-agent.exe target\release-x86_64-pc-windows-msvc\ >nul

mkdir target\release-x86_64-pc-windows-gnu 2>nul
copy target\x86_64-pc-windows-gnu\release\rmm-agent.exe target\release-x86_64-pc-windows-gnu\ >nul

mkdir target\release-x86_64-unknown-linux-musl 2>nul
copy target\x86_64-unknown-linux-musl\release\rmm-agent target\release-x86_64-unknown-linux-musl\ >nul

mkdir target\release-x86_64-unknown-linux-gnu 2>nul
copy target\x86_64-unknown-linux-gnu\release\rmm-agent target\release-x86_64-unknown-linux-gnu\ >nul

echo [INFO] 🎉 所有目标编译完成！
echo [INFO] 编译产物位于 target\release-* 目录中

endlocal