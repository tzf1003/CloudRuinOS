#!/bin/bash

# 本地开发环境启动脚�?
set -e

echo "🚀 启动 RMM 系统本地开发环�?

# 检查必要的工具
check_tool() {
    if ! command -v $1 &> /dev/null; then
        echo "�?$1 未安装，请先安装"
        exit 1
    fi
}

echo "📋 检查开发工�?.."
check_tool "node"
check_tool "npm"
check_tool "cargo"
check_tool "wrangler"

# 安装依赖
echo "📦 安装依赖..."
npm install

# 检查环境变�?if [ ! -f ".env" ]; then
    echo "⚠️  .env 文件不存在，请复�?.env.example 并配�?
    cp .env.example .env
    echo "📝 已创�?.env 文件，请编辑并填入实际配�?
fi

# 启动服务
echo "🔧 启动开发服�?.."

# 在后台启�?Worker (使用 remote bindings)
echo "🌐 启动 Cloudflare Worker (remote bindings)..."
cd server
npm run dev &
WORKER_PID=$!
cd ..

# 等待 Worker 启动
sleep 3

# 在后台启�?Console
echo "🖥�? 启动 Console 前端..."
cd console
npm run dev &
CONSOLE_PID=$!
cd ..

echo "�?开发环境启动完成！"
echo ""
echo "📍 服务地址�?
echo "   - Worker API: http://localhost:8787"
echo "   - Console:    http://localhost:3000"
echo ""
echo "🛠�? 开发命令："
echo "   - 编译 Agent:     cargo build"
echo "   - 运行 Agent:     cd agent && cargo run"
echo "   - 数据库迁�?     npm run db:migrate:local"
echo ""
echo "⏹️  停止服务: Ctrl+C 或运�?scripts/dev-stop.sh"

# 等待用户中断
trap "echo '🛑 停止开发服�?..'; kill $WORKER_PID $CONSOLE_PID 2>/dev/null; exit 0" INT
wait