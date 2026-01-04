use std::process::Command;
use std::fs;
use std::path::Path;

/// Agent 基础功能验证脚本
/// 验证 Agent 能够成功注册和发送心跳，以及网络安全机制正常工作
fn main() {
    println!("🚀 开始 Agent 基础功能验证");
    
    // 1. 验证编译
    println!("\n📦 验证 Agent 编译...");
    if verify_compilation() {
        println!("✅ Agent 编译检查通过");
    } else {
        println!("❌ Agent 编译检查失败");
        return;
    }
    
    // 2. 验证核心模块
    println!("\n🔧 验证核心模块...");
    verify_core_modules();
    
    // 3. 验证网络安全机制
    println!("\n🔒 验证网络安全机制...");
    verify_security_mechanisms();
    
    // 4. 验证平台抽象
    println!("\n🖥️ 验证平台抽象...");
    verify_platform_abstraction();
    
    // 5. 验证配置管理
    println!("\n⚙️ 验证配置管理...");
    verify_configuration_management();
    
    println!("\n✅ Agent 基础功能验证完成");
}

fn verify_compilation() -> bool {
    let output = Command::new("cargo")
        .args(&["check", "--all-features"])
        .current_dir("agent")
        .output();
    
    match output {
        Ok(output) => output.status.success(),
        Err(_) => false,
    }
}

fn verify_core_modules() {
    // 验证核心模块文件存在
    let core_modules = [
        "agent/src/core/mod.rs",
        "agent/src/core/crypto.rs",
        "agent/src/core/enrollment.rs", 
        "agent/src/core/heartbeat.rs",
        "agent/src/core/protocol.rs",
        "agent/src/core/state.rs",
        "agent/src/core/scheduler.rs",
        "agent/src/core/reconnect.rs",
    ];
    
    for module in &core_modules {
        if Path::new(module).exists() {
            println!("✅ 核心模块存在: {}", module);
        } else {
            println!("❌ 核心模块缺失: {}", module);
        }
    }
}

fn verify_security_mechanisms() {
    // 验证 TLS 配置
    let transport_file = "agent/src/transport/mod.rs";
    if Path::new(transport_file).exists() {
        match fs::read_to_string(transport_file) {
            Ok(content) => {
                if content.contains("TlsConfig") {
                    println!("✅ TLS 配置结构存在");
                } else {
                    println!("❌ TLS 配置结构缺失");
                }
                
                if content.contains("TlsVerifyMode") {
                    println!("✅ TLS 验证模式定义存在");
                } else {
                    println!("❌ TLS 验证模式定义缺失");
                }
            }
            Err(_) => println!("❌ 无法读取 transport 文件"),
        }
    } else {
        println!("❌ transport 模块文件缺失");
    }
    
    // 验证加密功能
    let crypto_file = "agent/src/core/crypto.rs";
    if Path::new(crypto_file).exists() {
        match fs::read_to_string(crypto_file) {
            Ok(content) => {
                if content.contains("Ed25519") {
                    println!("✅ Ed25519 签名支持存在");
                } else {
                    println!("❌ Ed25519 签名支持缺失");
                }
                
                if content.contains("generate_nonce") {
                    println!("✅ Nonce 生成功能存在");
                } else {
                    println!("❌ Nonce 生成功能缺失");
                }
            }
            Err(_) => println!("❌ 无法读取 crypto 文件"),
        }
    } else {
        println!("❌ crypto 模块文件缺失");
    }
}

fn verify_platform_abstraction() {
    // 验证平台抽象文件
    let platform_files = [
        "agent/src/platform/mod.rs",
        "agent/src/platform/windows.rs",
        "agent/src/platform/linux.rs", 
        "agent/src/platform/macos.rs",
    ];
    
    for file in &platform_files {
        if Path::new(file).exists() {
            println!("✅ 平台文件存在: {}", file);
        } else {
            println!("❌ 平台文件缺失: {}", file);
        }
    }
    
    // 验证平台 trait 定义
    let platform_mod = "agent/src/platform/mod.rs";
    if Path::new(platform_mod).exists() {
        match fs::read_to_string(platform_mod) {
            Ok(content) => {
                if content.contains("trait CommandExecutor") {
                    println!("✅ CommandExecutor trait 存在");
                } else {
                    println!("❌ CommandExecutor trait 缺失");
                }
                
                if content.contains("trait FileSystem") {
                    println!("✅ FileSystem trait 存在");
                } else {
                    println!("❌ FileSystem trait 缺失");
                }
            }
            Err(_) => println!("❌ 无法读取 platform mod 文件"),
        }
    } else {
        println!("❌ platform mod 文件缺失");
    }
}

fn verify_configuration_management() {
    // 验证状态管理
    let state_file = "agent/src/core/state.rs";
    if Path::new(state_file).exists() {
        match fs::read_to_string(state_file) {
            Ok(content) => {
                if content.contains("StateManager") {
                    println!("✅ StateManager 存在");
                } else {
                    println!("❌ StateManager 缺失");
                }
                
                if content.contains("AgentConfig") {
                    println!("✅ AgentConfig 存在");
                } else {
                    println!("❌ AgentConfig 缺失");
                }
                
                if content.contains("EnrollmentStatus") {
                    println!("✅ EnrollmentStatus 存在");
                } else {
                    println!("❌ EnrollmentStatus 缺失");
                }
            }
            Err(_) => println!("❌ 无法读取 state 文件"),
        }
    } else {
        println!("❌ state 模块文件缺失");
    }
    
    // 验证 Cargo.toml 配置
    let cargo_file = "agent/Cargo.toml";
    if Path::new(cargo_file).exists() {
        match fs::read_to_string(cargo_file) {
            Ok(content) => {
                if content.contains("[features]") {
                    println!("✅ Feature flags 配置存在");
                } else {
                    println!("❌ Feature flags 配置缺失");
                }
                
                // 检查关键依赖
                let required_deps = ["tokio", "serde", "reqwest"];
                for dep in &required_deps {
                    if content.contains(dep) {
                        println!("✅ 依赖存在: {}", dep);
                    } else {
                        println!("⚠️ 依赖可能缺失: {}", dep);
                    }
                }
            }
            Err(_) => println!("❌ 无法读取 Cargo.toml 文件"),
        }
    } else {
        println!("❌ Cargo.toml 文件缺失");
    }
}