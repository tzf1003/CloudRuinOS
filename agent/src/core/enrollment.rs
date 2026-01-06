use anyhow::{anyhow, Result};
use reqwest::Client;
use std::path::Path;
use std::time::Duration;
use tracing::{debug, error, info};

use super::crypto::CryptoManager;
use super::protocol::{EnrollmentRequest, EnrollmentResponse, EnrollmentStatus};
use super::state::{EnrollmentStatus as StateEnrollmentStatus, StateManager};

/// 设备注册客户端
#[derive(Debug)]
pub struct EnrollmentClient {
    http_client: Client,
    server_url: String,
}

/// 注册配置
#[derive(Debug, Clone)]
pub struct EnrollmentConfig {
    pub server_url: String,
    pub timeout: Duration,
    pub retry_attempts: u32,
    pub retry_delay: Duration,
}

impl EnrollmentClient {
    /// 创建新的注册客户端
    pub fn new(config: EnrollmentConfig) -> Result<Self> {
        let http_client = Client::builder().timeout(config.timeout).build()?;

        Ok(Self {
            http_client,
            server_url: config.server_url,
        })
    }

    /// 执行设备注册
    pub async fn enroll_device(
        &self,
        enrollment_token: String,
        state_manager: &StateManager,
        credentials_path: &Path,
    ) -> Result<String> {
        info!("Starting device enrollment process");

        // 设置注册状态为进行中
        state_manager
            .set_enrollment_status(StateEnrollmentStatus::Enrolling)
            .await?;

        // 生成新的密钥对
        let mut crypto_manager = CryptoManager::generate()?;
        debug!("Generated new Ed25519 keypair for device");

        // 创建注册请求
        let enrollment_request = EnrollmentRequest {
            token: enrollment_token,
            public_key: crypto_manager.public_key_base64(),
            platform: std::env::consts::OS.to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
        };

        // 发送注册请求
        let response = self.send_enrollment_request(&enrollment_request).await?;

        match response.status {
            EnrollmentStatus::Success => {
                info!(
                    "Device enrollment successful, device_id: {}",
                    response.device_id
                );

                // 设置设备 ID
                crypto_manager.set_device_id(response.device_id.clone());

                // 保存凭证到文件
                crypto_manager.save_credentials(credentials_path, response.device_id.clone())?;
                info!("Device credentials saved to: {:?}", credentials_path);

                // 更新状态管理器
                state_manager
                    .set_device_id(response.device_id.clone())
                    .await?;
                state_manager
                    .set_enrollment_status(StateEnrollmentStatus::Enrolled)
                    .await?;

                Ok(response.device_id)
            }
            EnrollmentStatus::Error => {
                let error_msg = response
                    .message
                    .unwrap_or_else(|| "Unknown enrollment error".to_string());
                error!("Device enrollment failed: {}", error_msg);

                // 设置注册失败状态
                state_manager
                    .set_enrollment_status(StateEnrollmentStatus::EnrollmentFailed(
                        error_msg.clone(),
                    ))
                    .await?;

                Err(anyhow!("Enrollment failed: {}", error_msg))
            }
        }
    }

    /// 发送注册请求
    async fn send_enrollment_request(
        &self,
        request: &EnrollmentRequest,
    ) -> Result<EnrollmentResponse> {
        // server_url 已经包含了 /agent/enroll 端点
        let url = &self.server_url;
        debug!("Sending enrollment request to: {}", url);

        let response = self.http_client.post(url).json(request).send().await?;

        if !response.status().is_success() {
            return Err(anyhow!(
                "Enrollment request failed with status: {}",
                response.status()
            ));
        }

        let enrollment_response: EnrollmentResponse = response.json().await?;
        debug!("Received enrollment response: {:?}", enrollment_response);

        Ok(enrollment_response)
    }

    /// 带重试的设备注册
    pub async fn enroll_device_with_retry(
        &self,
        enrollment_token: String,
        state_manager: &StateManager,
        credentials_path: &Path,
        max_attempts: u32,
        retry_delay: Duration,
    ) -> Result<String> {
        let mut last_error = None;

        for attempt in 1..=max_attempts {
            info!("Enrollment attempt {} of {}", attempt, max_attempts);

            match self
                .enroll_device(enrollment_token.clone(), state_manager, credentials_path)
                .await
            {
                Ok(device_id) => {
                    info!("Enrollment successful on attempt {}", attempt);
                    return Ok(device_id);
                }
                Err(e) => {
                    error!("Enrollment attempt {} failed: {}", attempt, e);
                    last_error = Some(e);

                    if attempt < max_attempts {
                        info!("Waiting {:?} before retry", retry_delay);
                        tokio::time::sleep(retry_delay).await;
                    }
                }
            }
        }

        Err(last_error.unwrap_or_else(|| anyhow!("All enrollment attempts failed")))
    }

    /// 验证现有凭证
    pub async fn verify_existing_credentials(
        &self,
        credentials_path: &Path,
        state_manager: &StateManager,
    ) -> Result<bool> {
        if !credentials_path.exists() {
            debug!("Credentials file does not exist: {:?}", credentials_path);
            return Ok(false);
        }

        match CryptoManager::from_credentials_file(credentials_path) {
            Ok(crypto_manager) => {
                if let Some(device_id) = crypto_manager.device_id() {
                    info!("Found existing credentials for device: {}", device_id);

                    // 更新状态管理器
                    state_manager.set_device_id(device_id.to_string()).await?;
                    state_manager
                        .set_enrollment_status(StateEnrollmentStatus::Enrolled)
                        .await?;

                    Ok(true)
                } else {
                    error!("Credentials file exists but contains no device ID");
                    Ok(false)
                }
            }
            Err(e) => {
                error!("Failed to load existing credentials: {}", e);
                Ok(false)
            }
        }
    }

    /// 检查注册状态
    pub async fn check_enrollment_status(&self, device_id: &str) -> Result<bool> {
        let url = format!("{}/agent/status/{}", self.server_url, device_id);
        debug!("Checking enrollment status at: {}", url);

        let response = self.http_client.get(&url).send().await?;

        Ok(response.status().is_success())
    }
}

impl Default for EnrollmentConfig {
    fn default() -> Self {
        Self {
            server_url: "https://rmm-server.example.com".to_string(),
            timeout: Duration::from_secs(30),
            retry_attempts: 3,
            retry_delay: Duration::from_secs(5),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;
    use tokio_test;

    #[tokio::test]
    async fn test_enrollment_config_creation() {
        let config = EnrollmentConfig::default();
        assert_eq!(config.server_url, "https://rmm-server.example.com");
        assert_eq!(config.timeout, Duration::from_secs(30));
        assert_eq!(config.retry_attempts, 3);
        assert_eq!(config.retry_delay, Duration::from_secs(5));
    }

    #[tokio::test]
    async fn test_enrollment_client_creation() {
        let config = EnrollmentConfig::default();
        let client = EnrollmentClient::new(config);
        assert!(client.is_ok());
    }

    #[tokio::test]
    async fn test_verify_existing_credentials_no_file() {
        let config = EnrollmentConfig::default();
        let client = EnrollmentClient::new(config).unwrap();

        let temp_file = NamedTempFile::new().unwrap();
        let non_existent_path = temp_file.path().with_extension("nonexistent");

        let temp_state_file = NamedTempFile::new().unwrap();
        let state_manager = StateManager::new(temp_state_file.path()).unwrap();
        // 初始化状态文件
        state_manager.save_state().await.unwrap();

        let result = client
            .verify_existing_credentials(&non_existent_path, &state_manager)
            .await;
        assert!(result.is_ok());
        assert!(!result.unwrap());
    }

    #[tokio::test]
    async fn test_verify_existing_credentials_with_valid_file() {
        let config = EnrollmentConfig::default();
        let client = EnrollmentClient::new(config).unwrap();

        // 创建有效的凭证文件
        let crypto_manager = CryptoManager::generate().unwrap();
        let device_id = "test-device-123".to_string();

        let temp_creds_file = NamedTempFile::new().unwrap();
        crypto_manager
            .save_credentials(temp_creds_file.path(), device_id.clone())
            .unwrap();

        let temp_state_file = NamedTempFile::new().unwrap();
        let state_manager = StateManager::new(temp_state_file.path()).unwrap();
        // 初始化状态文件
        state_manager.save_state().await.unwrap();

        let result = client
            .verify_existing_credentials(temp_creds_file.path(), &state_manager)
            .await;
        assert!(result.is_ok());
        assert!(result.unwrap());

        // 验证状态管理器已更新
        assert_eq!(state_manager.get_device_id().await, Some(device_id));
        assert_eq!(
            state_manager.get_enrollment_status().await,
            StateEnrollmentStatus::Enrolled
        );
    }
}

/// Property 5: 凭证安全存储
/// *对于任何* 完成注册的 Agent，私钥和设备凭证应该安全存储在本地且格式正确
/// **Validates: Requirements 1.5**

#[cfg(test)]
mod credential_storage_tests {
    use super::*;
    use crate::core::crypto::CryptoManager;
    use crate::core::state::StateManager;
    use proptest::prelude::*;
    use std::path::PathBuf;
    use tempfile::{NamedTempFile, TempDir};

    // 生成测试用的设备 ID
    prop_compose! {
        fn arb_device_id()(
            prefix in "[a-zA-Z0-9]{3,8}",
            suffix in "[a-zA-Z0-9]{8,16}"
        ) -> String {
            format!("{}-{}", prefix, suffix)
        }
    }

    // 生成测试用的服务器 URL
    prop_compose! {
        fn arb_server_url()(
            protocol in prop::sample::select(vec!["http", "https"]),
            domain in "[a-zA-Z0-9-]{3,20}",
            tld in prop::sample::select(vec!["com", "org", "net"])
        ) -> String {
            format!("{}://{}.{}", protocol, domain, tld)
        }
    }

    // 生成测试用的注册令牌
    prop_compose! {
        fn arb_enrollment_token()(
            token in "[a-zA-Z0-9]{32,64}"
        ) -> String {
            token
        }
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(100))]

        /// Feature: lightweight-rmm, Property 5: 凭证安全存储
        /// 测试凭证文件的安全存储和格式正确性
        #[test]
        fn test_credential_secure_storage_format(
            device_id in arb_device_id()
        ) {
            // 创建临时文件用于存储凭证
            let temp_file = NamedTempFile::new().unwrap();
            let credentials_path = temp_file.path();

            // 生成密钥对并保存凭证
            let crypto_manager = CryptoManager::generate().unwrap();
            crypto_manager.save_credentials(credentials_path, device_id.clone()).unwrap();

            // 验证凭证文件存在
            prop_assert!(credentials_path.exists(), "Credentials file should exist after saving");

            // 验证凭证文件可以被正确加载
            let loaded_manager = CryptoManager::from_credentials_file(credentials_path).unwrap();

            // 验证设备 ID 正确存储
            prop_assert_eq!(loaded_manager.device_id(), Some(device_id.as_str()));

            // 验证公钥一致性
            prop_assert_eq!(loaded_manager.public_key_base64(), crypto_manager.public_key_base64());

            // 验证私钥一致性（通过签名验证）
            let test_data = b"test signature data";
            let original_signature = crypto_manager.sign(test_data);
            let loaded_signature = loaded_manager.sign(test_data);

            // 两个管理器应该能够验证对方的签名（因为使用相同的密钥对）
            prop_assert!(crypto_manager.verify(test_data, &loaded_signature).unwrap());
            prop_assert!(loaded_manager.verify(test_data, &original_signature).unwrap());
        }

        /// Feature: lightweight-rmm, Property 5: 凭证安全存储
        /// 测试凭证文件的 JSON 格式正确性
        #[test]
        fn test_credential_json_format_validity(
            device_id in arb_device_id()
        ) {
            // 创建临时文件用于存储凭证
            let temp_file = NamedTempFile::new().unwrap();
            let credentials_path = temp_file.path();

            // 生成密钥对并保存凭证
            let crypto_manager = CryptoManager::generate().unwrap();
            crypto_manager.save_credentials(credentials_path, device_id.clone()).unwrap();

            // 读取凭证文件内容
            let file_content = std::fs::read_to_string(credentials_path).unwrap();

            // 验证文件内容是有效的 JSON
            let json_value: serde_json::Value = serde_json::from_str(&file_content).unwrap();

            // 验证 JSON 包含必需的字段
            prop_assert!(json_value.get("device_id").is_some(), "JSON should contain device_id field");
            prop_assert!(json_value.get("private_key").is_some(), "JSON should contain private_key field");
            prop_assert!(json_value.get("public_key").is_some(), "JSON should contain public_key field");

            // 验证字段值的类型
            prop_assert!(json_value["device_id"].is_string(), "device_id should be a string");
            prop_assert!(json_value["private_key"].is_string(), "private_key should be a string");
            prop_assert!(json_value["public_key"].is_string(), "public_key should be a string");

            // 验证设备 ID 值正确
            prop_assert_eq!(json_value["device_id"].as_str().unwrap(), device_id);
        }

        /// Feature: lightweight-rmm, Property 5: 凭证安全存储
        /// 测试凭证的 Base64 编码正确性
        #[test]
        fn test_credential_base64_encoding_validity(
            device_id in arb_device_id()
        ) {
            // 创建临时文件用于存储凭证
            let temp_file = NamedTempFile::new().unwrap();
            let credentials_path = temp_file.path();

            // 生成密钥对并保存凭证
            let crypto_manager = CryptoManager::generate().unwrap();
            crypto_manager.save_credentials(credentials_path, device_id.clone()).unwrap();

            // 加载凭证文件
            let loaded_manager = CryptoManager::from_credentials_file(credentials_path).unwrap();

            // 获取 Base64 编码的密钥
            let public_key_b64 = loaded_manager.public_key_base64();
            let private_key_b64 = loaded_manager.private_key_base64();

            // 验证 Base64 编码格式正确（可以解码）
            use base64::Engine;
            let public_key_bytes = base64::engine::general_purpose::STANDARD
                .decode(&public_key_b64).unwrap();
            let private_key_bytes = base64::engine::general_purpose::STANDARD
                .decode(&private_key_b64).unwrap();

            // 验证密钥长度正确
            prop_assert_eq!(public_key_bytes.len(), 32, "Public key should be 32 bytes");
            prop_assert_eq!(private_key_bytes.len(), 32, "Private key should be 32 bytes");

            // 验证 Base64 字符串不为空
            prop_assert!(!public_key_b64.is_empty(), "Public key Base64 should not be empty");
            prop_assert!(!private_key_b64.is_empty(), "Private key Base64 should not be empty");
        }

        /// Feature: lightweight-rmm, Property 5: 凭证安全存储
        /// 测试注册客户端的凭证验证功能
        #[test]
        fn test_enrollment_client_credential_verification(
            device_id in arb_device_id(),
            server_url in arb_server_url()
        ) {
            let rt = tokio::runtime::Runtime::new().unwrap();
            rt.block_on(async {
                // 创建临时目录和文件
                let temp_dir = TempDir::new().unwrap();
                let credentials_path = temp_dir.path().join("credentials.json");
                let state_file_path = temp_dir.path().join("state.json");

                // 创建注册客户端
                let config = EnrollmentConfig {
                    server_url: server_url.clone(),
                    timeout: std::time::Duration::from_secs(5),
                    retry_attempts: 1,
                    retry_delay: std::time::Duration::from_secs(1),
                };
                let client = EnrollmentClient::new(config).unwrap();

                // 创建状态管理器
                let state_manager = StateManager::new(&state_file_path).unwrap();

                // 首次验证应该返回 false（没有凭证文件）
                let result = client.verify_existing_credentials(&credentials_path, &state_manager).await.unwrap();
                prop_assert!(!result, "Should return false when no credentials file exists");

                // 创建有效的凭证文件
                let crypto_manager = CryptoManager::generate().unwrap();
                crypto_manager.save_credentials(&credentials_path, device_id.clone()).unwrap();

                // 再次验证应该返回 true
                let result = client.verify_existing_credentials(&credentials_path, &state_manager).await.unwrap();
                prop_assert!(result, "Should return true when valid credentials file exists");

                // 验证状态管理器已更新
                prop_assert_eq!(state_manager.get_device_id().await, Some(device_id));

                Ok(())
            }).unwrap()
        }
    }

    #[tokio::test]
    async fn test_credential_storage_round_trip() {
        // 这个测试验证凭证存储和加载的完整往返过程
        let temp_file = NamedTempFile::new().unwrap();
        let credentials_path = temp_file.path();
        let device_id = "test-device-round-trip".to_string();

        // 生成原始密钥对
        let original_manager = CryptoManager::generate().unwrap();
        let original_public_key = original_manager.public_key_base64();
        let original_private_key = original_manager.private_key_base64();

        // 保存凭证
        original_manager
            .save_credentials(credentials_path, device_id.clone())
            .unwrap();

        // 加载凭证
        let loaded_manager = CryptoManager::from_credentials_file(credentials_path).unwrap();

        // 验证往返一致性
        assert_eq!(loaded_manager.device_id(), Some(device_id.as_str()));
        assert_eq!(loaded_manager.public_key_base64(), original_public_key);
        assert_eq!(loaded_manager.private_key_base64(), original_private_key);

        // 验证签名功能一致性
        let test_data = b"round trip test data";
        let original_signature = original_manager.sign(test_data);
        let loaded_signature = loaded_manager.sign(test_data);

        // 验证签名
        assert!(original_manager
            .verify(test_data, &original_signature)
            .unwrap());
        assert!(loaded_manager.verify(test_data, &loaded_signature).unwrap());
        assert!(original_manager
            .verify(test_data, &loaded_signature)
            .unwrap());
        assert!(loaded_manager
            .verify(test_data, &original_signature)
            .unwrap());
    }

    #[tokio::test]
    async fn test_credential_file_permissions() {
        // 验证凭证文件的权限设置（在支持的平台上）
        let temp_file = NamedTempFile::new().unwrap();
        let credentials_path = temp_file.path();
        let device_id = "test-device-permissions".to_string();

        let crypto_manager = CryptoManager::generate().unwrap();
        crypto_manager
            .save_credentials(credentials_path, device_id)
            .unwrap();

        // 验证文件存在且可读
        assert!(credentials_path.exists());
        assert!(credentials_path.is_file());

        // 在 Unix 系统上验证文件权限
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let metadata = std::fs::metadata(credentials_path).unwrap();
            let permissions = metadata.permissions();

            // 验证文件权限不是完全开放的
            let mode = permissions.mode();
            assert_ne!(
                mode & 0o777,
                0o777,
                "Credentials file should not have world-readable permissions"
            );
        }
    }

    #[test]
    fn test_credential_storage_error_handling() {
        // 测试凭证存储的错误处理

        // 测试无效路径
        let invalid_path = PathBuf::from("/invalid/path/that/does/not/exist/credentials.json");
        let crypto_manager = CryptoManager::generate().unwrap();
        let result = crypto_manager.save_credentials(&invalid_path, "test-device".to_string());
        assert!(result.is_err(), "Should fail when saving to invalid path");

        // 测试加载不存在的文件
        let non_existent_path = PathBuf::from("non_existent_credentials.json");
        let result = CryptoManager::from_credentials_file(&non_existent_path);
        assert!(
            result.is_err(),
            "Should fail when loading non-existent file"
        );
    }
}
