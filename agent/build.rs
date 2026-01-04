// build.rs - 构建时配置脚本
// 用于条件编译和平台特定配置

use std::env;

fn main() {
    // 获取目标平台信息
    let target = env::var("TARGET").unwrap();
    let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap();
    let target_arch = env::var("CARGO_CFG_TARGET_ARCH").unwrap();
    
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-env-changed=TARGET");
    
    // 注册自定义 cfg 标志
    println!("cargo:rustc-check-cfg=cfg(platform_windows)");
    println!("cargo:rustc-check-cfg=cfg(platform_linux)");
    println!("cargo:rustc-check-cfg=cfg(platform_macos)");
    println!("cargo:rustc-check-cfg=cfg(static_link)");
    println!("cargo:rustc-check-cfg=cfg(musl_target)");
    println!("cargo:rustc-check-cfg=cfg(apple_silicon)");
    println!("cargo:rustc-check-cfg=cfg(intel_mac)");
    println!("cargo:rustc-check-cfg=cfg(arch_x86_64)");
    println!("cargo:rustc-check-cfg=cfg(arch_aarch64)");
    println!("cargo:rustc-check-cfg=cfg(arch_x86)");
    
    // 根据目标平台设置条件编译标志
    match target_os.as_str() {
        "windows" => {
            println!("cargo:rustc-cfg=platform_windows");
            configure_windows_build();
        }
        "linux" => {
            println!("cargo:rustc-cfg=platform_linux");
            configure_linux_build(&target);
        }
        "macos" => {
            println!("cargo:rustc-cfg=platform_macos");
            configure_macos_build(&target_arch);
        }
        _ => {
            println!("cargo:warning=Unsupported target OS: {}", target_os);
        }
    }
    
    // 设置架构特定标志
    match target_arch.as_str() {
        "x86_64" => println!("cargo:rustc-cfg=arch_x86_64"),
        "aarch64" => println!("cargo:rustc-cfg=arch_aarch64"),
        "x86" => println!("cargo:rustc-cfg=arch_x86"),
        _ => println!("cargo:warning=Unsupported target architecture: {}", target_arch),
    }
    
    // 检查是否启用了静态链接
    if env::var("CARGO_FEATURE_STATIC_LINK").is_ok() {
        println!("cargo:rustc-cfg=static_link");
        configure_static_linking(&target);
    }
    
    // 输出构建信息
    println!("cargo:rustc-env=BUILD_TARGET={}", target);
    println!("cargo:rustc-env=BUILD_OS={}", target_os);
    println!("cargo:rustc-env=BUILD_ARCH={}", target_arch);
    
    // 设置版本信息
    if let Ok(git_hash) = env::var("GITHUB_SHA") {
        println!("cargo:rustc-env=GIT_HASH={}", &git_hash[..8]);
    } else if let Ok(output) = std::process::Command::new("git")
        .args(&["rev-parse", "--short", "HEAD"])
        .output()
    {
        let git_hash = String::from_utf8_lossy(&output.stdout);
        println!("cargo:rustc-env=GIT_HASH={}", git_hash.trim());
    } else {
        println!("cargo:rustc-env=GIT_HASH=unknown");
    }
}

fn configure_windows_build() {
    println!("cargo:rustc-link-lib=ws2_32");
    println!("cargo:rustc-link-lib=userenv");
    println!("cargo:rustc-link-lib=advapi32");
    
    // Windows 服务支持
    if env::var("CARGO_FEATURE_WINDOWS").is_ok() {
        println!("cargo:rustc-link-lib=winsvc");
        println!("cargo:rustc-link-lib=shell32");
    }
}

fn configure_linux_build(target: &str) {
    // 静态链接配置
    if target.contains("musl") {
        println!("cargo:rustc-cfg=musl_target");
        
        // 静态链接系统库
        println!("cargo:rustc-link-lib=static=c");
        
        // 设置静态链接标志
        println!("cargo:rustc-link-arg=-static");
        println!("cargo:rustc-link-arg=-no-pie");
    }
    
    // 动态链接配置
    if target.contains("gnu") {
        println!("cargo:rustc-link-lib=dl");
        println!("cargo:rustc-link-lib=pthread");
    }
}

fn configure_macos_build(arch: &str) {
    // macOS 框架链接
    println!("cargo:rustc-link-lib=framework=Security");
    println!("cargo:rustc-link-lib=framework=SystemConfiguration");
    
    // 架构特定配置
    match arch {
        "aarch64" => {
            println!("cargo:rustc-cfg=apple_silicon");
        }
        "x86_64" => {
            println!("cargo:rustc-cfg=intel_mac");
        }
        _ => {}
    }
}

fn configure_static_linking(target: &str) {
    if target.contains("musl") {
        // musl 静态链接配置
        println!("cargo:rustc-env=RUSTFLAGS=-C target-feature=+crt-static");
    }
    
    if target.contains("windows") {
        // Windows 静态链接配置
        println!("cargo:rustc-link-arg=/SUBSYSTEM:CONSOLE");
        println!("cargo:rustc-link-arg=/ENTRY:mainCRTStartup");
    }
}