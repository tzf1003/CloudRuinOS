#!/bin/bash

# 跨平台编译脚�?# 支持 Windows, Linux, macOS 目标平台

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

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

# 检�?Rust 工具�?check_toolchain() {
    if ! command -v rustc &> /dev/null; then
        log_error "Rust 未安装，请先安装 Rust"
        exit 1
    fi
    
    if ! command -v cross &> /dev/null; then
        log_warn "cross 未安装，正在安装..."
        cargo install cross --git https://github.com/cross-rs/cross
    fi
}

# 安装目标平台
install_targets() {
    log_info "安装跨平台编译目�?.."
    
    # Windows 目标
    rustup target add x86_64-pc-windows-gnu
    rustup target add x86_64-pc-windows-msvc
    
    # Linux 目标
    rustup target add x86_64-unknown-linux-musl
    rustup target add x86_64-unknown-linux-gnu
    
    # macOS 目标
    if [[ "$OSTYPE" == "darwin"* ]]; then
        rustup target add x86_64-apple-darwin
        rustup target add aarch64-apple-darwin
    fi
}

# 编译函数
build_target() {
    local target=$1
    local features=$2
    local output_dir="target/release-${target}"
    
    log_info "编译目标: ${target}"
    
    # 创建输出目录
    mkdir -p "${output_dir}"
    
    # 根据目标平台选择编译方式
    case $target in
        *windows*)
            if command -v cross &> /dev/null; then
                cross build --release --target ${target} --features "${features}"
            else
                cargo build --release --target ${target} --features "${features}"
            fi
            
            # 复制 Windows 可执行文�?            if [ -f "target/${target}/release/ruinos-agent.exe" ]; then
                cp "target/${target}/release/ruinos-agent.exe" "${output_dir}/"
                log_info "Windows 可执行文件已复制�?${output_dir}/"
            fi
            ;;
            
        *linux-musl*)
            # 使用 musl 进行静态链�?            cross build --release --target ${target} --features "${features},static-link"
            
            # 复制 Linux 可执行文�?            if [ -f "target/${target}/release/ruinos-agent" ]; then
                cp "target/${target}/release/ruinos-agent" "${output_dir}/"
                log_info "Linux 可执行文件已复制�?${output_dir}/"
            fi
            ;;
            
        *apple*)
            # macOS 编译
            cargo build --release --target ${target} --features "${features}"
            
            # 复制 macOS 可执行文�?            if [ -f "target/${target}/release/ruinos-agent" ]; then
                cp "target/${target}/release/ruinos-agent" "${output_dir}/"
                log_info "macOS 可执行文件已复制�?${output_dir}/"
            fi
            ;;
            
        *)
            cargo build --release --target ${target} --features "${features}"
            
            if [ -f "target/${target}/release/ruinos-agent" ]; then
                cp "target/${target}/release/ruinos-agent" "${output_dir}/"
                log_info "可执行文件已复制�?${output_dir}/"
            fi
            ;;
    esac
}

# 主函�?main() {
    log_info "开始跨平台编译..."
    
    # 切换�?agent 目录
    cd agent
    
    # 检查工具链
    check_toolchain
    
    # 安装目标平台
    install_targets
    
    # 定义编译目标和对应的 features
    declare -A targets_features=(
        ["x86_64-pc-windows-gnu"]="windows,tls-strict"
        ["x86_64-pc-windows-msvc"]="windows,tls-strict"
        ["x86_64-unknown-linux-musl"]="linux,tls-strict,doh"
        ["x86_64-unknown-linux-gnu"]="linux,tls-strict,doh"
    )
    
    # 如果�?macOS 上，添加 macOS 目标
    if [[ "$OSTYPE" == "darwin"* ]]; then
        targets_features["x86_64-apple-darwin"]="macos,tls-strict,doh"
        targets_features["aarch64-apple-darwin"]="macos,tls-strict,doh"
    fi
    
    # 编译所有目�?    for target in "${!targets_features[@]}"; do
        features="${targets_features[$target]}"
        
        log_info "开始编�?${target}..."
        if build_target "$target" "$features"; then
            log_info "�?${target} 编译成功"
        else
            log_error "�?${target} 编译失败"
            exit 1
        fi
    done
    
    log_info "🎉 所有目标编译完成！"
    log_info "编译产物位于 target/release-* 目录�?
}

# 运行主函�?main "$@"