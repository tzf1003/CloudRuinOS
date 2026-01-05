@echo off
echo 🛑 停止 RMM 系统开发环�?..

REM 停止相关进程
taskkill /f /im node.exe 2>nul
taskkill /f /im wrangler.exe 2>nul
taskkill /f /im ruinos-agent.exe 2>nul

echo �?开发环境已停止