#!/bin/bash

# RMM Agent 安装脚本 - Linux/macOS 版本
# 支持系统服务安装和配置

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置变量
AGENT_NAME="rmm-agent"
SERVICE_USER="rmm-agent"
SERVICE_GROUP="rmm-agent"
INSTALL_DIR="/opt/rmm-agent"
CONFIG_DIR="/etc/rmm-agent"
DATA_DIR="/var/lib/rmm-agent"
LOG_DIR="/var/log/rmm-agent"
SYSTEMD_SERVICE_FILE="/etc/systemd/system/rmm-agent.service"
LAUNCHD_PLIST="/Library/LaunchDaemons/com.example.rmm-agent.plist"

# 检测操作系统
detect_os() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS="linux"
        if command -v systemctl >/dev/null 2>&1; then
            INIT_SYSTEM="systemd"
        else
            INIT_SYSTEM="sysv"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
        INIT_SYSTEM="launchd"
    else
        echo -e "${RED}错误: 不支持的操作系统 $OSTYPE${NC}"
        exit 1
    fi
    
    echo -e "${BLUE}检测到操作系统: $OS (初始化系统: $INIT_SYSTEM)${NC}"
}

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查权限
check_permissions() {
    if [[ $EUID -ne 0 ]]; then
        log_error "此脚本需要 root 权限运行"
        echo "请使用: sudo $0"
        exit 1
    fi
}

# 创建用户和组
create_user() {
    if [[ "$OS" == "linux" ]]; then
        if ! getent group "$SERVICE_GROUP" >/dev/null 2>&1; then
            log_info "创建组: $SERVICE_GROUP"
            groupadd --system "$SERVICE_GROUP"
        fi
        
        if ! getent passwd "$SERVICE_USER" >/dev/null 2>&1; then
            log_info "创建用户: $SERVICE_USER"
            useradd --system --gid "$SERVICE_GROUP" \
                    --home-dir "$DATA_DIR" \
                    --shell /bin/false \
                    --comment "RMM Agent Service User" \
                    "$SERVICE_USER"
        fi
    elif [[ "$OS" == "macos" ]]; then
        # macOS 通常使用 _rmm-agent 用户
        SERVICE_USER="_rmm-agent"
        if ! dscl . -read /Users/"$SERVICE_USER" >/dev/null 2>&1; then
            log_info "创建 macOS 服务用户: $SERVICE_USER"
            # 获取下一个可用的 UID
            local next_uid=$(dscl . -list /Users UniqueID | awk '{print $2}' | sort -n | tail -1)
            next_uid=$((next_uid + 1))
            
            dscl . -create /Users/"$SERVICE_USER"
            dscl . -create /Users/"$SERVICE_USER" UserShell /usr/bin/false
            dscl . -create /Users/"$SERVICE_USER" RealName "RMM Agent Service"
            dscl . -create /Users/"$SERVICE_USER" UniqueID "$next_uid"
            dscl . -create /Users/"$SERVICE_USER" PrimaryGroupID 20
            dscl . -create /Users/"$SERVICE_USER" NFSHomeDirectory "$DATA_DIR"
        fi
    fi
}

# 创建目录结构
create_directories() {
    log_info "创建目录结构..."
    
    mkdir -p "$INSTALL_DIR"
    mkdir -p "$CONFIG_DIR"
    mkdir -p "$DATA_DIR"
    mkdir -p "$LOG_DIR"
    
    # 设置权限
    chown root:root "$INSTALL_DIR"
    chmod 755 "$INSTALL_DIR"
    
    chown root:"$SERVICE_GROUP" "$CONFIG_DIR"
    chmod 750 "$CONFIG_DIR"
    
    chown "$SERVICE_USER":"$SERVICE_GROUP" "$DATA_DIR"
    chmod 750 "$DATA_DIR"
    
    chown "$SERVICE_USER":"$SERVICE_GROUP" "$LOG_DIR"
    chmod 750 "$LOG_DIR"
}

# 安装二进制文件
install_binary() {
    local binary_path="$1"
    
    if [[ ! -f "$binary_path" ]]; then
        log_error "找不到 Agent 二进制文件: $binary_path"
        exit 1
    fi
    
    log_info "安装 Agent 二进制文件..."
    cp "$binary_path" "$INSTALL_DIR/$AGENT_NAME"
    chown root:root "$INSTALL_DIR/$AGENT_NAME"
    chmod 755 "$INSTALL_DIR/$AGENT_NAME"
    
    # 创建符号链接到 /usr/local/bin
    ln -sf "$INSTALL_DIR/$AGENT_NAME" "/usr/local/bin/$AGENT_NAME"
}

# 安装配置文件
install_config() {
    local config_template="$1"
    
    if [[ -f "$config_template" ]]; then
        log_info "安装配置文件..."
        cp "$config_template" "$CONFIG_DIR/config.toml"
        
        # 更新配置文件中的路径
        sed -i.bak \
            -e "s|config_dir = \"\"|config_dir = \"$CONFIG_DIR\"|g" \
            -e "s|data_dir = \"\"|data_dir = \"$DATA_DIR\"|g" \
            -e "s|log_dir = \"\"|log_dir = \"$LOG_DIR\"|g" \
            "$CONFIG_DIR/config.toml"
        
        rm -f "$CONFIG_DIR/config.toml.bak"
        
        chown root:"$SERVICE_GROUP" "$CONFIG_DIR/config.toml"
        chmod 640 "$CONFIG_DIR/config.toml"
    else
        log_warn "配置文件模板不存在，创建默认配置..."
        create_default_config
    fi
}

# 创建默认配置
create_default_config() {
    cat > "$CONFIG_DIR/config.toml" << EOF
[agent]
name = "rmm-agent"
version = "0.1.0"
device_id = ""

[server]
base_url = "https://your-rmm-server.example.com"
enrollment_endpoint = "/agent/enroll"
heartbeat_endpoint = "/agent/heartbeat"
websocket_endpoint = "/sessions"
connect_timeout = 30
request_timeout = 60

[heartbeat]
interval = 30
retry_attempts = 3
retry_delay = 5

[security]
tls_verify = true
certificate_pinning = false
doh_enabled = false

[logging]
level = "info"
file_path = "$LOG_DIR/rmm-agent.log"
max_file_size = "10MB"
max_files = 5

[paths]
config_dir = "$CONFIG_DIR"
data_dir = "$DATA_DIR"
log_dir = "$LOG_DIR"
credentials_file = "credentials.json"

[file_operations]
max_file_size = "100MB"
allow_hidden_files = false
blocked_paths = ["/etc/passwd", "/etc/shadow", "/root/.ssh"]

[commands]
default_timeout = 300
max_concurrent = 5

[reconnect]
initial_delay = 1
max_delay = 300
backoff_factor = 2.0
max_attempts = 0
jitter = true
EOF

    chown root:"$SERVICE_GROUP" "$CONFIG_DIR/config.toml"
    chmod 640 "$CONFIG_DIR/config.toml"
}

# 安装 systemd 服务
install_systemd_service() {
    log_info "安装 systemd 服务..."
    
    cat > "$SYSTEMD_SERVICE_FILE" << EOF
[Unit]
Description=RMM Agent Service
Documentation=https://github.com/your-org/rmm-agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_GROUP
ExecStart=$INSTALL_DIR/$AGENT_NAME --config $CONFIG_DIR/config.toml
ExecReload=/bin/kill -HUP \$MAINPID
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=rmm-agent

# 安全设置
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$DATA_DIR $LOG_DIR
CapabilityBoundingSet=CAP_NET_BIND_SERVICE

# 环境变量
Environment=RUST_LOG=info
Environment=RMM_CONFIG_DIR=$CONFIG_DIR
Environment=RMM_DATA_DIR=$DATA_DIR

[Install]
WantedBy=multi-user.target
EOF

    chmod 644 "$SYSTEMD_SERVICE_FILE"
    systemctl daemon-reload
    systemctl enable "$AGENT_NAME"
}

# 安装 launchd 服务 (macOS)
install_launchd_service() {
    log_info "安装 launchd 服务..."
    
    cat > "$LAUNCHD_PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.example.rmm-agent</string>
    
    <key>ProgramArguments</key>
    <array>
        <string>$INSTALL_DIR/$AGENT_NAME</string>
        <string>--config</string>
        <string>$CONFIG_DIR/config.toml</string>
    </array>
    
    <key>UserName</key>
    <string>$SERVICE_USER</string>
    
    <key>RunAtLoad</key>
    <true/>
    
    <key>KeepAlive</key>
    <true/>
    
    <key>StandardOutPath</key>
    <string>$LOG_DIR/rmm-agent.log</string>
    
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/rmm-agent-error.log</string>
    
    <key>EnvironmentVariables</key>
    <dict>
        <key>RUST_LOG</key>
        <string>info</string>
        <key>RMM_CONFIG_DIR</key>
        <string>$CONFIG_DIR</string>
        <key>RMM_DATA_DIR</key>
        <string>$DATA_DIR</string>
    </dict>
</dict>
</plist>
EOF

    chmod 644 "$LAUNCHD_PLIST"
    launchctl load "$LAUNCHD_PLIST"
}

# 安装服务
install_service() {
    case "$INIT_SYSTEM" in
        "systemd")
            install_systemd_service
            ;;
        "launchd")
            install_launchd_service
            ;;
        "sysv")
            log_warn "SysV init 支持尚未实现，请手动配置服务"
            ;;
        *)
            log_warn "未知的初始化系统: $INIT_SYSTEM"
            ;;
    esac
}

# 启动服务
start_service() {
    log_info "启动 RMM Agent 服务..."
    
    case "$INIT_SYSTEM" in
        "systemd")
            systemctl start "$AGENT_NAME"
            systemctl status "$AGENT_NAME" --no-pager
            ;;
        "launchd")
            launchctl start "com.example.rmm-agent"
            ;;
        *)
            log_warn "请手动启动服务"
            ;;
    esac
}

# 显示安装后信息
show_post_install_info() {
    echo
    log_info "RMM Agent 安装完成！"
    echo
    echo "安装位置:"
    echo "  二进制文件: $INSTALL_DIR/$AGENT_NAME"
    echo "  配置文件: $CONFIG_DIR/config.toml"
    echo "  数据目录: $DATA_DIR"
    echo "  日志目录: $LOG_DIR"
    echo
    echo "服务管理命令:"
    case "$INIT_SYSTEM" in
        "systemd")
            echo "  启动服务: sudo systemctl start $AGENT_NAME"
            echo "  停止服务: sudo systemctl stop $AGENT_NAME"
            echo "  重启服务: sudo systemctl restart $AGENT_NAME"
            echo "  查看状态: sudo systemctl status $AGENT_NAME"
            echo "  查看日志: sudo journalctl -u $AGENT_NAME -f"
            ;;
        "launchd")
            echo "  启动服务: sudo launchctl start com.example.rmm-agent"
            echo "  停止服务: sudo launchctl stop com.example.rmm-agent"
            echo "  查看日志: tail -f $LOG_DIR/rmm-agent.log"
            ;;
    esac
    echo
    echo "下一步:"
    echo "1. 编辑配置文件: $CONFIG_DIR/config.toml"
    echo "2. 设置服务器 URL 和其他配置"
    echo "3. 重启服务以应用配置更改"
    echo "4. 使用 enrollment token 注册设备"
}

# 主函数
main() {
    local binary_path="$1"
    local config_template="$2"
    local install_service_flag="$3"
    
    echo "RMM Agent 安装程序"
    echo "=================="
    
    # 检查参数
    if [[ -z "$binary_path" ]]; then
        echo "用法: $0 <agent_binary> [config_template] [--service]"
        echo "  agent_binary: Agent 二进制文件路径"
        echo "  config_template: 配置文件模板路径（可选）"
        echo "  --service: 安装为系统服务（可选）"
        exit 1
    fi
    
    # 检测操作系统
    detect_os
    
    # 检查权限
    check_permissions
    
    # 创建用户
    create_user
    
    # 创建目录
    create_directories
    
    # 安装文件
    install_binary "$binary_path"
    install_config "$config_template"
    
    # 安装服务（如果请求）
    if [[ "$install_service_flag" == "--service" ]]; then
        install_service
        start_service
    fi
    
    # 显示安装信息
    show_post_install_info
}

# 运行主函数
main "$@"