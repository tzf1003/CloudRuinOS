@echo off
REM Ruinos Agent 安装脚本 - Windows 版本
REM 支持 Windows 服务安装和配置

setlocal enabledelayedexpansion

REM 配置变量
set "AGENT_NAME=RuinosAgent"
set "DISPLAY_NAME=Ruinos Agent Service"
set "DESCRIPTION=Remote Monitoring and Management Agent"
set "INSTALL_DIR=C:\Program Files\Ruinos Agent"
set "CONFIG_DIR=C:\ProgramData\Ruinos Agent"
set "DATA_DIR=C:\ProgramData\Ruinos Agent\Data"
set "LOG_DIR=C:\ProgramData\Ruinos Agent\Logs"
set "SERVICE_EXE=%INSTALL_DIR%\ruinos-agent.exe"

echo Ruinos Agent 安装程序
echo ==================

REM 检查管理员权限
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] 此脚本需要管理员权限运行
    echo 请右键点击并选择"以管理员身份运行"
    pause
    exit /b 1
)

REM 检查参数
if "%~1"=="" (
    echo 用法: %0 ^<agent_binary^> [config_template] [--service]
    echo   agent_binary: Agent 二进制文件路径
    echo   config_template: 配置文件模板路径（可选）
    echo   --service: 安装为 Windows 服务（可选）
    pause
    exit /b 1
)

set "BINARY_PATH=%~1"
set "CONFIG_TEMPLATE=%~2"
set "INSTALL_SERVICE=%~3"

REM 检查二进制文件是否存在
if not exist "%BINARY_PATH%" (
    echo [ERROR] 找不到 Agent 二进制文件: %BINARY_PATH%
    pause
    exit /b 1
)

echo [INFO] 开始安装 RMM Agent...

REM 创建目录结构
echo [INFO] 创建目录结构...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%CONFIG_DIR%" mkdir "%CONFIG_DIR%"
if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

REM 安装二进制文件
echo [INFO] 安装 Agent 二进制文件...
copy "%BINARY_PATH%" "%SERVICE_EXE%" >nul
if %errorlevel% neq 0 (
    echo [ERROR] 复制二进制文件失败
    pause
    exit /b 1
)

REM 安装配置文件
if exist "%CONFIG_TEMPLATE%" (
    echo [INFO] 安装配置文件...
    copy "%CONFIG_TEMPLATE%" "%CONFIG_DIR%\config.toml" >nul
    
    REM 更新配置文件中的路径（使用 PowerShell）
    powershell -Command "(Get-Content '%CONFIG_DIR%\config.toml') -replace 'config_dir = \"\"', 'config_dir = \"%CONFIG_DIR:\=\\%\"' -replace 'data_dir = \"\"', 'data_dir = \"%DATA_DIR:\=\\%\"' -replace 'log_dir = \"\"', 'log_dir = \"%LOG_DIR:\=\\%\"' | Set-Content '%CONFIG_DIR%\config.toml'"
) else (
    echo [WARN] 配置文件模板不存在，创建默认配置...
    call :create_default_config
)

REM 设置目录权限
echo [INFO] 设置目录权限...
icacls "%INSTALL_DIR%" /grant "Administrators:(OI)(CI)F" /grant "SYSTEM:(OI)(CI)F" /grant "Users:(OI)(CI)RX" >nul
icacls "%CONFIG_DIR%" /grant "Administrators:(OI)(CI)F" /grant "SYSTEM:(OI)(CI)F" /grant "Users:(OI)(CI)R" >nul
icacls "%DATA_DIR%" /grant "Administrators:(OI)(CI)F" /grant "SYSTEM:(OI)(CI)F" >nul
icacls "%LOG_DIR%" /grant "Administrators:(OI)(CI)F" /grant "SYSTEM:(OI)(CI)F" >nul

REM 安装 Windows 服务（如果请求）
if "%INSTALL_SERVICE%"=="--service" (
    call :install_windows_service
    call :start_service
)

REM 显示安装后信息
call :show_post_install_info

echo [INFO] RMM Agent 安装完成！
pause
exit /b 0

REM 创建默认配置文件
:create_default_config
echo [agent] > "%CONFIG_DIR%\config.toml"
echo name = "rmm-agent" >> "%CONFIG_DIR%\config.toml"
echo version = "0.1.0" >> "%CONFIG_DIR%\config.toml"
echo device_id = "" >> "%CONFIG_DIR%\config.toml"
echo. >> "%CONFIG_DIR%\config.toml"
echo [server] >> "%CONFIG_DIR%\config.toml"
echo base_url = "https://your-rmm-server.example.com" >> "%CONFIG_DIR%\config.toml"
echo enrollment_endpoint = "/agent/enroll" >> "%CONFIG_DIR%\config.toml"
echo heartbeat_endpoint = "/agent/heartbeat" >> "%CONFIG_DIR%\config.toml"
echo websocket_endpoint = "/sessions" >> "%CONFIG_DIR%\config.toml"
echo connect_timeout = 30 >> "%CONFIG_DIR%\config.toml"
echo request_timeout = 60 >> "%CONFIG_DIR%\config.toml"
echo. >> "%CONFIG_DIR%\config.toml"
echo [heartbeat] >> "%CONFIG_DIR%\config.toml"
echo interval = 30 >> "%CONFIG_DIR%\config.toml"
echo retry_attempts = 3 >> "%CONFIG_DIR%\config.toml"
echo retry_delay = 5 >> "%CONFIG_DIR%\config.toml"
echo. >> "%CONFIG_DIR%\config.toml"
echo [security] >> "%CONFIG_DIR%\config.toml"
echo tls_verify = true >> "%CONFIG_DIR%\config.toml"
echo certificate_pinning = false >> "%CONFIG_DIR%\config.toml"
echo doh_enabled = false >> "%CONFIG_DIR%\config.toml"
echo. >> "%CONFIG_DIR%\config.toml"
echo [logging] >> "%CONFIG_DIR%\config.toml"
echo level = "info" >> "%CONFIG_DIR%\config.toml"
echo file_path = "%LOG_DIR:\=\\%\\rmm-agent.log" >> "%CONFIG_DIR%\config.toml"
echo max_file_size = "10MB" >> "%CONFIG_DIR%\config.toml"
echo max_files = 5 >> "%CONFIG_DIR%\config.toml"
echo. >> "%CONFIG_DIR%\config.toml"
echo [paths] >> "%CONFIG_DIR%\config.toml"
echo config_dir = "%CONFIG_DIR:\=\\%" >> "%CONFIG_DIR%\config.toml"
echo data_dir = "%DATA_DIR:\=\\%" >> "%CONFIG_DIR%\config.toml"
echo log_dir = "%LOG_DIR:\=\\%" >> "%CONFIG_DIR%\config.toml"
echo credentials_file = "credentials.json" >> "%CONFIG_DIR%\config.toml"
echo. >> "%CONFIG_DIR%\config.toml"
echo [file_operations] >> "%CONFIG_DIR%\config.toml"
echo max_file_size = "100MB" >> "%CONFIG_DIR%\config.toml"
echo allow_hidden_files = false >> "%CONFIG_DIR%\config.toml"
echo blocked_paths = ["C:\\Windows\\System32", "C:\\Users\\*\\AppData\\Local\\Microsoft\\Windows\\UsrClass.dat"] >> "%CONFIG_DIR%\config.toml"
echo. >> "%CONFIG_DIR%\config.toml"
echo [commands] >> "%CONFIG_DIR%\config.toml"
echo default_timeout = 300 >> "%CONFIG_DIR%\config.toml"
echo max_concurrent = 5 >> "%CONFIG_DIR%\config.toml"
echo. >> "%CONFIG_DIR%\config.toml"
echo [reconnect] >> "%CONFIG_DIR%\config.toml"
echo initial_delay = 1 >> "%CONFIG_DIR%\config.toml"
echo max_delay = 300 >> "%CONFIG_DIR%\config.toml"
echo backoff_factor = 2.0 >> "%CONFIG_DIR%\config.toml"
echo max_attempts = 0 >> "%CONFIG_DIR%\config.toml"
echo jitter = true >> "%CONFIG_DIR%\config.toml"
goto :eof

REM 安装 Windows 服务
:install_windows_service
echo [INFO] 安装 Windows 服务...

REM 停止现有服务（如果存在）
sc query "%AGENT_NAME%" >nul 2>&1
if %errorlevel% equ 0 (
    echo [INFO] 停止现有服务...
    sc stop "%AGENT_NAME%" >nul 2>&1
    timeout /t 3 /nobreak >nul
    sc delete "%AGENT_NAME%" >nul 2>&1
    timeout /t 2 /nobreak >nul
)

REM 创建服务
sc create "%AGENT_NAME%" binPath= "\"%SERVICE_EXE%\" --config \"%CONFIG_DIR%\config.toml\" --service" DisplayName= "%DISPLAY_NAME%" start= auto
if %errorlevel% neq 0 (
    echo [ERROR] 创建服务失败
    goto :eof
)

REM 设置服务描述
sc description "%AGENT_NAME%" "%DESCRIPTION%"

REM 配置服务恢复选项
sc failure "%AGENT_NAME%" reset= 86400 actions= restart/10000/restart/10000/restart/10000

echo [INFO] Windows 服务安装完成
goto :eof

REM 启动服务
:start_service
echo [INFO] 启动 RMM Agent 服务...
sc start "%AGENT_NAME%"
if %errorlevel% equ 0 (
    echo [INFO] 服务启动成功
    timeout /t 2 /nobreak >nul
    sc query "%AGENT_NAME%"
) else (
    echo [ERROR] 服务启动失败
)
goto :eof

REM 显示安装后信息
:show_post_install_info
echo.
echo 安装位置:
echo   二进制文件: %SERVICE_EXE%
echo   配置文件: %CONFIG_DIR%\config.toml
echo   数据目录: %DATA_DIR%
echo   日志目录: %LOG_DIR%
echo.
if "%INSTALL_SERVICE%"=="--service" (
    echo 服务管理命令:
    echo   启动服务: sc start %AGENT_NAME%
    echo   停止服务: sc stop %AGENT_NAME%
    echo   查看状态: sc query %AGENT_NAME%
    echo   查看日志: type "%LOG_DIR%\rmm-agent.log"
    echo.
)
echo 下一步:
echo 1. 编辑配置文件: %CONFIG_DIR%\config.toml
echo 2. 设置服务器 URL 和其他配置
if "%INSTALL_SERVICE%"=="--service" (
    echo 3. 重启服务以应用配置更改: sc stop %AGENT_NAME% ^&^& sc start %AGENT_NAME%
) else (
    echo 3. 手动运行 Agent 或安装为服务
)
echo 4. 使用 enrollment token 注册设备
echo.
goto :eof