#!/bin/bash

# RMM Agent 打包脚本
# 为不同平台创建安装包

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置变量
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
AGENT_DIR="$PROJECT_ROOT/agent"
DIST_DIR="$PROJECT_ROOT/dist"
VERSION=$(grep '^version = ' "$AGENT_DIR/Cargo.toml" | sed 's/version = "\(.*\)"/\1/')

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

# 创建发布目录
create_dist_dir() {
    log_info "创建发布目录..."
    rm -rf "$DIST_DIR"
    mkdir -p "$DIST_DIR"
}

# 打包 Windows 版本
package_windows() {
    local target="$1"
    local binary_name="rmm-agent.exe"
    local package_name="rmm-agent-windows-${target##*-}-v${VERSION}"
    
    log_info "打包 Windows 版本: $target"
    
    local binary_path="$AGENT_DIR/target/$target/release/$binary_name"
    if [[ ! -f "$binary_path" ]]; then
        log_error "找不到 Windows 二进制文件: $binary_path"
        return 1
    fi
    
    local package_dir="$DIST_DIR/$package_name"
    mkdir -p "$package_dir"
    
    # 复制文件
    cp "$binary_path" "$package_dir/"
    cp "$AGENT_DIR/install/config.toml" "$package_dir/"
    cp "$AGENT_DIR/install/install.bat" "$package_dir/"
    cp "$AGENT_DIR/install/uninstall.bat" "$package_dir/"
    
    # 创建 README
    cat > "$package_dir/README.txt" << EOF
RMM Agent v${VERSION} - Windows 版本
==================================

安装说明:
1. 以管理员身份运行 install.bat
2. 编辑 config.toml 配置文件
3. 重启服务或手动运行 rmm-agent.exe

文件说明:
- rmm-agent.exe: Agent 主程序
- config.toml: 配置文件模板
- install.bat: 安装脚本
- uninstall.bat: 卸载脚本

服务安装:
install.bat rmm-agent.exe config.toml --service

手动运行:
rmm-agent.exe --config config.toml

更多信息请访问: https://github.com/your-org/rmm-agent
EOF
    
    # 创建压缩包
    cd "$DIST_DIR"
    zip -r "${package_name}.zip" "$package_name"
    rm -rf "$package_name"
    
    log_info "Windows 包已创建: ${package_name}.zip"
}

# 打包 Linux 版本
package_linux() {
    local target="$1"
    local binary_name="rmm-agent"
    local arch="${target##*-}"
    local package_name="rmm-agent-linux-${arch}-v${VERSION}"
    
    log_info "打包 Linux 版本: $target"
    
    local binary_path="$AGENT_DIR/target/$target/release/$binary_name"
    if [[ ! -f "$binary_path" ]]; then
        log_error "找不到 Linux 二进制文件: $binary_path"
        return 1
    fi
    
    local package_dir="$DIST_DIR/$package_name"
    mkdir -p "$package_dir"
    
    # 复制文件
    cp "$binary_path" "$package_dir/"
    cp "$AGENT_DIR/install/config.toml" "$package_dir/"
    cp "$AGENT_DIR/install/install.sh" "$package_dir/"
    cp "$AGENT_DIR/install/uninstall.sh" "$package_dir/"
    
    # 设置执行权限
    chmod +x "$package_dir/rmm-agent"
    chmod +x "$package_dir/install.sh"
    chmod +x "$package_dir/uninstall.sh"
    
    # 创建 README
    cat > "$package_dir/README.md" << EOF
# RMM Agent v${VERSION} - Linux 版本

## 安装说明

1. 解压安装包
2. 运行安装脚本: \`sudo ./install.sh rmm-agent config.toml --service\`
3. 编辑配置文件: \`sudo nano /etc/rmm-agent/config.toml\`
4. 重启服务: \`sudo systemctl restart rmm-agent\`

## 文件说明

- \`rmm-agent\`: Agent 主程序
- \`config.toml\`: 配置文件模板
- \`install.sh\`: 安装脚本
- \`uninstall.sh\`: 卸载脚本

## 服务管理

- 启动服务: \`sudo systemctl start rmm-agent\`
- 停止服务: \`sudo systemctl stop rmm-agent\`
- 查看状态: \`sudo systemctl status rmm-agent\`
- 查看日志: \`sudo journalctl -u rmm-agent -f\`

## 手动运行

\`\`\`bash
./rmm-agent --config config.toml
\`\`\`

更多信息请访问: https://github.com/your-org/rmm-agent
EOF
    
    # 创建压缩包
    cd "$DIST_DIR"
    tar -czf "${package_name}.tar.gz" "$package_name"
    rm -rf "$package_name"
    
    log_info "Linux 包已创建: ${package_name}.tar.gz"
}

# 打包 macOS 版本
package_macos() {
    local target="$1"
    local binary_name="rmm-agent"
    local arch="${target##*-}"
    local package_name="rmm-agent-macos-${arch}-v${VERSION}"
    
    log_info "打包 macOS 版本: $target"
    
    local binary_path="$AGENT_DIR/target/$target/release/$binary_name"
    if [[ ! -f "$binary_path" ]]; then
        log_error "找不到 macOS 二进制文件: $binary_path"
        return 1
    fi
    
    local package_dir="$DIST_DIR/$package_name"
    mkdir -p "$package_dir"
    
    # 复制文件
    cp "$binary_path" "$package_dir/"
    cp "$AGENT_DIR/install/config.toml" "$package_dir/"
    cp "$AGENT_DIR/install/install.sh" "$package_dir/"
    cp "$AGENT_DIR/install/uninstall.sh" "$package_dir/"
    
    # 设置执行权限
    chmod +x "$package_dir/rmm-agent"
    chmod +x "$package_dir/install.sh"
    chmod +x "$package_dir/uninstall.sh"
    
    # 创建 README
    cat > "$package_dir/README.md" << EOF
# RMM Agent v${VERSION} - macOS 版本

## 安装说明

1. 解压安装包
2. 运行安装脚本: \`sudo ./install.sh rmm-agent config.toml --service\`
3. 编辑配置文件: \`sudo nano /etc/rmm-agent/config.toml\`
4. 重启服务: \`sudo launchctl stop com.example.rmm-agent && sudo launchctl start com.example.rmm-agent\`

## 文件说明

- \`rmm-agent\`: Agent 主程序
- \`config.toml\`: 配置文件模板
- \`install.sh\`: 安装脚本
- \`uninstall.sh\`: 卸载脚本

## 服务管理

- 启动服务: \`sudo launchctl start com.example.rmm-agent\`
- 停止服务: \`sudo launchctl stop com.example.rmm-agent\`
- 查看日志: \`tail -f /var/log/rmm-agent/rmm-agent.log\`

## 手动运行

\`\`\`bash
./rmm-agent --config config.toml
\`\`\`

更多信息请访问: https://github.com/your-org/rmm-agent
EOF
    
    # 创建压缩包
    cd "$DIST_DIR"
    tar -czf "${package_name}.tar.gz" "$package_name"
    rm -rf "$package_name"
    
    log_info "macOS 包已创建: ${package_name}.tar.gz"
}

# 创建源码包
package_source() {
    local package_name="rmm-agent-source-v${VERSION}"
    
    log_info "创建源码包..."
    
    local package_dir="$DIST_DIR/$package_name"
    mkdir -p "$package_dir"
    
    # 复制源码（排除构建产物）
    rsync -av \
        --exclude='target/' \
        --exclude='node_modules/' \
        --exclude='.git/' \
        --exclude='dist/' \
        --exclude='*.log' \
        "$PROJECT_ROOT/" "$package_dir/"
    
    # 创建压缩包
    cd "$DIST_DIR"
    tar -czf "${package_name}.tar.gz" "$package_name"
    rm -rf "$package_name"
    
    log_info "源码包已创建: ${package_name}.tar.gz"
}

# 生成校验和
generate_checksums() {
    log_info "生成校验和文件..."
    
    cd "$DIST_DIR"
    
    # 生成 SHA256 校验和
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum *.zip *.tar.gz > SHA256SUMS 2>/dev/null || true
    elif command -v shasum >/dev/null 2>&1; then
        shasum -a 256 *.zip *.tar.gz > SHA256SUMS 2>/dev/null || true
    fi
    
    # 生成 MD5 校验和
    if command -v md5sum >/dev/null 2>&1; then
        md5sum *.zip *.tar.gz > MD5SUMS 2>/dev/null || true
    elif command -v md5 >/dev/null 2>&1; then
        md5 *.zip *.tar.gz > MD5SUMS 2>/dev/null || true
    fi
}

# 显示打包结果
show_results() {
    log_info "打包完成！"
    echo
    echo "发布文件位于: $DIST_DIR"
    echo
    ls -la "$DIST_DIR"
    echo
    
    if [[ -f "$DIST_DIR/SHA256SUMS" ]]; then
        echo "SHA256 校验和:"
        cat "$DIST_DIR/SHA256SUMS"
        echo
    fi
}

# 主函数
main() {
    local package_type="$1"
    
    echo "RMM Agent 打包工具 v${VERSION}"
    echo "=============================="
    
    # 创建发布目录
    create_dist_dir
    
    case "$package_type" in
        "windows")
            # 打包所有 Windows 目标
            for target in x86_64-pc-windows-msvc x86_64-pc-windows-gnu; do
                package_windows "$target" || log_warn "跳过 $target"
            done
            ;;
        "linux")
            # 打包所有 Linux 目标
            for target in x86_64-unknown-linux-musl x86_64-unknown-linux-gnu aarch64-unknown-linux-musl; do
                package_linux "$target" || log_warn "跳过 $target"
            done
            ;;
        "macos")
            # 打包所有 macOS 目标
            for target in x86_64-apple-darwin aarch64-apple-darwin; do
                package_macos "$target" || log_warn "跳过 $target"
            done
            ;;
        "source")
            package_source
            ;;
        "all"|"")
            # 打包所有平台
            main "windows"
            main "linux"
            main "macos"
            main "source"
            ;;
        *)
            echo "用法: $0 [windows|linux|macos|source|all]"
            echo "  windows - 打包 Windows 版本"
            echo "  linux   - 打包 Linux 版本"
            echo "  macos   - 打包 macOS 版本"
            echo "  source  - 打包源码"
            echo "  all     - 打包所有版本（默认）"
            exit 1
            ;;
    esac
    
    # 生成校验和
    generate_checksums
    
    # 显示结果
    show_results
}

# 运行主函数
main "$@"