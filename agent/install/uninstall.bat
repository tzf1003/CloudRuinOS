@echo off
REM Ruinos Agent 卸载脚本 - Windows 版本

setlocal enabledelayedexpansion

REM 配置变量
set "AGENT_NAME=RuinosAgent"
set "INSTALL_DIR=C:\Program Files\Ruinos Agent"
set "CONFIG_DIR=C:\ProgramData\Ruinos Agent"
set "DATA_DIR=C:\ProgramData\Ruinos Agent\Data"
set "LOG_DIR=C:\ProgramData\Ruinos Agent\Logs"

echo Ruinos Agent 卸载程序
echo ==================

REM 检查管理员权限
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] 此脚本需要管理员权限运行
    echo 请右键点击并选择"以管理员身份运行"
    pause
    exit /b 1
)

REM 确认卸载
if "%~1"=="--purge" (
    echo [WARN] 这将完全删除 Ruinos Agent 及其所有配置和数据�?
) else (
    echo 这将卸载 Ruinos Agent，但保留配置和数据文件�?
)
echo.
set /p "confirm=确定要继续吗�?y/N): "
if /i not "%confirm%"=="y" (
    echo 卸载已取消�?
    pause
    exit /b 0
)

echo [INFO] 开始卸�?Ruinos Agent...

REM 停止并删�?Windows 服务
sc query "%AGENT_NAME%" >nul 2>&1
if %errorlevel% equ 0 (
    echo [INFO] 停止 Windows 服务...
    sc stop "%AGENT_NAME%" >nul 2>&1
    timeout /t 3 /nobreak >nul
    
    echo [INFO] 删除 Windows 服务...
    sc delete "%AGENT_NAME%" >nul 2>&1
    if %errorlevel% equ 0 (
        echo [INFO] 服务删除成功
    ) else (
        echo [WARN] 服务删除失败
    )
) else (
    echo [INFO] 未找到已安装的服�?
)

REM 删除安装文件
echo [INFO] 删除安装文件...
if exist "%INSTALL_DIR%" (
    rmdir /s /q "%INSTALL_DIR%" >nul 2>&1
    if %errorlevel% equ 0 (
        echo [INFO] 安装目录已删�?
    ) else (
        echo [WARN] 删除安装目录失败，可能有文件正在使用
    )
)

REM 删除配置和数据（如果请求�?
if "%~1"=="--purge" (
    echo [INFO] 删除配置和数据文�?..
    
    if exist "%CONFIG_DIR%" (
        rmdir /s /q "%CONFIG_DIR%" >nul 2>&1
        if %errorlevel% equ 0 (
            echo [INFO] 配置和数据目录已删除
        ) else (
            echo [WARN] 删除配置和数据目录失�?
        )
    )
) else (
    echo [INFO] 保留配置和数据文�?
)

REM 清理注册表（可选）
if "%~1"=="--purge" (
    echo [INFO] 清理注册表项...
    reg delete "HKLM\SOFTWARE\Ruinos Agent" /f >nul 2>&1
    reg delete "HKLM\SYSTEM\CurrentControlSet\Services\%AGENT_NAME%" /f >nul 2>&1
)

REM 显示卸载后信�?
echo.
echo [INFO] Ruinos Agent 卸载完成�?
echo.

if not "%~1"=="--purge" (
    echo 保留的文件和目录:
    if exist "%CONFIG_DIR%" echo   配置目录: %CONFIG_DIR%
    if exist "%DATA_DIR%" echo   数据目录: %DATA_DIR%
    if exist "%LOG_DIR%" echo   日志目录: %LOG_DIR%
    echo.
    echo 如需完全删除所有文件，请运�?
    echo   %0 --purge
) else (
    echo 所有文件和配置已完全删除�?
)

echo.
pause
exit /b 0