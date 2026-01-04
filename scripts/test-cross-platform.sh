#!/bin/bash

# 跨平台兼容性测试脚本
# Requirements: 8.5

set -e

echo "🚀 开始跨平台兼容性测试..."

# 颜色定义
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

# 检查必要工具
check_prerequisites() {
    log_info "检查必要工具..."
    
    if ! command -v cargo &> /dev/null; then
        log_error "Cargo 未安装"
        exit 1
    fi
    
    if ! command -v rustc &> /dev/null; then
        log_error "Rust 编译器未安装"
        exit 1
    fi
    
    log_info "✅ 必要工具检查通过"
}

# 检查 Rust 目标平台
check_rust_targets() {
    log_info "检查 Rust 目标平台..."
    
    local targets=(
        "x86_64-unknown-linux-gnu"
        "x86_64-pc-windows-gnu"
        "x86_64-apple-darwin"
        "aarch64-apple-darwin"
    )
    
    local available_targets=()
    
    for target in "${targets[@]}"; do
        if rustup target list --installed | grep -q "$target"; then
            available_targets+=("$target")
            log_info "✅ $target 已安装"
        else
            log_warn "⚠️ $target 未安装"
        fi
    done
    
    if [ ${#available_targets[@]} -eq 0 ]; then
        log_error "没有可用的交叉编译目标"
        exit 1
    fi
    
    echo "${available_targets[@]}"
}

# 编译测试
compile_test() {
    local target=$1
    log_info "编译测试 - 目标平台: $target"
    
    cd agent
    
    # 检查编译
    if cargo check --target "$target" --quiet; then
        log_info "✅ $target 编译检查通过"
    else
        log_error "❌ $target 编译检查失败"
        return 1
    fi
    
    # 尝试构建（如果有交叉编译工具链）
    if cargo build --target "$target" --release --quiet 2>/dev/null; then
        log_info "✅ $target 构建成功"
    else
        log_warn "⚠️ $target 构建失败（可能缺少交叉编译工具链）"
    fi
    
    cd ..
}

# 功能特性测试
feature_test() {
    log_info "功能特性测试..."
    
    cd agent
    
    # 测试默认特性
    if cargo test --quiet --no-run; then
        log_info "✅ 默认特性编译通过"
    else
        log_error "❌ 默认特性编译失败"
        cd ..
        return 1
    fi
    
    # 测试网络增强特性
    local network_features=("doh" "tls-pinning")
    
    for feature in "${network_features[@]}"; do
        if cargo check --features "$feature" --quiet 2>/dev/null; then
            log_info "✅ 特性 '$feature' 编译通过"
        else
            log_warn "⚠️ 特性 '$feature' 编译失败或不存在"
        fi
    done
    
    cd ..
}

# 平台特定代码测试
platform_code_test() {
    log_info "平台特定代码测试..."
    
    local platform_files=(
        "agent/src/platform/windows.rs"
        "agent/src/platform/linux.rs"
        "agent/src/platform/macos.rs"
    )
    
    local found_platforms=0
    
    for file in "${platform_files[@]}"; do
        if [ -f "$file" ]; then
            log_info "✅ 找到平台文件: $file"
            found_platforms=$((found_platforms + 1))
            
            # 检查文件内容
            if grep -q "CommandExecutor" "$file" && grep -q "FileSystem" "$file"; then
                log_info "✅ $file 包含必要的 trait 实现"
            else
                log_warn "⚠️ $file 可能缺少必要的 trait 实现"
            fi
        fi
    done
    
    if [ $found_platforms -eq 0 ]; then
        log_error "❌ 未找到任何平台特定实现"
        return 1
    fi
    
    log_info "✅ 找到 $found_platforms 个平台实现"
}

# 配置文件测试
config_test() {
    log_info "配置文件测试..."
    
    # 检查 Cargo.toml
    if [ -f "agent/Cargo.toml" ]; then
        local cargo_toml="agent/Cargo.toml"
        
        # 检查平台特性
        if grep -q "\[features\]" "$cargo_toml"; then
            log_info "✅ Cargo.toml 包含特性配置"
            
            # 检查具体特性
            local expected_features=("windows" "linux" "macos" "doh" "tls-strict")
            for feature in "${expected_features[@]}"; do
                if grep -q "$feature" "$cargo_toml"; then
                    log_info "✅ 找到特性: $feature"
                else
                    log_warn "⚠️ 未找到特性: $feature"
                fi
            done
        else
            log_warn "⚠️ Cargo.toml 缺少特性配置"
        fi
        
        # 检查条件编译
        if grep -q "cfg(target_os" "agent/src/platform/mod.rs" 2>/dev/null; then
            log_info "✅ 找到条件编译配置"
        else
            log_warn "⚠️ 未找到条件编译配置"
        fi
    else
        log_error "❌ 未找到 agent/Cargo.toml"
        return 1
    fi
}

# 依赖兼容性测试
dependency_test() {
    log_info "依赖兼容性测试..."
    
    cd agent
    
    # 检查依赖更新
    if cargo update --dry-run --quiet; then
        log_info "✅ 依赖更新检查通过"
    else
        log_warn "⚠️ 依赖更新检查失败"
    fi
    
    # 检查依赖审计（如果安装了 cargo-audit）
    if command -v cargo-audit &> /dev/null; then
        if cargo audit --quiet; then
            log_info "✅ 依赖安全审计通过"
        else
            log_warn "⚠️ 依赖安全审计发现问题"
        fi
    else
        log_warn "⚠️ cargo-audit 未安装，跳过安全审计"
    fi
    
    cd ..
}

# 运行单元测试
unit_test() {
    log_info "运行单元测试..."
    
    cd agent
    
    # 运行基础测试
    if cargo test --quiet; then
        log_info "✅ 单元测试通过"
    else
        log_error "❌ 单元测试失败"
        cd ..
        return 1
    fi
    
    # 运行集成测试
    if cargo test --test integration_test --quiet; then
        log_info "✅ 集成测试通过"
    else
        log_warn "⚠️ 集成测试失败或不存在"
    fi
    
    cd ..
}

# 生成测试报告
generate_report() {
    log_info "生成测试报告..."
    
    local report_file="cross-platform-test-report.md"
    
    cat > "$report_file" << EOF
# 跨平台兼容性测试报告

生成时间: $(date)
测试环境: $(uname -a)
Rust 版本: $(rustc --version)

## 测试结果摘要

### 编译目标支持
$(rustup target list --installed | sed 's/^/- /')

### 平台特定实现
$(find agent/src/platform -name "*.rs" -type f | sed 's/^/- /')

### 功能特性
$(grep -E "^\s*[a-zA-Z0-9_-]+\s*=" agent/Cargo.toml | grep -A 20 "\[features\]" | sed 's/^/- /' || echo "- 未找到特性配置")

### 测试状态
- 编译检查: $(if cargo check --manifest-path agent/Cargo.toml --quiet; then echo "✅ 通过"; else echo "❌ 失败"; fi)
- 单元测试: $(if cargo test --manifest-path agent/Cargo.toml --quiet; then echo "✅ 通过"; else echo "❌ 失败"; fi)
- 依赖检查: $(if cargo update --manifest-path agent/Cargo.toml --dry-run --quiet; then echo "✅ 通过"; else echo "❌ 失败"; fi)

## 建议

1. 确保所有目标平台都有对应的实现文件
2. 定期更新依赖并进行安全审计
3. 在 CI/CD 中集成跨平台编译测试
4. 考虑添加更多平台特定的功能测试

EOF

    log_info "✅ 测试报告已生成: $report_file"
}

# 主函数
main() {
    log_info "开始跨平台兼容性测试..."
    
    check_prerequisites
    
    local available_targets
    available_targets=$(check_rust_targets)
    
    # 编译测试
    for target in $available_targets; do
        compile_test "$target" || log_warn "编译测试失败: $target"
    done
    
    # 功能测试
    feature_test || log_warn "功能特性测试失败"
    platform_code_test || log_warn "平台代码测试失败"
    config_test || log_warn "配置文件测试失败"
    dependency_test || log_warn "依赖测试失败"
    unit_test || log_warn "单元测试失败"
    
    # 生成报告
    generate_report
    
    log_info "🎉 跨平台兼容性测试完成！"
}

# 运行主函数
main "$@"