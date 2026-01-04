@echo off
echo 🚀 启动 RMM 系统本地开发环境

REM 检查必要的工具
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Node.js 未安装，请先安装
    exit /b 1
)

where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ npm 未安装，请先安装
    exit /b 1
)

where cargo >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Rust/Cargo 未安装，请先安装
    exit /b 1
)

where wrangler >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Wrangler 未安装，请运行: npm install -g wrangler
    exit /b 1
)

echo 📦 安装依赖...
call npm install

REM 检查环境变量
if not exist ".env" (
    echo ⚠️  .env 文件不存在，请复制 .env.example 并配置
    copy .env.example .env
    echo 📝 已创建 .env 文件，请编辑并填入实际配置
)

echo 🔧 启动开发服务...

REM 启动 Worker (使用 remote bindings)
echo 🌐 启动 Cloudflare Worker (remote bindings)...
cd server
start "Worker" cmd /c "npm run dev"
cd ..

REM 等待 Worker 启动
timeout /t 3 /nobreak >nul

REM 启动 Console
echo 🖥️  启动 Console 前端...
cd console
start "Console" cmd /c "npm run dev"
cd ..

echo ✅ 开发环境启动完成！
echo.
echo 📍 服务地址：
echo    - Worker API: http://localhost:8787
echo    - Console:    http://localhost:3000
echo.
echo 🛠️  开发命令：
echo    - 编译 Agent:     cargo build
echo    - 运行 Agent:     cd agent ^&^& cargo run
echo    - 数据库迁移:     npm run db:migrate:local
echo.
echo ⏹️  停止服务: 运行 scripts/dev-stop.bat

pause