// Debug代理功能测试
// 验证在debug模式下HTTP客户端正确配置代理和证书信任

use ruinos_agent::transport::{HttpClient, TlsConfig};

#[test]
fn test_debug_mode_tls_config() {
    // 创建debug模式的TLS配置
    let tls_config = TlsConfig::debug();
    
    assert!(tls_config.debug_mode, "Debug mode should be enabled");
}

#[test]
fn test_normal_mode_tls_config() {
    // 创建普通模式的TLS配置
    let tls_config = TlsConfig::strict();
    
    assert!(!tls_config.debug_mode, "Debug mode should be disabled in strict mode");
}

#[test]
fn test_default_tls_config() {
    // 默认配置应该禁用debug模式
    let tls_config = TlsConfig::default();
    
    assert!(!tls_config.debug_mode, "Debug mode should be disabled by default");
}

#[tokio::test]
async fn test_http_client_with_debug_mode() {
    // 创建带debug模式的HTTP客户端
    let tls_config = TlsConfig::debug();
    let result = HttpClient::new(tls_config);
    
    assert!(result.is_ok(), "Should be able to create HTTP client with debug mode");
    
    let client = result.unwrap();
    assert!(client.tls_config().debug_mode, "HTTP client should have debug mode enabled");
}

#[tokio::test]
async fn test_http_client_without_debug_mode() {
    // 创建不带debug模式的HTTP客户端
    let tls_config = TlsConfig::strict();
    let result = HttpClient::new(tls_config);
    
    assert!(result.is_ok(), "Should be able to create HTTP client without debug mode");
    
    let client = result.unwrap();
    assert!(!client.tls_config().debug_mode, "HTTP client should have debug mode disabled");
}
