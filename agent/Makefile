# Makefile for cross-platform RMM Agent compilation
# 支持 Windows, Linux, macOS 目标平台

.PHONY: all clean install-deps build-all build-windows build-linux build-macos test package help

# 默认目标
all: build-all

# 帮助信息
help:
	@echo "RMM Agent 跨平台编译 Makefile"
	@echo ""
	@echo "可用目标:"
	@echo "  all           - 编译所有支持的平台"
	@echo "  build-all     - 编译所有平台"
	@echo "  build-windows - 编译 Windows 版本"
	@echo "  build-linux   - 编译 Linux 版本"
	@echo "  build-macos   - 编译 macOS 版本"
	@echo "  install-deps  - 安装编译依赖"
	@echo "  test          - 运行测试"
	@echo "  package       - 打包所有平台的可执行文件"
	@echo "  clean         - 清理编译产物"
	@echo "  help          - 显示此帮助信息"

# 安装编译依赖
install-deps:
	@echo "安装跨平台编译依赖..."
	rustup target add x86_64-pc-windows-gnu
	rustup target add x86_64-pc-windows-msvc
	rustup target add x86_64-unknown-linux-musl
	rustup target add x86_64-unknown-linux-gnu
	rustup target add aarch64-unknown-linux-musl
	rustup target add aarch64-unknown-linux-gnu
ifeq ($(shell uname -s),Darwin)
	rustup target add x86_64-apple-darwin
	rustup target add aarch64-apple-darwin
endif
	@if ! command -v cross >/dev/null 2>&1; then \
		echo "安装 cross 工具..."; \
		cargo install cross --git https://github.com/cross-rs/cross; \
	fi

# 编译所有平台
build-all: build-windows build-linux build-macos

# Windows 编译
build-windows:
	@echo "编译 Windows 版本..."
	@mkdir -p target/release-windows
	cargo build --release --target x86_64-pc-windows-msvc --features "windows,tls-strict"
	@if [ -f target/x86_64-pc-windows-msvc/release/rmm-agent.exe ]; then \
		cp target/x86_64-pc-windows-msvc/release/rmm-agent.exe target/release-windows/rmm-agent-windows-x64.exe; \
		echo "✅ Windows x64 编译完成"; \
	fi
	
	cargo build --release --target x86_64-pc-windows-gnu --features "windows,tls-strict"
	@if [ -f target/x86_64-pc-windows-gnu/release/rmm-agent.exe ]; then \
		cp target/x86_64-pc-windows-gnu/release/rmm-agent.exe target/release-windows/rmm-agent-windows-x64-gnu.exe; \
		echo "✅ Windows x64 GNU 编译完成"; \
	fi

# Linux 编译
build-linux:
	@echo "编译 Linux 版本..."
	@mkdir -p target/release-linux
	cross build --release --target x86_64-unknown-linux-musl --features "linux,tls-strict,doh,static-link"
	@if [ -f target/x86_64-unknown-linux-musl/release/rmm-agent ]; then \
		cp target/x86_64-unknown-linux-musl/release/rmm-agent target/release-linux/rmm-agent-linux-x64-static; \
		echo "✅ Linux x64 静态链接版本编译完成"; \
	fi
	
	cross build --release --target x86_64-unknown-linux-gnu --features "linux,tls-strict,doh"
	@if [ -f target/x86_64-unknown-linux-gnu/release/rmm-agent ]; then \
		cp target/x86_64-unknown-linux-gnu/release/rmm-agent target/release-linux/rmm-agent-linux-x64; \
		echo "✅ Linux x64 动态链接版本编译完成"; \
	fi
	
	cross build --release --target aarch64-unknown-linux-musl --features "linux,tls-strict,doh,static-link"
	@if [ -f target/aarch64-unknown-linux-musl/release/rmm-agent ]; then \
		cp target/aarch64-unknown-linux-musl/release/rmm-agent target/release-linux/rmm-agent-linux-arm64-static; \
		echo "✅ Linux ARM64 静态链接版本编译完成"; \
	fi

# macOS 编译 (仅在 macOS 上可用)
build-macos:
ifeq ($(shell uname -s),Darwin)
	@echo "编译 macOS 版本..."
	@mkdir -p target/release-macos
	cargo build --release --target x86_64-apple-darwin --features "macos,tls-strict,doh"
	@if [ -f target/x86_64-apple-darwin/release/rmm-agent ]; then \
		cp target/x86_64-apple-darwin/release/rmm-agent target/release-macos/rmm-agent-macos-x64; \
		echo "✅ macOS x64 编译完成"; \
	fi
	
	cargo build --release --target aarch64-apple-darwin --features "macos,tls-strict,doh"
	@if [ -f target/aarch64-apple-darwin/release/rmm-agent ]; then \
		cp target/aarch64-apple-darwin/release/rmm-agent target/release-macos/rmm-agent-macos-arm64; \
		echo "✅ macOS ARM64 编译完成"; \
	fi
else
	@echo "⚠️  macOS 编译仅在 macOS 系统上支持"
endif

# 运行测试
test:
	@echo "运行跨平台测试..."
	cargo test --features "test-local"
	cargo test --features "windows,test-local" --target x86_64-pc-windows-msvc || true
	cross test --features "linux,test-local" --target x86_64-unknown-linux-gnu || true

# 打包所有平台的可执行文件
package: build-all
	@echo "打包所有平台的可执行文件..."
	@mkdir -p dist
	
	# 打包 Windows 版本
	@if [ -d target/release-windows ]; then \
		cd target/release-windows && tar -czf ../../dist/rmm-agent-windows.tar.gz *; \
		echo "📦 Windows 版本已打包到 dist/rmm-agent-windows.tar.gz"; \
	fi
	
	# 打包 Linux 版本
	@if [ -d target/release-linux ]; then \
		cd target/release-linux && tar -czf ../../dist/rmm-agent-linux.tar.gz *; \
		echo "📦 Linux 版本已打包到 dist/rmm-agent-linux.tar.gz"; \
	fi
	
	# 打包 macOS 版本
	@if [ -d target/release-macos ]; then \
		cd target/release-macos && tar -czf ../../dist/rmm-agent-macos.tar.gz *; \
		echo "📦 macOS 版本已打包到 dist/rmm-agent-macos.tar.gz"; \
	fi
	
	@echo "🎉 所有平台打包完成！"

# 清理编译产物
clean:
	@echo "清理编译产物..."
	cargo clean
	rm -rf target/release-*
	rm -rf dist
	@echo "✅ 清理完成"

# 显示编译信息
info:
	@echo "编译环境信息:"
	@echo "Rust 版本: $(shell rustc --version)"
	@echo "Cargo 版本: $(shell cargo --version)"
	@echo "目标平台: $(shell rustc --print target-list | grep -E '(windows|linux|darwin)' | head -10)"
	@echo "已安装目标: $(shell rustup target list --installed | grep -E '(windows|linux|darwin)')"