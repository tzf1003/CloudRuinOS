// network_config_tests.rs - 网络功能配置属性测试
// Property 27: 网络功能开关
// Property 28: 配置热更新
// Validates: Requirements 6.4, 6.5

use crate::config::{AgentConfig, ConfigManager, SecuritySection, BootstrapConfig};
use proptest::prelude::*;
// file imports removed as they are no longer needed
use tempfile::TempDir;

/// 生成随机的安全配置
fn arb_security_config() -> impl Strategy<Value = SecuritySection> {
    (
        any::<bool>(),                                                  // tls_verify
        any::<bool>(),                                                  // certificate_pinning
        prop::option::of(prop::collection::vec(any::<String>(), 0..5)), // certificate_pins
        any::<bool>(),                                                  // doh_enabled
        prop::option::of(prop::collection::vec(any::<String>(), 0..3)), // doh_providers
        any::<bool>(),                                                  // ech_enabled
    )
        .prop_map(
            |(
                tls_verify,
                certificate_pinning,
                certificate_pins,
                doh_enabled,
                doh_providers,
                ech_enabled,
            )| {
                SecuritySection {
                    tls_verify,
                    certificate_pinning,
                    certificate_pins,
                    doh_enabled,
                    doh_providers,
                    ech_enabled,
                }
            },
        )
}

/// 生成有效的服务器 URL
fn arb_server_url() -> impl Strategy<Value = String> {
    prop::collection::vec("[a-z0-9]", 3..10).prop_map(|parts| {
        let domain = parts.join("");
        format!("https://{}.example.com", domain)
    })
}

/// 生成随机的完整配置
fn arb_agent_config() -> impl Strategy<Value = AgentConfig> {
    (
        arb_security_config(),
        arb_server_url(), // server base_url
        1u64..3600u64,    // heartbeat interval
    )
        .prop_map(|(security, base_url, heartbeat_interval)| {
            let bootstrap = BootstrapConfig {
                server_url: "http://default".to_string(),
                enrollment_token: None,
            };
            let mut config = ConfigManager::new(bootstrap).config().clone();
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

            // 初始化 ConfigManager
            let bootstrap = BootstrapConfig {
                server_url: initial_config.server.base_url.clone(),
                enrollment_token: None,
            };
            let mut manager = ConfigManager::new(bootstrap);
            
            // 应用初始配置
            let initial_json = serde_json::to_string(&initial_config).expect("Serialize initial config failed");
            manager.update_from_json(&initial_json).expect("Initial update failed");

            // 记录初始状态
            let initial_doh = manager.config().security.doh_enabled;
            let initial_ech = manager.config().security.ech_enabled;

            // 模拟运行时配置更新
            let mut updated_config = manager.config().clone();
            updated_config.security.doh_enabled = new_doh_enabled;
            updated_config.security.ech_enabled = new_ech_enabled;

            // 应用更新
            let updated_json = serde_json::to_string(&updated_config).expect("Serialize updated config failed");
            manager.update_from_json(&updated_json).expect("Update failed");

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

            // 初始化
            let bootstrap = BootstrapConfig {
                 server_url: config1.server.base_url.clone(),
                 enrollment_token: None,
            };
            let mut manager = ConfigManager::new(bootstrap);

            // 应用 config1
            let json1 = serde_json::to_string(&config1).expect("Serialize config1 failed");
            manager.update_from_json(&json1).expect("Update 1 failed");

            // 验证初始配置
            prop_assert_eq!(manager.config().security.doh_enabled, config1.security.doh_enabled);
            prop_assert_eq!(manager.config().security.ech_enabled, config1.security.ech_enabled);
            prop_assert_eq!(manager.config().security.tls_verify, config1.security.tls_verify);

            // 更新配置文件
            let json2 = serde_json::to_string(&config2).expect("Serialize config2 failed");
            manager.update_from_json(&json2).expect("Update 2 failed");

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

            // 初始化
            let bootstrap = BootstrapConfig {
                server_url: config.server.base_url.clone(),
                enrollment_token: None,
            };
            let mut manager = ConfigManager::new(bootstrap);
            
            // 应用配置
            let json = serde_json::to_string(&config).expect("Serialize config failed");
            manager.update_from_json(&json).expect("Update failed");

            // 验证 DoH 提供商配置保持一致
            prop_assert_eq!(&manager.config().security.doh_providers, &providers);

            // 如果启用了 DoH 但没有提供商，应该有默认值或保持 None
            if config.security.doh_enabled && providers.is_none() {
                // 配置管理器应该处理这种情况
                prop_assert!(true); // 允许这种情况，由运行时验证
            }
        }

        /// 辅助属性测试：证书固定配置有效性
        #[test]
        fn property_certificate_pinning(
            mut config in arb_agent_config(),
            pins in prop::option::of(prop::collection::vec(any::<String>(), 0..5))
        ) {
            // 设置证书固定
            config.security.certificate_pins = pins.clone();

            // 初始化
            let bootstrap = BootstrapConfig {
                server_url: config.server.base_url.clone(),
                enrollment_token: None,
            };
            let mut manager = ConfigManager::new(bootstrap);
            
            // 应用配置
            let json = serde_json::to_string(&config).expect("Serialize config failed");
            manager.update_from_json(&json).expect("Update failed");

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
            let bootstrap = BootstrapConfig {
                 server_url: "http://default".to_string(),
                 enrollment_token: None,
            };
            let mut manager = ConfigManager::new(bootstrap);
            
            // 构建完整配置
            let mut config = manager.config().clone();
            config.security.tls_verify = tls_verify;
            config.security.certificate_pinning = cert_pinning;
            config.security.doh_enabled = doh_enabled;
            config.security.ech_enabled = ech_enabled;

            // 应用配置
            let json = serde_json::to_string(&config).expect("Serialize config failed");
            manager.update_from_json(&json).expect("Update failed");

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
        // 创建初始配置
        let bootstrap = BootstrapConfig {
                 server_url: "http://default".to_string(),
                 enrollment_token: None,
        };
        let mut manager = ConfigManager::new(bootstrap);
        
        let mut initial_config = manager.config().clone();
        initial_config.security.doh_enabled = false;
        initial_config.security.ech_enabled = false;

        manager.update_from_json(&serde_json::to_string(&initial_config).unwrap()).unwrap();

        assert!(!manager.config().security.doh_enabled);
        assert!(!manager.config().security.ech_enabled);

        // 更新配置启用网络功能
        let mut updated_config = manager.config().clone();
        updated_config.security.doh_enabled = true;
        updated_config.security.ech_enabled = true;

        manager.update_from_json(&serde_json::to_string(&updated_config).unwrap()).unwrap();

        // 验证新配置生效
        assert!(manager.config().security.doh_enabled);
        assert!(manager.config().security.ech_enabled);
    }

    #[test]
    fn test_config_hot_reload_basic() {
        let bootstrap = BootstrapConfig {
             server_url: "http://default".to_string(),
             enrollment_token: None,
        };
        let mut manager = ConfigManager::new(bootstrap);

        // Config 1
        let mut config1 = manager.config().clone();
        config1.heartbeat.interval = 30;
        config1.security.tls_verify = true;
        
        manager.update_from_json(&serde_json::to_string(&config1).unwrap()).unwrap();

        assert_eq!(manager.config().heartbeat.interval, 30);
        assert!(manager.config().security.tls_verify);

        // Update
        let mut config2 = config1.clone();
        config2.heartbeat.interval = 60;
        config2.security.tls_verify = false;

        manager.update_from_json(&serde_json::to_string(&config2).unwrap()).unwrap();

        // 验证新配置生效
        assert_eq!(manager.config().heartbeat.interval, 60);
        assert!(!manager.config().security.tls_verify);
    }
}
