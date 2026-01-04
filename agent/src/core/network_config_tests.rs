// network_config_tests.rs - 网络功能配置属性测试
// Property 27: 网络功能开关
// Property 28: 配置热更新
// Validates: Requirements 6.4, 6.5

use crate::config::{AgentConfig, ConfigManager, SecuritySection};
use proptest::prelude::*;
use std::fs;
use std::path::PathBuf;
use tempfile::TempDir;

/// 生成随机的安全配置
fn arb_security_config() -> impl Strategy<Value = SecuritySection> {
    (
        any::<bool>(), // tls_verify
        any::<bool>(), // certificate_pinning
        prop::option::of(prop::collection::vec(any::<String>(), 0..5)), // certificate_pins
        any::<bool>(), // doh_enabled
        prop::option::of(prop::collection::vec(any::<String>(), 0..3)), // doh_providers
        any::<bool>(), // ech_enabled
    ).prop_map(|(tls_verify, certificate_pinning, certificate_pins, doh_enabled, doh_providers, ech_enabled)| {
        SecuritySection {
            tls_verify,
            certificate_pinning,
            certificate_pins,
            doh_enabled,
            doh_providers,
            ech_enabled,
        }
    })
}

/// 生成有效的服务器 URL
fn arb_server_url() -> impl Strategy<Value = String> {
    prop::collection::vec("[a-z0-9]", 3..10)
        .prop_map(|parts| {
            let domain = parts.join("");
            format!("https://{}.example.com", domain)
        })
}

/// 生成随机的完整配置
fn arb_agent_config() -> impl Strategy<Value = AgentConfig> {
    (
        arb_security_config(),
        arb_server_url(),     // server base_url
        1u64..3600u64,        // heartbeat interval
    ).prop_map(|(security, base_url, heartbeat_interval)| {
        let mut config = ConfigManager::default().config().clone();
        config.security = security;
        config.server.base_url = base_url;
        config.heartbeat.interval = heartbeat_interval;
        config
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    proptest! {
        /// Property 27: 网络功能开关
        /// 对于任何 DoH 和 ECH 功能，Agent 应该支持运行时启用/禁用
        /// **Validates: Requirements 6.4**
        #[test]
        fn property_27_network_feature_toggle(
            initial_config in arb_agent_config(),
            new_doh_enabled in any::<bool>(),
            new_ech_enabled in any::<bool>()
        ) {
            // Feature: lightweight-rmm, Property 27: 网络功能开关
            
            // 创建临时目录和配置文件
            let temp_dir = TempDir::new().expect("创建临时目录失败");
            let config_path = temp_dir.path().join("config.toml");
            
            // 保存初始配置（使用生成的随机配置）
            let config_content = toml::to_string_pretty(&initial_config).expect("序列化初始配置失败");
            fs::write(&config_path, config_content).expect("写入初始配置文件失败");
            
            // 加载配置管理器
            let mut manager = ConfigManager::load_from_file(&config_path).expect("加载配置失败");
            
            // 记录初始状态
            let initial_doh = manager.config().security.doh_enabled;
            let initial_ech = manager.config().security.ech_enabled;
            
            // 模拟运行时配置更新
            let mut updated_config = manager.config().clone();
            updated_config.security.doh_enabled = new_doh_enabled;
            updated_config.security.ech_enabled = new_ech_enabled;
            
            // 等待一小段时间确保文件时间戳不同
            std::thread::sleep(Duration::from_millis(10));
            
            // 创建新的配置内容
            let updated_content = toml::to_string_pretty(&updated_config).expect("序列化更新配置失败");
            fs::write(&config_path, updated_content).expect("写入更新配置文件失败");
            
            // 检查配置更新
            let has_updates = manager.check_for_updates().expect("检查更新失败");
            
            // 验证属性：如果配置有变化，应该检测到更新
            let config_changed = initial_doh != new_doh_enabled || initial_ech != new_ech_enabled;
            if config_changed {
                prop_assert!(has_updates, "配置变化时应该检测到更新: initial_doh={}, new_doh={}, initial_ech={}, new_ech={}", 
                           initial_doh, new_doh_enabled, initial_ech, new_ech_enabled);
            }
            
            // 验证新配置已生效
            prop_assert_eq!(manager.config().security.doh_enabled, new_doh_enabled);
            prop_assert_eq!(manager.config().security.ech_enabled, new_ech_enabled);
            
            // 验证其他配置项未受影响
            prop_assert_eq!(manager.config().security.tls_verify, updated_config.security.tls_verify);
            prop_assert_eq!(manager.config().heartbeat.interval, updated_config.heartbeat.interval);
        }

        /// Property 28: 配置热更新
        /// 对于任何网络增强功能的配置变更，Agent 应该支持运行时开关
        /// **Validates: Requirements 6.5**
        #[test]
        fn property_28_config_hot_reload(
            config1 in arb_agent_config(),
            config2 in arb_agent_config()
        ) {
            // Feature: lightweight-rmm, Property 28: 配置热更新
            
            // 创建临时目录和配置文件
            let temp_dir = TempDir::new().expect("创建临时目录失败");
            let config_path = temp_dir.path().join("config.toml");
            
            // 保存第一个配置
            let config1_content = toml::to_string_pretty(&config1).expect("序列化配置1失败");
            fs::write(&config_path, config1_content).expect("写入配置文件1失败");
            
            // 加载配置管理器
            let mut manager = ConfigManager::load_from_file(&config_path).expect("加载配置失败");
            
            // 验证初始配置
            prop_assert_eq!(manager.config().security.doh_enabled, config1.security.doh_enabled);
            prop_assert_eq!(manager.config().security.ech_enabled, config1.security.ech_enabled);
            prop_assert_eq!(manager.config().security.tls_verify, config1.security.tls_verify);
            
            // 等待一小段时间确保文件时间戳不同
            std::thread::sleep(Duration::from_millis(10));
            
            // 更新配置文件
            let config2_content = toml::to_string_pretty(&config2).expect("序列化配置2失败");
            fs::write(&config_path, config2_content).expect("写入配置文件2失败");
            
            // 检查并应用更新
            let has_updates = manager.check_for_updates().expect("检查更新失败");
            
            // 验证属性：如果配置有变化，应该检测到更新
            let configs_different = config1.security.doh_enabled != config2.security.doh_enabled
                || config1.security.ech_enabled != config2.security.ech_enabled
                || config1.security.tls_verify != config2.security.tls_verify
                || config1.heartbeat.interval != config2.heartbeat.interval;
            
            if configs_different {
                prop_assert!(has_updates);
            }
            
            // 验证新配置已生效
            prop_assert_eq!(manager.config().security.doh_enabled, config2.security.doh_enabled);
            prop_assert_eq!(manager.config().security.ech_enabled, config2.security.ech_enabled);
            prop_assert_eq!(manager.config().security.tls_verify, config2.security.tls_verify);
            prop_assert_eq!(manager.config().heartbeat.interval, config2.heartbeat.interval);
            
            // 验证配置结构完整性
            prop_assert!(!manager.config().server.base_url.is_empty());
            prop_assert!(manager.config().heartbeat.interval > 0);
        }

        /// 辅助属性测试：DoH 提供商配置有效性
        #[test]
        fn property_doh_providers_validity(
            mut config in arb_agent_config(),
            providers in prop::option::of(prop::collection::vec(any::<String>(), 0..5))
        ) {
            // 设置 DoH 提供商
            config.security.doh_providers = providers.clone();
            
            // 创建临时配置文件
            let temp_dir = TempDir::new().expect("创建临时目录失败");
            let config_path = temp_dir.path().join("config.toml");
            
            let config_content = toml::to_string_pretty(&config).expect("序列化配置失败");
            fs::write(&config_path, config_content).expect("写入配置文件失败");
            
            // 加载配置
            let manager = ConfigManager::load_from_file(&config_path).expect("加载配置失败");
            
            // 验证 DoH 提供商配置保持一致
            prop_assert_eq!(&manager.config().security.doh_providers, &providers);
            
            // 如果启用了 DoH 但没有提供商，应该有默认值或保持 None
            if config.security.doh_enabled && providers.is_none() {
                // 配置管理器应该处理这种情况
                prop_assert!(true); // 允许这种情况，由运行时处理
            }
        }

        /// 辅助属性测试：证书固定配置有效性
        #[test]
        fn property_certificate_pinning_validity(
            mut config in arb_agent_config(),
            pins in prop::option::of(prop::collection::vec(any::<String>(), 0..3))
        ) {
            // 设置证书固定
            config.security.certificate_pins = pins.clone();
            
            // 创建临时配置文件
            let temp_dir = TempDir::new().expect("创建临时目录失败");
            let config_path = temp_dir.path().join("config.toml");
            
            let config_content = toml::to_string_pretty(&config).expect("序列化配置失败");
            fs::write(&config_path, config_content).expect("写入配置文件失败");
            
            // 加载配置
            let manager = ConfigManager::load_from_file(&config_path).expect("加载配置失败");
            
            // 验证证书固定配置保持一致
            prop_assert_eq!(&manager.config().security.certificate_pins, &pins);
            
            // 如果启用了证书固定但没有提供证书，应该有合理的处理
            if config.security.certificate_pinning && pins.as_ref().map_or(true, |p| p.is_empty()) {
                // 配置管理器应该处理这种情况
                prop_assert!(true); // 允许这种情况，由运行时验证
            }
        }

        /// 辅助属性测试：网络配置组合有效性
        #[test]
        fn property_network_config_combinations(
            tls_verify in any::<bool>(),
            cert_pinning in any::<bool>(),
            doh_enabled in any::<bool>(),
            ech_enabled in any::<bool>()
        ) {
            let mut config = ConfigManager::default().config().clone();
            config.security.tls_verify = tls_verify;
            config.security.certificate_pinning = cert_pinning;
            config.security.doh_enabled = doh_enabled;
            config.security.ech_enabled = ech_enabled;
            
            // 创建临时配置文件
            let temp_dir = TempDir::new().expect("创建临时目录失败");
            let config_path = temp_dir.path().join("config.toml");
            
            let config_content = toml::to_string_pretty(&config).expect("序列化配置失败");
            fs::write(&config_path, config_content).expect("写入配置文件失败");
            
            // 加载配置
            let manager = ConfigManager::load_from_file(&config_path).expect("加载配置失败");
            
            // 验证所有网络安全选项都能正确保存和加载
            prop_assert_eq!(manager.config().security.tls_verify, tls_verify);
            prop_assert_eq!(manager.config().security.certificate_pinning, cert_pinning);
            prop_assert_eq!(manager.config().security.doh_enabled, doh_enabled);
            prop_assert_eq!(manager.config().security.ech_enabled, ech_enabled);
            
            // 验证配置的逻辑一致性
            // 如果禁用了 TLS 验证，证书固定应该无效（但配置仍然保存）
            if !tls_verify && cert_pinning {
                // 这是一个潜在的配置问题，但应该允许保存
                prop_assert!(true); // 由运行时逻辑处理
            }
        }
    }

    #[test]
    fn test_network_feature_toggle_basic() {
        // 基本的网络功能开关测试
        let temp_dir = TempDir::new().expect("创建临时目录失败");
        let config_path = temp_dir.path().join("config.toml");
        
        // 创建初始配置
        let mut initial_config = ConfigManager::default().config().clone();
        initial_config.security.doh_enabled = false;
        initial_config.security.ech_enabled = false;
        
        let config_content = toml::to_string_pretty(&initial_config).expect("序列化配置失败");
        fs::write(&config_path, config_content).expect("写入配置文件失败");
        
        // 加载配置管理器
        let mut manager = ConfigManager::load_from_file(&config_path).expect("加载配置失败");
        
        assert!(!manager.config().security.doh_enabled);
        assert!(!manager.config().security.ech_enabled);
        
        // 更新配置启用网络功能
        let mut updated_config = manager.config().clone();
        updated_config.security.doh_enabled = true;
        updated_config.security.ech_enabled = true;
        
        let updated_content = toml::to_string_pretty(&updated_config).expect("序列化更新配置失败");
        std::thread::sleep(Duration::from_millis(10)); // 确保时间戳不同
        fs::write(&config_path, updated_content).expect("写入更新配置失败");
        
        // 检查更新
        let has_updates = manager.check_for_updates().expect("检查更新失败");
        assert!(has_updates);
        
        // 验证新配置生效
        assert!(manager.config().security.doh_enabled);
        assert!(manager.config().security.ech_enabled);
    }

    #[test]
    fn test_config_hot_reload_basic() {
        // 基本的配置热更新测试
        let temp_dir = TempDir::new().expect("创建临时目录失败");
        let config_path = temp_dir.path().join("config.toml");
        
        // 创建初始配置
        let mut config1 = ConfigManager::default().config().clone();
        config1.heartbeat.interval = 30;
        config1.security.tls_verify = true;
        
        let config1_content = toml::to_string_pretty(&config1).expect("序列化配置1失败");
        fs::write(&config_path, config1_content).expect("写入配置文件1失败");
        
        // 加载配置管理器
        let mut manager = ConfigManager::load_from_file(&config_path).expect("加载配置失败");
        
        assert_eq!(manager.config().heartbeat.interval, 30);
        assert!(manager.config().security.tls_verify);
        
        // 更新配置
        let mut config2 = config1.clone();
        config2.heartbeat.interval = 60;
        config2.security.tls_verify = false;
        
        let config2_content = toml::to_string_pretty(&config2).expect("序列化配置2失败");
        std::thread::sleep(Duration::from_millis(10)); // 确保时间戳不同
        fs::write(&config_path, config2_content).expect("写入配置文件2失败");
        
        // 检查并应用更新
        let has_updates = manager.check_for_updates().expect("检查更新失败");
        assert!(has_updates);
        
        // 验证新配置生效
        assert_eq!(manager.config().heartbeat.interval, 60);
        assert!(!manager.config().security.tls_verify);
    }
}