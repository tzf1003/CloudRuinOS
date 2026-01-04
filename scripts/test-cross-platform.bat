@echo off
REM 跨平台兼容性测试脚本 (Windows)
REM Requirements: 8.5

setlocal enabledelayedexpansion

echo 🚀 开始跨平台兼容性测试...

REM 检查必要工具
echo [INFO] 检查必要工具...

where cargo >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Cargo 未安装
    exit /b 1
)

where rustc >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Rust 编译器未安装
    exit /b 1
)

echo [INFO] ✅ 必要工具检查通过

REM 检查 Rust 目标平台
echo [INFO] 检查 Rust 目标平台...

set "targets=x86_64-unknown-linux-gnu x86_64-pc-windows-gnu x86_64-pc-windows-msvc x86_64-apple-darwin aarch64-apple-darwin"
set "available_targets="

for %%t in (%targets%) do (
    rustup target list --installed | findstr "%%t" >nul 2>&1
    if !errorlevel! equ 0 (
        echo [INFO] ✅ %%t 已安装
        set "available_targets=!available_targets! %%t"
    ) else (
        echo [WARN] ⚠️ %%t 未安装
    )
)

if "%available_targets%"=="" (
    echo [ERROR] 没有可用的交叉编译目标
    exit /b 1
)

REM 编译测试
echo [INFO] 开始编译测试...

cd agent

for %%t in (%available_targets%) do (
    echo [INFO] 编译测试 - 目标平台: %%t
    
    cargo check --target %%t --quiet >nul 2>&1
    if !errorlevel! equ 0 (
        echo [INFO] ✅ %%t 编译检查通过
    ) else (
        echo [ERROR] ❌ %%t 编译检查失败
    )
    
    cargo build --target %%t --release --quiet >nul 2>&1
    if !errorlevel! equ 0 (
        echo [INFO] ✅ %%t 构建成功
    ) else (
        echo [WARN] ⚠️ %%t 构建失败（可能缺少交叉编译工具链）
    )
)

REM 功能特性测试
echo [INFO] 功能特性测试...

cargo test --quiet --no-run >nul 2>&1
if %errorlevel% equ 0 (
    echo [INFO] ✅ 默认特性编译通过
) else (
    echo [ERROR] ❌ 默认特性编译失败
    cd ..
    exit /b 1
)

REM 测试网络增强特性
set "network_features=doh tls-pinning"

for %%f in (%network_features%) do (
    cargo check --features %%f --quiet >nul 2>&1
    if !errorlevel! equ 0 (
        echo [INFO] ✅ 特性 '%%f' 编译通过
    ) else (
        echo [WARN] ⚠️ 特性 '%%f' 编译失败或不存在
    )
)

cd ..

REM 平台特定代码测试
echo [INFO] 平台特定代码测试...

set "platform_files=agent\src\platform\windows.rs agent\src\platform\linux.rs agent\src\platform\macos.rs"
set "found_platforms=0"

for %%f in (%platform_files%) do (
    if exist "%%f" (
        echo [INFO] ✅ 找到平台文件: %%f
        set /a found_platforms+=1
        
        findstr /c:"CommandExecutor" "%%f" >nul 2>&1 && findstr /c:"FileSystem" "%%f" >nul 2>&1
        if !errorlevel! equ 0 (
            echo [INFO] ✅ %%f 包含必要的 trait 实现
        ) else (
            echo [WARN] ⚠️ %%f 可能缺少必要的 trait 实现
        )
    )
)

if %found_platforms% equ 0 (
    echo [ERROR] ❌ 未找到任何平台特定实现
    exit /b 1
)

echo [INFO] ✅ 找到 %found_platforms% 个平台实现

REM 配置文件测试
echo [INFO] 配置文件测试...

if exist "agent\Cargo.toml" (
    findstr /c:"[features]" "agent\Cargo.toml" >nul 2>&1
    if !errorlevel! equ 0 (
        echo [INFO] ✅ Cargo.toml 包含特性配置
        
        REM 检查具体特性
        set "expected_features=windows linux macos doh tls-strict"
        for %%e in (!expected_features!) do (
            findstr /c:"%%e" "agent\Cargo.toml" >nul 2>&1
            if !errorlevel! equ 0 (
                echo [INFO] ✅ 找到特性: %%e
            ) else (
                echo [WARN] ⚠️ 未找到特性: %%e
            )
        )
    ) else (
        echo [WARN] ⚠️ Cargo.toml 缺少特性配置
    )
    
    REM 检查条件编译
    if exist "agent\src\platform\mod.rs" (
        findstr /c:"cfg(target_os" "agent\src\platform\mod.rs" >nul 2>&1
        if !errorlevel! equ 0 (
            echo [INFO] ✅ 找到条件编译配置
        ) else (
            echo [WARN] ⚠️ 未找到条件编译配置
        )
    )
) else (
    echo [ERROR] ❌ 未找到 agent\Cargo.toml
    exit /b 1
)

REM 依赖兼容性测试
echo [INFO] 依赖兼容性测试...

cd agent

cargo update --dry-run --quiet >nul 2>&1
if %errorlevel% equ 0 (
    echo [INFO] ✅ 依赖更新检查通过
) else (
    echo [WARN] ⚠️ 依赖更新检查失败
)

REM 检查依赖审计（如果安装了 cargo-audit）
where cargo-audit >nul 2>&1
if %errorlevel% equ 0 (
    cargo audit --quiet >nul 2>&1
    if !errorlevel! equ 0 (
        echo [INFO] ✅ 依赖安全审计通过
    ) else (
        echo [WARN] ⚠️ 依赖安全审计发现问题
    )
) else (
    echo [WARN] ⚠️ cargo-audit 未安装，跳过安全审计
)

REM 运行单元测试
echo [INFO] 运行单元测试...

cargo test --quiet >nul 2>&1
if %errorlevel% equ 0 (
    echo [INFO] ✅ 单元测试通过
) else (
    echo [ERROR] ❌ 单元测试失败
    cd ..
    exit /b 1
)

REM 运行集成测试
cargo test --test integration_test --quiet >nul 2>&1
if %errorlevel% equ 0 (
    echo [INFO] ✅ 集成测试通过
) else (
    echo [WARN] ⚠️ 集成测试失败或不存在
)

cd ..

REM 生成测试报告
echo [INFO] 生成测试报告...

set "report_file=cross-platform-test-report.md"

echo # 跨平台兼容性测试报告 > %report_file%
echo. >> %report_file%
echo 生成时间: %date% %time% >> %report_file%
echo 测试环境: Windows >> %report_file%

rustc --version >> temp_version.txt
set /p rust_version=<temp_version.txt
echo Rust 版本: %rust_version% >> %report_file%
del temp_version.txt

echo. >> %report_file%
echo ## 测试结果摘要 >> %report_file%
echo. >> %report_file%
echo ### 编译目标支持 >> %report_file%

rustup target list --installed > temp_targets.txt
for /f "tokens=*" %%i in (temp_targets.txt) do (
    echo - %%i >> %report_file%
)
del temp_targets.txt

echo. >> %report_file%
echo ### 平台特定实现 >> %report_file%

for %%f in (agent\src\platform\*.rs) do (
    echo - %%f >> %report_file%
)

echo. >> %report_file%
echo ### 测试状态 >> %report_file%

cd agent
cargo check --quiet >nul 2>&1
if %errorlevel% equ 0 (
    echo - 编译检查: ✅ 通过 >> ..\%report_file%
) else (
    echo - 编译检查: ❌ 失败 >> ..\%report_file%
)

cargo test --quiet >nul 2>&1
if %errorlevel% equ 0 (
    echo - 单元测试: ✅ 通过 >> ..\%report_file%
) else (
    echo - 单元测试: ❌ 失败 >> ..\%report_file%
)

cargo update --dry-run --quiet >nul 2>&1
if %errorlevel% equ 0 (
    echo - 依赖检查: ✅ 通过 >> ..\%report_file%
) else (
    echo - 依赖检查: ❌ 失败 >> ..\%report_file%
)

cd ..

echo. >> %report_file%
echo ## 建议 >> %report_file%
echo. >> %report_file%
echo 1. 确保所有目标平台都有对应的实现文件 >> %report_file%
echo 2. 定期更新依赖并进行安全审计 >> %report_file%
echo 3. 在 CI/CD 中集成跨平台编译测试 >> %report_file%
echo 4. 考虑添加更多平台特定的功能测试 >> %report_file%

echo [INFO] ✅ 测试报告已生成: %report_file%

echo [INFO] 🎉 跨平台兼容性测试完成！

endlocal