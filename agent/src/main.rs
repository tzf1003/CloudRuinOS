use anyhow::Result;
use std::env;
use tracing::{error, info};

mod config;
mod core;
mod platform;
mod transport;

use crate::config::ConfigManager;
use crate::core::Agent;

// 构建时信息
const BUILD_TARGET: &str = env!("BUILD_TARGET");
const BUILD_OS: &str = env!("BUILD_OS");
const BUILD_ARCH: &str = env!("BUILD_ARCH");
const GIT_HASH: &str = env!("GIT_HASH");

#[tokio::main]
async fn main() -> Result<()> {
    // 解析命令行参数
    let args: Vec<String> = env::args().collect();
    let mut config_path = None;
    let mut service_mode = false;

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--config" => {
                if i + 1 < args.len() {
                    config_path = Some(args[i + 1].clone());
                    i += 2;
                } else {
                    eprintln!("错误: --config 需要指定配置文件路径");
                    std::process::exit(1);
                }
            }
            "--service" => {
                service_mode = true;
                i += 1;
            }
            "--help" | "-h" => {
                print_help();
                return Ok(());
            }
            "--version" | "-v" => {
                print_version();
                return Ok(());
            }
            _ => {
                eprintln!("错误: 未知参数 '{}'", args[i]);
                print_help();
                std::process::exit(1);
            }
        }
    }

    // 加载配置
    let config_manager = if let Some(path) = config_path {
        ConfigManager::load_from_file(path)?
    } else {
        // 尝试从默认位置加载配置
        let default_paths = [
            "config.toml",
            "/etc/rmm-agent/config.toml",
            "C:\\ProgramData\\RMM Agent\\config.toml",
        ];

        let mut loaded = false;
        let mut config_manager = ConfigManager::default();

        for path in &default_paths {
            if std::path::Path::new(path).exists() {
                match ConfigManager::load_from_file(path) {
                    Ok(cm) => {
                        config_manager = cm;
                        loaded = true;
                        break;
                    }
                    Err(e) => {
                        eprintln!("警告: 加载配置文件 {} 失败: {}", path, e);
                    }
                }
            }
        }

        if !loaded {
            eprintln!("警告: 未找到配置文件，使用默认配置");
        }

        config_manager
    };

    // 初始化日志
    let log_level = &config_manager.config().logging.level;
    let env_filter = format!(
        "rmm_agent={},{}={}",
        log_level,
        env!("CARGO_PKG_NAME").replace('-', "_"),
        log_level
    );

    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::new(env_filter))
        .init();

    // 显示版本和构建信息
    info!("Starting RMM Agent v{}", env!("CARGO_PKG_VERSION"));
    info!(
        "Build target: {} (OS: {}, Arch: {})",
        BUILD_TARGET, BUILD_OS, BUILD_ARCH
    );
    info!("Git commit: {}", GIT_HASH);

    // 显示平台特定信息
    #[cfg(platform_windows)]
    info!("Platform: Windows");

    #[cfg(platform_linux)]
    info!("Platform: Linux");

    #[cfg(platform_macos)]
    info!("Platform: macOS");

    #[cfg(static_link)]
    info!("Linking: Static");

    #[cfg(not(static_link))]
    info!("Linking: Dynamic");

    // 显示启用的功能
    let mut features = Vec::new();

    #[cfg(feature = "doh")]
    features.push("DoH");

    #[cfg(feature = "ech")]
    features.push("ECH");

    #[cfg(feature = "tls-pinning")]
    features.push("TLS-Pinning");

    #[cfg(feature = "tls-strict")]
    features.push("TLS-Strict");

    if !features.is_empty() {
        info!("Enabled features: {}", features.join(", "));
    }

    // 显示配置信息
    let config = config_manager.config();
    info!("Server URL: {}", config.server.base_url);
    info!("Heartbeat interval: {}s", config.heartbeat.interval);
    info!("Service mode: {}", service_mode);

    // 创建并启动 Agent
    let agent = Agent::new_with_config(config_manager).await?;

    if let Err(e) = agent.run().await {
        error!("Agent failed: {}", e);
        std::process::exit(1);
    }

    Ok(())
}

fn print_help() {
    println!("RMM Agent v{}", env!("CARGO_PKG_VERSION"));
    println!("Remote Monitoring and Management Agent");
    println!();
    println!("USAGE:");
    println!("    rmm-agent [OPTIONS]");
    println!();
    println!("OPTIONS:");
    println!("    --config <FILE>    指定配置文件路径");
    println!("    --service          以服务模式运行");
    println!("    --help, -h         显示帮助信息");
    println!("    --version, -v      显示版本信息");
    println!();
    println!("EXAMPLES:");
    println!("    rmm-agent --config /etc/rmm-agent/config.toml");
    println!("    rmm-agent --service");
}

fn print_version() {
    println!("RMM Agent v{}", env!("CARGO_PKG_VERSION"));
    println!(
        "Build target: {} (OS: {}, Arch: {})",
        BUILD_TARGET, BUILD_OS, BUILD_ARCH
    );
    println!("Git commit: {}", GIT_HASH);
}
