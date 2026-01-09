// 测试debug代理配置
// 运行方式: cargo run --example test_debug_proxy --features windows

use ruinos_agent::transport::{HttpClient, TlsConfig};

#[tokio::main]
async fn main() {
    // 初始化日志
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    println!("=== Debug代理配置测试 ===\n");

    // 测试1: 检查环境变量
    let env_debug = std::env::var("AGENT_DEBUG_PROXY")
        .map(|v| v == "1" || v.to_lowercase() == "true")
        .unwrap_or(false);
    
    println!("1. 环境变量 AGENT_DEBUG_PROXY: {}", 
        if env_debug { "✓ 已设置" } else { "✗ 未设置" });

    // 测试2: 检查编译模式
    let debug_assertions = cfg!(debug_assertions);
    println!("2. Debug编译模式: {}", 
        if debug_assertions { "✓ 是" } else { "✗ 否 (Release模式)" });

    // 测试3: 创建TlsConfig
    let debug_mode = env_debug || debug_assertions;
    println!("3. 最终Debug模式: {}\n", 
        if debug_mode { "✓ 启用" } else { "✗ 禁用" });

    let tls_config = if debug_mode {
        println!("→ 使用 TlsConfig::debug()");
        TlsConfig::debug()
    } else {
        println!("→ 使用 TlsConfig::default()");
        TlsConfig::default()
    };

    println!("4. TlsConfig.debug_mode: {}\n", tls_config.debug_mode);

    // 测试4: 创建HttpClient
    println!("5. 创建 HttpClient...");
    match HttpClient::new(tls_config) {
        Ok(_client) => {
            println!("✓ HttpClient 创建成功");
            println!("\n=== 配置验证完成 ===");
            println!("如果启用了debug模式，上面应该显示代理警告信息");
        }
        Err(e) => {
            println!("✗ HttpClient 创建失败: {}", e);
        }
    }
}
