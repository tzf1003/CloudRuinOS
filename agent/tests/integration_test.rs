use rmm_agent::Agent;
use std::time::Duration;
use tokio::time::timeout;

#[tokio::test]
async fn test_agent_instantiation() {
    // 测试 Agent 能够成功创建
    let result = timeout(Duration::from_secs(10), Agent::new()).await;
    
    match result {
        Ok(Ok(agent)) => {
            println!("✅ Agent 创建成功");
            
            // 验证 Agent 的基本组件
            assert!(agent.state_manager().get_config().await.server_url.len() > 0);
            println!("✅ StateManager 工作正常");
            
            // 验证调度器
            assert!(agent.scheduler().list_tasks().await.is_empty());
            println!("✅ Scheduler 工作正常");
            
            println!("✅ Agent 基础功能验证通过");
        }
        Ok(Err(e)) => {
            panic!("❌ Agent 创建失败: {}", e);
        }
        Err(_) => {
            panic!("❌ Agent 创建超时");
        }
    }
}

#[tokio::test]
async fn test_agent_configuration() {
    // 测试 Agent 配置管理
    let agent = Agent::new().await.expect("Agent 创建失败");
    
    let config = agent.state_manager().get_config().await;
    
    // 验证默认配置
    assert!(!config.server_url.is_empty(), "服务器 URL 不应为空");
    assert!(config.heartbeat_interval > 0, "心跳间隔应大于 0");
    assert!(config.request_timeout > 0, "请求超时应大于 0");
    
    println!("✅ Agent 配置验证通过");
}

#[tokio::test]
async fn test_crypto_functionality() {
    use rmm_agent::core::crypto::CryptoManager;
    
    // 测试加密功能
    let crypto_manager = CryptoManager::generate().expect("密钥对生成失败");
    let public_key = crypto_manager.public_key_base64();
    let private_key = crypto_manager.private_key_base64();
    assert!(!public_key.is_empty(), "公钥不应为空");
    assert!(!private_key.is_empty(), "私钥不应为空");
    
    // 测试签名和验证
    let message = b"test message";
    let signature = crypto_manager.sign(message);
    
    let is_valid = crypto_manager.verify(message, &signature)
        .expect("签名验证失败");
    
    assert!(is_valid, "签名验证应该成功");
    
    // 测试 nonce 生成
    let nonce1 = CryptoManager::generate_nonce();
    let nonce2 = CryptoManager::generate_nonce();
    assert_ne!(nonce1, nonce2, "两个 nonce 应该不同");
    
    println!("✅ 加密功能验证通过");
}

#[tokio::test]
async fn test_platform_abstraction() {
    use rmm_agent::platform::{create_command_executor, create_file_system};
    
    // 测试平台抽象
    let _executor = create_command_executor();
    let _filesystem = create_file_system();
    
    println!("✅ 平台抽象验证通过");
}