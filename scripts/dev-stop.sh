#!/bin/bash

# 停止本地开发环境脚本

echo "🛑 停止 RMM 系统开发环境..."

# 查找并停止相关进程
pkill -f "wrangler dev" || true
pkill -f "vite" || true
pkill -f "rmm-agent" || true

echo "✅ 开发环境已停止"