#!/bin/bash

# Ruinos Agent 卸载脚本 - Linux/macOS 版本

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置变量
AGENT_NAME="ruinos-agent"
SERVICE_USER="ruinos-agent"
SERVICE_GROUP="ruinos-agent"
INSTALL_DIR="/opt/ruinos-agent"
CONFIG_DIR="/etc/ruinos-agent"
DATA_DIR="/var/lib/ruinos-agent"
LOG_DIR="/var/log/ruinos-agent"
SYSTEMD_SERVICE_FILE="/etc/systemd/system/ruinos-agent.service"
LAUNCHD_PLIST="/Library/LaunchDaemons/com.ruinos.agent.plist"

# 检测操作系�?detect_os() {
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
        SERVICE_USER="_rmm-agent"
    else
        echo -e "${RED}错误: 不支持的操作系统 $OSTYPE${NC}"
        exit 1
    fi
    
    echo -e "${BLUE}检测到操作系统: $OS (初始化系�? $INIT_SYSTEM)${NC}"
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

# 检查权�?check_permissions() {
    if [[ $EUID -ne 0 ]]; then
        log_error "此脚本需�?root 权限运行"
        echo "请使�? sudo $0"
        exit 1
    fi
}

# 停止并卸载服�?uninstall_service() {
    case "$INIT_SYSTEM" in
        "systemd")
            if systemctl is-active --quiet "$AGENT_NAME"; then
                log_info "停止 systemd 服务..."
                systemctl stop "$AGENT_NAME"
            fi
            
            if systemctl is-enabled --quiet "$AGENT_NAME"; then
                log_info "禁用 systemd 服务..."
                systemctl disable "$AGENT_NAME"
            fi
            
            if [[ -f "$SYSTEMD_SERVICE_FILE" ]]; then
                log_info "删除 systemd 服务文件..."
                rm -f "$SYSTEMD_SERVICE_FILE"
                systemctl daemon-reload
            fi
            ;;
            
        "launchd")
            if launchctl list | grep -q "com.example.rmm-agent"; then
                log_info "停止 launchd 服务..."
                launchctl stop "com.example.rmm-agent"
                launchctl unload "$LAUNCHD_PLIST"
            fi
            
            if [[ -f "$LAUNCHD_PLIST" ]]; then
                log_info "删除 launchd plist 文件..."
                rm -f "$LAUNCHD_PLIST"
            fi
            ;;
            
        *)
            log_warn "未知的初始化系统: $INIT_SYSTEM，请手动停止服务"
            ;;
    esac
}

# 删除文件和目�?remove_files() {
    log_info "删除安装文件..."
    
    # 删除二进制文�?    if [[ -f "$INSTALL_DIR/$AGENT_NAME" ]]; then
        rm -f "$INSTALL_DIR/$AGENT_NAME"
    fi
    
    # 删除符号链接
    if [[ -L "/usr/local/bin/$AGENT_NAME" ]]; then
        rm -f "/usr/local/bin/$AGENT_NAME"
    fi
    
    # 删除安装目录
    if [[ -d "$INSTALL_DIR" ]]; then
        rmdir "$INSTALL_DIR" 2>/dev/null || log_warn "安装目录不为空，未删�? $INSTALL_DIR"
    fi
}

# 删除配置和数据（可选）
remove_data() {
    local remove_data_flag="$1"
    
    if [[ "$remove_data_flag" == "--purge" ]]; then
        log_info "删除配置和数据文�?.."
        
        # 删除配置目录
        if [[ -d "$CONFIG_DIR" ]]; then
            rm -rf "$CONFIG_DIR"
        fi
        
        # 删除数据目录
        if [[ -d "$DATA_DIR" ]]; then
            rm -rf "$DATA_DIR"
        fi
        
        # 删除日志目录
        if [[ -d "$LOG_DIR" ]]; then
            rm -rf "$LOG_DIR"
        fi
    else
        log_info "保留配置和数据文�?
        log_info "如需完全删除，请使用: $0 --purge"
    fi
}

# 删除用户和组
remove_user() {
    local remove_user_flag="$1"
    
    if [[ "$remove_user_flag" == "--purge" ]]; then
        if [[ "$OS" == "linux" ]]; then
            if getent passwd "$SERVICE_USER" >/dev/null 2>&1; then
                log_info "删除用户: $SERVICE_USER"
                userdel "$SERVICE_USER" 2>/dev/null || log_warn "删除用户失败"
            fi
            
            if getent group "$SERVICE_GROUP" >/dev/null 2>&1; then
                log_info "删除�? $SERVICE_GROUP"
                groupdel "$SERVICE_GROUP" 2>/dev/null || log_warn "删除组失�?
            fi
        elif [[ "$OS" == "macos" ]]; then
            if dscl . -read /Users/"$SERVICE_USER" >/dev/null 2>&1; then
                log_info "删除 macOS 用户: $SERVICE_USER"
                dscl . -delete /Users/"$SERVICE_USER" 2>/dev/null || log_warn "删除用户失败"
            fi
        fi
    fi
}

# 显示卸载后信�?show_post_uninstall_info() {
    echo
    log_info "Ruinos Agent 卸载完成�?
    echo
    
    if [[ "$1" != "--purge" ]]; then
        echo "保留的文件和目录:"
        [[ -d "$CONFIG_DIR" ]] && echo "  配置目录: $CONFIG_DIR"
        [[ -d "$DATA_DIR" ]] && echo "  数据目录: $DATA_DIR"
        [[ -d "$LOG_DIR" ]] && echo "  日志目录: $LOG_DIR"
        echo
        echo "如需完全删除所有文件，请运�?"
        echo "  sudo $0 --purge"
    else
        echo "所有文件和配置已完全删除�?
    fi
}

# 确认卸载
confirm_uninstall() {
    local purge_flag="$1"
    
    echo "Ruinos Agent 卸载程序"
    echo "=================="
    echo
    
    if [[ "$purge_flag" == "--purge" ]]; then
        echo -e "${YELLOW}警告: 这将完全删除 Ruinos Agent 及其所有配置和数据�?{NC}"
    else
        echo "这将卸载 Ruinos Agent，但保留配置和数据文件�?
    fi
    
    echo
    read -p "确定要继续吗�?y/N): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "卸载已取消�?
        exit 0
    fi
}

# 主函�?main() {
    local purge_flag="$1"
    
    # 检测操作系�?    detect_os
    
    # 检查权�?    check_permissions
    
    # 确认卸载
    confirm_uninstall "$purge_flag"
    
    # 停止并卸载服�?    uninstall_service
    
    # 删除文件
    remove_files
    
    # 删除配置和数据（如果请求�?    remove_data "$purge_flag"
    
    # 删除用户（如果请求）
    remove_user "$purge_flag"
    
    # 显示卸载信息
    show_post_uninstall_info "$purge_flag"
}

# 运行主函�?main "$@"