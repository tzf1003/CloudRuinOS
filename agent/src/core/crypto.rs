use anyhow::{anyhow, Result};
use base64::Engine;
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

/// Ed25519 密钥对管理
#[derive(Debug, Clone)]
pub struct CryptoManager {
    signing_key: SigningKey,
    verifying_key: VerifyingKey,
    device_id: Option<String>,
}

/// 设备凭证
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceCredentials {
    pub device_id: String,
    pub private_key: String, // Base64 编码
    pub public_key: String,  // Base64 编码
}

impl CryptoManager {
    /// 生成新的密钥对
    pub fn generate() -> Result<Self> {
        let mut csprng = OsRng {};
        let signing_key = SigningKey::generate(&mut csprng);
        let verifying_key = signing_key.verifying_key();

        Ok(Self {
            signing_key,
            verifying_key,
            device_id: None,
        })
    }

    /// 从私钥加载密钥对
    pub fn from_private_key(private_key_bytes: &[u8]) -> Result<Self> {
        if private_key_bytes.len() != 32 {
            return Err(anyhow!("Invalid private key length"));
        }

        let mut key_bytes = [0u8; 32];
        key_bytes.copy_from_slice(private_key_bytes);

        let signing_key = SigningKey::from_bytes(&key_bytes);
        let verifying_key = signing_key.verifying_key();

        Ok(Self {
            signing_key,
            verifying_key,
            device_id: None,
        })
    }

    /// 从凭证文件加载
    pub fn from_credentials_file<P: AsRef<Path>>(path: P) -> Result<Self> {
        let content = fs::read_to_string(path)?;
        let credentials: DeviceCredentials = serde_json::from_str(&content)?;

        let private_key_bytes =
            base64::engine::general_purpose::STANDARD.decode(&credentials.private_key)?;
        let mut manager = Self::from_private_key(&private_key_bytes)?;
        manager.device_id = Some(credentials.device_id);

        Ok(manager)
    }

    /// 保存凭证到文件
    pub fn save_credentials<P: AsRef<Path>>(&self, path: P, device_id: String) -> Result<()> {
        let credentials = DeviceCredentials {
            device_id: device_id.clone(),
            private_key: base64::engine::general_purpose::STANDARD
                .encode(self.signing_key.to_bytes()),
            public_key: base64::engine::general_purpose::STANDARD
                .encode(self.verifying_key.to_bytes()),
        };

        let content = serde_json::to_string_pretty(&credentials)?;
        fs::write(path, content)?;

        Ok(())
    }

    /// 获取公钥（Base64 编码）
    pub fn public_key_base64(&self) -> String {
        base64::engine::general_purpose::STANDARD.encode(self.verifying_key.to_bytes())
    }

    /// 获取私钥（Base64 编码）
    pub fn private_key_base64(&self) -> String {
        base64::engine::general_purpose::STANDARD.encode(self.signing_key.to_bytes())
    }

    /// 签名数据
    pub fn sign(&self, data: &[u8]) -> String {
        let signature = self.signing_key.sign(data);
        base64::engine::general_purpose::STANDARD.encode(signature.to_bytes())
    }

    /// 验证签名
    pub fn verify(&self, data: &[u8], signature_base64: &str) -> Result<bool> {
        let signature_bytes = base64::engine::general_purpose::STANDARD.decode(signature_base64)?;

        if signature_bytes.len() != 64 {
            return Ok(false);
        }

        let mut sig_array = [0u8; 64];
        sig_array.copy_from_slice(&signature_bytes);
        let signature = Signature::from_bytes(&sig_array);

        match self.verifying_key.verify(data, &signature) {
            Ok(_) => Ok(true),
            Err(_) => Ok(false),
        }
    }

    /// 生成随机 nonce
    pub fn generate_nonce() -> String {
        use rand::Rng;
        let mut rng = OsRng {};
        let nonce: [u8; 16] = rng.gen();
        base64::engine::general_purpose::STANDARD.encode(nonce)
    }

    /// 设置设备 ID
    pub fn set_device_id(&mut self, device_id: String) {
        self.device_id = Some(device_id);
    }

    /// 获取设备 ID
    pub fn device_id(&self) -> Option<&str> {
        self.device_id.as_deref()
    }
}

/// 签名数据结构
#[derive(Debug, Serialize)]
pub struct SignableData {
    pub device_id: String,
    pub timestamp: u64,
    pub nonce: String,
    pub data: serde_json::Value,
}

impl SignableData {
    pub fn to_bytes(&self) -> Result<Vec<u8>> {
        let json = serde_json::to_string(self)?;
        Ok(json.into_bytes())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

    #[test]
    fn test_generate_keypair() {
        let manager = CryptoManager::generate().unwrap();
        assert!(!manager.public_key_base64().is_empty());
        assert!(!manager.private_key_base64().is_empty());
    }

    #[test]
    fn test_sign_and_verify() {
        let manager = CryptoManager::generate().unwrap();
        let data = b"test message";

        let signature = manager.sign(data);
        assert!(manager.verify(data, &signature).unwrap());

        // 验证错误的签名
        assert!(!manager.verify(b"wrong data", &signature).unwrap());
    }

    #[test]
    fn test_save_and_load_credentials() {
        let manager = CryptoManager::generate().unwrap();
        let device_id = "test-device-123".to_string();

        let temp_file = NamedTempFile::new().unwrap();
        manager
            .save_credentials(temp_file.path(), device_id.clone())
            .unwrap();

        let loaded_manager = CryptoManager::from_credentials_file(temp_file.path()).unwrap();
        assert_eq!(loaded_manager.device_id(), Some(device_id.as_str()));
        assert_eq!(
            loaded_manager.public_key_base64(),
            manager.public_key_base64()
        );
    }

    #[test]
    fn test_generate_nonce() {
        let nonce1 = CryptoManager::generate_nonce();
        let nonce2 = CryptoManager::generate_nonce();

        assert_ne!(nonce1, nonce2);
        assert!(!nonce1.is_empty());
        assert!(!nonce2.is_empty());
    }
}
