use anyhow::Result;
use std::env;
use tracing::{error, info};

mod config;
mod core;
mod platform;
mod transport;
mod terminal;
mod task_handler;

use crate::config::{BootstrapConfig, ConfigManager};
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
    let mut server_url: Option<String> = None;
    let mut enrollment_token: Option<String> = None;
    let mut service_mode = false;

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--server" => {
                if i + 1 < args.len() {
                    server_url = Some(args[i + 1].clone());
                    i += 2;
                } else {
                    eprintln!("错误: --server 需要指定 URL");
                    std::process::exit(1);
                }
            }
            "--token" => {
                if i + 1 < args.len() {
                    enrollment_token = Some(args[i + 1].clone());
                    i += 2;
                } else {
                    eprintln!("错误: --token 需要指定令牌");
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

    // 如果命令行未指定，尝试从环境变量获取
    if server_url.is_none() {
        if let Ok(url) = env::var("RMM_SERVER_URL") {
            server_url = Some(url);
        }
    }

    if enrollment_token.is_none() {
        if let Ok(token) = env::var("RMM_ENROLLMENT_TOKEN") {
            enrollment_token = Some(token);
        }
    }

    // 初始化配置管理器
    let bootstrap = BootstrapConfig {
        server_url: server_url.unwrap_or_else(|| "https://api.c.54321000.xyz".to_string()),
        enrollment_token,
    };

    let config_manager = ConfigManager::new(bootstrap);

    // 初始化日志
    // 优先使用 RUST_LOG 环境变量，如果没有设置，则使用配置中的日志级别
    let log_level = &config_manager.config().logging.level;
    let default_filter = format!(
        "ruinos_agent={},{}={}",
        log_level,
        env!("CARGO_PKG_NAME").replace('-', "_"),
        log_level
    );

    let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new(default_filter));

    tracing_subscriber::fmt()
        .with_env_filter(env_filter)
        .init();

    // 显示版本和构建信息
    info!("Starting Ruinos Agent v{}", env!("CARGO_PKG_VERSION"));
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
    let mut agent = Agent::new_with_config(config_manager).await?;

    if let Err(e) = agent.run().await {
        error!("Agent failed: {}", e);
        std::process::exit(1);
    }

    Ok(())
}

fn print_help() {
    println!("Ruinos Agent v{}", env!("CARGO_PKG_VERSION"));
    println!("Remote Monitoring and Management Agent");
    println!();
    println!("USAGE:");
    println!("    ruinos-agent [OPTIONS]");
    println!();
    println!("OPTIONS:");
    println!("    --server <URL>     指定服务器 URL (env: RMM_SERVER_URL)");
    println!("    --token <TOKEN>    指定注册令牌 (env: RMM_ENROLLMENT_TOKEN)");
    println!("    --service          以服务模式运行");
    println!("    --help, -h         显示帮助信息");
    println!("    --version, -v      显示版本信息");
    println!();
    println!("EXAMPLES:");
    println!("    ruinos-agent --server https://api.example.com --token my-token");
    println!("    ruinos-agent --service");
}

fn print_version() {
    println!("Ruinos Agent v{}", env!("CARGO_PKG_VERSION"));
    println!(
        "Build target: {} (OS: {}, Arch: {})",
        BUILD_TARGET, BUILD_OS, BUILD_ARCH
    );
    println!("Git commit: {}", GIT_HASH);
}
