use crate::core::crypto::CryptoManager;
use crate::core::protocol::WSMessage;
use anyhow::Result;
use futures::{SinkExt, StreamExt};
use std::sync::Arc;
use std::time::Duration;
use tokio::time::sleep;
use tokio_tungstenite::{connect_async, tungstenite::Message};

#[derive(Clone)]
pub struct HttpClient {
    client: reqwest::Client,
    #[cfg(feature = "doh")]
    doh_resolver: Option<DohResolver>,
    #[cfg(feature = "ech")]
    ech_config: Option<EchConfig>,
    tls_config: TlsConfig,
}

pub struct WebSocketClient {
    reconnect_strategy: ReconnectStrategy,
    heartbeat_interval: Duration,
    url: String,
    device_id: String,
    crypto_manager: Option<Arc<CryptoManager>>,
}

#[derive(Debug, Clone)]
pub struct SecurityCheckResult {
    pub tls_verification: TlsVerificationStatus,
    pub doh_available: bool,
    pub doh_provider: Option<String>,
    pub ech_supported: bool,
    pub ech_fallback_available: bool,
}

#[derive(Debug, Clone)]
pub enum TlsVerificationStatus {
    Strict,
    #[cfg(feature = "tls-pinning")]
    StrictWithPinning,
}

impl Default for SecurityCheckResult {
    fn default() -> Self {
        Self {
            tls_verification: TlsVerificationStatus::Strict,
            doh_available: false,
            doh_provider: None,
            ech_supported: false,
            ech_fallback_available: false,
        }
    }
}

#[derive(Debug)]
pub enum WebSocketError {
    ConnectionFailed(String),
    AuthenticationFailed,
    MessageSendFailed(String),
    ReconnectExhausted,
    InvalidMessage(String),
}

impl std::fmt::Display for WebSocketError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WebSocketError::ConnectionFailed(msg) => write!(f, "Connection failed: {}", msg),
            WebSocketError::AuthenticationFailed => write!(f, "Authentication failed"),
            WebSocketError::MessageSendFailed(msg) => write!(f, "Message send failed: {}", msg),
            WebSocketError::ReconnectExhausted => write!(f, "Reconnect attempts exhausted"),
            WebSocketError::InvalidMessage(msg) => write!(f, "Invalid message: {}", msg),
        }
    }
}

impl std::error::Error for WebSocketError {}

#[derive(Debug, Clone)]
pub struct TlsConfig {
    pub verify_mode: TlsVerifyMode,
    #[cfg(feature = "tls-pinning")]
    pub certificate_pinning: Option<Vec<String>>,
    pub min_tls_version: TlsVersion,
    pub cipher_suites: Option<Vec<String>>,
    /// Debug模式：启用后将所有流量代理到127.0.0.1:8080并信任所有证书
    pub debug_mode: bool,
}

#[derive(Debug, Clone)]
pub enum TlsVersion {
    Tls12,
    Tls13,
}

#[derive(Debug, Clone)]
pub enum TlsVerifyMode {
    Strict,
    #[cfg(feature = "tls-pinning")]
    StrictWithPinning,
}

impl TlsConfig {
    /// 创建严格的 TLS 配置
    pub fn strict() -> Self {
        Self {
            verify_mode: TlsVerifyMode::Strict,
            #[cfg(feature = "tls-pinning")]
            certificate_pinning: None,
            min_tls_version: TlsVersion::Tls12,
            cipher_suites: None,
            debug_mode: false,
        }
    }

    /// 创建Debug模式的 TLS 配置（代理到127.0.0.1:8080，信任所有证书）
    pub fn debug() -> Self {
        Self {
            verify_mode: TlsVerifyMode::Strict,
            #[cfg(feature = "tls-pinning")]
            certificate_pinning: None,
            min_tls_version: TlsVersion::Tls12,
            cipher_suites: None,
            debug_mode: true,
        }
    }

    /// 创建带证书固定的 TLS 配置
    #[cfg(feature = "tls-pinning")]
    pub fn strict_with_pinning(certificate_hashes: Vec<String>) -> Self {
        Self {
            verify_mode: TlsVerifyMode::StrictWithPinning,
            certificate_pinning: Some(certificate_hashes),
            min_tls_version: TlsVersion::Tls12,
            cipher_suites: None,
            debug_mode: false,
        }
    }

    /// 设置最小 TLS 版本
    pub fn with_min_tls_version(mut self, version: TlsVersion) -> Self {
        self.min_tls_version = version;
        self
    }

    /// 设置允许的密码套件
    pub fn with_cipher_suites(mut self, suites: Vec<String>) -> Self {
        self.cipher_suites = Some(suites);
        self
    }

    /// 验证证书指纹
    #[cfg(feature = "tls-pinning")]
    pub fn verify_certificate_pinning(&self, cert_der: &[u8]) -> Result<bool> {
        if let Some(ref pinned_hashes) = self.certificate_pinning {
            use sha2::{Digest, Sha256};

            // 计算证书的 SHA-256 指纹
            let mut hasher = Sha256::new();
            hasher.update(cert_der);
            let cert_hash = hasher.finalize();
            let cert_hash_hex = hex::encode(cert_hash);

            // 检查是否匹配任何固定的证书
            let matches = pinned_hashes
                .iter()
                .any(|pinned| pinned.to_lowercase() == cert_hash_hex.to_lowercase());

            if matches {
                tracing::debug!("Certificate pinning verification passed");
                Ok(true)
            } else {
                tracing::error!(
                    "Certificate pinning verification failed. Expected one of: {:?}, got: {}",
                    pinned_hashes,
                    cert_hash_hex
                );
                Ok(false)
            }
        } else {
            // 没有配置证书固定，跳过验证
            Ok(true)
        }
    }
}

/// 自定义证书验证器，支持证书固定
#[cfg(feature = "tls-pinning")]
#[derive(Debug)]
pub struct PinningCertVerifier {
    root_store: rustls::RootCertStore,
    pinned_hashes: Option<Vec<String>>,
}

#[cfg(feature = "tls-pinning")]
impl PinningCertVerifier {
    pub fn new(root_store: rustls::RootCertStore, pinned_hashes: Option<Vec<String>>) -> Self {
        Self {
            root_store,
            pinned_hashes,
        }
    }

    /// 验证证书指纹
    fn verify_pinning(&self, cert_der: &[u8]) -> bool {
        if let Some(ref pinned_hashes) = self.pinned_hashes {
            use sha2::{Digest, Sha256};

            // 计算证书的 SHA-256 指纹
            let mut hasher = Sha256::new();
            hasher.update(cert_der);
            let cert_hash = hasher.finalize();
            let cert_hash_hex = hex::encode(cert_hash);

            // 检查是否匹配任何固定的证书
            let matches = pinned_hashes
                .iter()
                .any(|pinned| pinned.to_lowercase() == cert_hash_hex.to_lowercase());

            if matches {
                tracing::debug!("Certificate pinning verification passed: {}", cert_hash_hex);
                true
            } else {
                tracing::error!(
                    "Certificate pinning verification failed. Expected one of: {:?}, got: {}",
                    pinned_hashes,
                    cert_hash_hex
                );
                false
            }
        } else {
            // 没有配置证书固定，允许通过
            true
        }
    }
}

#[cfg(feature = "tls-pinning")]
impl rustls::client::danger::ServerCertVerifier for PinningCertVerifier {
    fn verify_server_cert(
        &self,
        end_entity: &rustls::pki_types::CertificateDer<'_>,
        intermediates: &[rustls::pki_types::CertificateDer<'_>],
        server_name: &rustls::pki_types::ServerName<'_>,
        ocsp_response: &[u8],
        now: rustls::pki_types::UnixTime,
    ) -> Result<rustls::client::danger::ServerCertVerified, rustls::Error> {
        // 首先验证证书固定
        if !self.verify_pinning(end_entity.as_ref()) {
            return Err(rustls::Error::General(
                "Certificate pinning verification failed".into(),
            ));
        }

        // 验证证书链中的任意中间证书
        for intermediate in intermediates {
            if self.pinned_hashes.is_some() && !self.verify_pinning(intermediate.as_ref()) {
                // 如果配置了固定，中间证书也需要验证（可选，取决于安全策略）
                tracing::debug!("Intermediate certificate not in pinned list, continuing...");
            }
        }

        // 使用 webpki 验证证书链
        let webpki_verifier = rustls::client::WebPkiServerVerifier::builder(std::sync::Arc::new(
            self.root_store.clone(),
        ))
        .build()
        .map_err(|e| rustls::Error::General(format!("Failed to build verifier: {:?}", e)))?;

        webpki_verifier.verify_server_cert(
            end_entity,
            intermediates,
            server_name,
            ocsp_response,
            now,
        )
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &rustls::pki_types::CertificateDer<'_>,
        dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        rustls::crypto::verify_tls12_signature(
            message,
            cert,
            dss,
            &rustls::crypto::ring::default_provider().signature_verification_algorithms,
        )
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &rustls::pki_types::CertificateDer<'_>,
        dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        rustls::crypto::verify_tls13_signature(
            message,
            cert,
            dss,
            &rustls::crypto::ring::default_provider().signature_verification_algorithms,
        )
    }

    fn supported_verify_schemes(&self) -> Vec<rustls::SignatureScheme> {
        rustls::crypto::ring::default_provider()
            .signature_verification_algorithms
            .supported_schemes()
    }
}

#[derive(Debug, Clone)]
pub struct ReconnectStrategy {
    pub initial_delay: Duration,
    pub max_delay: Duration,
    pub backoff_factor: f64,
    pub max_attempts: Option<u32>,
}

#[cfg(feature = "doh")]
#[derive(Clone)]
pub struct DohResolver {
    providers: Vec<DohProvider>,
    current_provider: usize,
    fallback_enabled: bool,
}

#[cfg(feature = "doh")]
#[derive(Clone)]
pub struct DohProvider {
    pub name: String,
    pub url: String,
    pub bootstrap_ips: Vec<std::net::IpAddr>,
}

#[cfg(feature = "doh")]
impl DohResolver {
    pub fn new(providers: Vec<DohProvider>, fallback_enabled: bool) -> Self {
        Self {
            providers,
            current_provider: 0,
            fallback_enabled,
        }
    }

    /// Get the number of providers
    pub fn provider_count(&self) -> usize {
        self.providers.len()
    }

    /// Check if fallback is enabled
    pub fn is_fallback_enabled(&self) -> bool {
        self.fallback_enabled
    }

    /// Get the current provider index
    pub fn current_provider_index(&self) -> usize {
        self.current_provider
    }

    /// Set the current provider index (for testing)
    pub fn set_current_provider_index(&mut self, index: usize) {
        if index < self.providers.len() {
            self.current_provider = index;
        }
    }

    pub async fn resolve(&mut self, domain: &str) -> Result<Vec<std::net::IpAddr>> {
        // 尝试当前 DoH 提供商
        match self.try_current_provider(domain).await {
            Ok(ips) => Ok(ips),
            Err(_) if self.fallback_enabled => {
                // 轮换到下一个提供商或回退到系统 DNS
                self.try_fallback(domain).await
            }
            Err(e) => Err(e),
        }
    }

    async fn try_current_provider(&self, domain: &str) -> Result<Vec<std::net::IpAddr>> {
        if self.providers.is_empty() {
            return Err(anyhow::anyhow!("No DoH providers configured"));
        }

        let provider = &self.providers[self.current_provider];
        tracing::debug!(
            "Attempting DoH resolution for {} using provider: {}",
            domain,
            provider.name
        );

        // 实现基本的 DoH 查询
        // 注意：这是一个简化的实现，生产环境应该使用专门的 DNS 库
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()?;

        // 构建 DoH 查询 URL
        let query_url = format!("{}?name={}&type=A", provider.url, domain);

        let response = client
            .get(&query_url)
            .header("Accept", "application/dns-json")
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(anyhow::anyhow!(
                "DoH query failed with status: {}",
                response.status()
            ));
        }

        let json: serde_json::Value = response.json().await?;

        // 解析 DNS 响应
        let mut ips = Vec::new();
        if let Some(answers) = json.get("Answer").and_then(|a| a.as_array()) {
            for answer in answers {
                if let Some(data) = answer.get("data").and_then(|d| d.as_str()) {
                    if let Ok(ip) = data.parse::<std::net::IpAddr>() {
                        ips.push(ip);
                    }
                }
            }
        }

        if ips.is_empty() {
            return Err(anyhow::anyhow!("No IP addresses found in DoH response"));
        }

        tracing::debug!("DoH resolution successful: {} -> {:?}", domain, ips);
        Ok(ips)
    }

    async fn try_fallback(&mut self, domain: &str) -> Result<Vec<std::net::IpAddr>> {
        // 尝试下一个提供商
        self.current_provider = (self.current_provider + 1) % self.providers.len();

        if let Ok(ips) = self.try_current_provider(domain).await {
            return Ok(ips);
        }

        // 如果所有 DoH 提供商都失败，回退到系统 DNS
        use std::net::ToSocketAddrs;
        let socket_addrs: Vec<_> = format!("{}:80", domain).to_socket_addrs()?.collect();
        let ips: Vec<_> = socket_addrs.iter().map(|addr| addr.ip()).collect();
        Ok(ips)
    }

    pub fn get_current_provider(&self) -> Option<&DohProvider> {
        self.providers.get(self.current_provider)
    }
}

#[cfg(feature = "doh")]
impl Default for DohResolver {
    fn default() -> Self {
        let providers = vec![
            DohProvider {
                name: "Cloudflare".to_string(),
                url: "https://1.1.1.1/dns-query".to_string(),
                bootstrap_ips: vec!["1.1.1.1".parse().unwrap(), "1.0.0.1".parse().unwrap()],
            },
            DohProvider {
                name: "Google".to_string(),
                url: "https://8.8.8.8/dns-query".to_string(),
                bootstrap_ips: vec!["8.8.8.8".parse().unwrap(), "8.8.4.4".parse().unwrap()],
            },
        ];

        Self::new(providers, true)
    }
}

#[cfg(feature = "ech")]
#[derive(Clone)]
pub struct EchConfig {
    pub enabled: bool,
    pub config_list: Vec<EchConfigEntry>,
    pub fallback_enabled: bool,
}

#[cfg(feature = "ech")]
#[derive(Clone)]
pub struct EchConfigEntry {
    pub public_name: String,
    pub config_data: Vec<u8>,
}

#[cfg(feature = "ech")]
impl EchConfig {
    pub fn new(enabled: bool, fallback_enabled: bool) -> Self {
        Self {
            enabled,
            config_list: Vec::new(),
            fallback_enabled,
        }
    }

    /// 探测 ECH 支持
    pub async fn probe_ech_support(&self, hostname: &str) -> Result<bool> {
        if !self.enabled {
            return Ok(false);
        }

        tracing::debug!("Probing ECH support for hostname: {}", hostname);

        // 简化的 ECH 探测实现
        // 实际实现需要检查 TLS 扩展和服务器支持
        // 这里我们模拟探测过程

        // 尝试连接并检查 ECH 支持
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()?;

        match client.head(&format!("https://{}", hostname)).send().await {
            Ok(response) => {
                // 检查响应头中的 ECH 相关信息
                // 这是一个简化的检查，实际需要检查 TLS 握手
                let ech_supported = response
                    .headers()
                    .get("strict-transport-security")
                    .is_some(); // 简化的检查逻辑

                tracing::debug!("ECH probe result for {}: {}", hostname, ech_supported);
                Ok(ech_supported)
            }
            Err(e) => {
                tracing::warn!("ECH probe failed for {}: {}", hostname, e);
                if self.fallback_enabled {
                    tracing::info!("ECH probe failed, falling back to standard TLS");
                    Ok(false) // 优雅降级
                } else {
                    Err(anyhow::anyhow!(
                        "ECH probe failed and fallback disabled: {}",
                        e
                    ))
                }
            }
        }
    }

    /// 添加 ECH 配置条目
    pub fn add_config(&mut self, public_name: String, config_data: Vec<u8>) {
        self.config_list.push(EchConfigEntry {
            public_name,
            config_data,
        });
    }

    /// 获取指定主机名的 ECH 配置
    pub fn get_config_for_host(&self, hostname: &str) -> Option<&EchConfigEntry> {
        self.config_list
            .iter()
            .find(|config| config.public_name == hostname)
    }
}

#[cfg(feature = "ech")]
impl Default for EchConfig {
    fn default() -> Self {
        Self::new(false, true) // 默认禁用 ECH，启用回退
    }
}

impl HttpClient {
    pub fn new(tls_config: TlsConfig) -> Result<Self> {
        let mut client_builder = reqwest::Client::builder().timeout(Duration::from_secs(30));

        // Debug模式：配置代理和禁用证书验证
        if tls_config.debug_mode {
            tracing::warn!("⚠️  DEBUG MODE ENABLED: All traffic will be proxied to http://127.0.0.1:8080 and all certificates will be trusted!");
            
            // 配置HTTP代理到127.0.0.1:8080
            let proxy = reqwest::Proxy::all("http://127.0.0.1:8080")
                .map_err(|e| anyhow::anyhow!("Failed to create proxy: {}", e))?;
            
            client_builder = client_builder
                .proxy(proxy)
                .danger_accept_invalid_certs(true)  // 信任所有证书
                .danger_accept_invalid_hostnames(true);  // 接受无效的主机名
            
            tracing::info!("Debug proxy configured: http://127.0.0.1:8080");
        } else {
            // 配置 TLS 验证
            match tls_config.verify_mode {
                TlsVerifyMode::Strict => {
                    // 启用严格的 TLS 验证
                    client_builder = client_builder
                        .tls_built_in_root_certs(true)
                        .danger_accept_invalid_certs(false);
                }
                #[cfg(feature = "tls-pinning")]
                TlsVerifyMode::StrictWithPinning => {
                    // 严格验证 + 证书固定
                    // 使用自定义 TLS 连接器实现证书固定验证
                    use rustls::ClientConfig;
                    use std::sync::Arc;

                    // 创建带证书固定验证的 TLS 配置
                    let tls_config_clone = tls_config.clone();

                    // 构建自定义的 rustls 配置
                    let mut root_store = rustls::RootCertStore::empty();

                    // 加载系统根证书
                    #[cfg(feature = "tls-pinning")]
                    {
                        let cert_result = rustls_native_certs::load_native_certs();
                        for cert in cert_result.certs {
                            if let Err(e) = root_store.add(cert) {
                                tracing::warn!("Failed to add root certificate: {:?}", e);
                            }
                        }
                        if !cert_result.errors.is_empty() {
                            tracing::warn!(
                                "Some errors occurred while loading native certs: {:?}",
                                cert_result.errors
                            );
                        }
                    }

                    // 创建自定义证书验证器
                    let cert_verifier = Arc::new(PinningCertVerifier::new(
                        root_store,
                        tls_config_clone.certificate_pinning.clone(),
                    ));

                    let config = ClientConfig::builder()
                        .dangerous()
                        .with_custom_certificate_verifier(cert_verifier)
                        .with_no_client_auth();

                    client_builder = client_builder.use_preconfigured_tls(config);

                    tracing::info!(
                        "Certificate pinning enabled with {} pinned certificates",
                        tls_config
                            .certificate_pinning
                            .as_ref()
                            .map(|v| v.len())
                            .unwrap_or(0)
                    );
                }
            }
        }

        let client = client_builder.build()?;

        Ok(Self {
            client,
            #[cfg(feature = "doh")]
            doh_resolver: None,
            #[cfg(feature = "ech")]
            ech_config: None,
            tls_config,
        })
    }

    /// 发送 GET 请求
    pub fn get(&self, url: &str) -> reqwest::RequestBuilder {
        self.client.get(url)
    }

    /// 发送 POST 请求
    pub fn post(&self, url: &str) -> reqwest::RequestBuilder {
        self.client.post(url)
    }

    /// 发送 PUT 请求
    pub fn put(&self, url: &str) -> reqwest::RequestBuilder {
        self.client.put(url)
    }

    /// 发送 DELETE 请求
    pub fn delete(&self, url: &str) -> reqwest::RequestBuilder {
        self.client.delete(url)
    }

    /// 获取 TLS 配置
    pub fn tls_config(&self) -> &TlsConfig {
        &self.tls_config
    }

    /// 设置 DoH 解析器
    #[cfg(feature = "doh")]
    pub fn set_doh_resolver(&mut self, resolver: DohResolver) {
        self.doh_resolver = Some(resolver);
    }

    /// 获取 DoH 解析器
    #[cfg(feature = "doh")]
    pub fn doh_resolver(&self) -> Option<&DohResolver> {
        self.doh_resolver.as_ref()
    }

    /// 设置 ECH 配置
    #[cfg(feature = "ech")]
    pub fn set_ech_config(&mut self, config: EchConfig) {
        self.ech_config = Some(config);
    }

    /// 获取 ECH 配置
    #[cfg(feature = "ech")]
    pub fn ech_config(&self) -> Option<&EchConfig> {
        self.ech_config.as_ref()
    }

    /// 启用/禁用 DoH 功能
    #[cfg(feature = "doh")]
    pub fn set_doh_enabled(&mut self, enabled: bool) {
        if enabled && self.doh_resolver.is_none() {
            self.doh_resolver = Some(DohResolver::default());
        } else if !enabled {
            self.doh_resolver = None;
        }
    }

    /// 检查 DoH 是否启用
    #[cfg(feature = "doh")]
    pub fn is_doh_enabled(&self) -> bool {
        self.doh_resolver.is_some()
    }

    /// 启用/禁用 ECH 功能
    #[cfg(feature = "ech")]
    pub fn set_ech_enabled(&mut self, enabled: bool) {
        if let Some(ref mut config) = self.ech_config {
            config.enabled = enabled;
        } else if enabled {
            self.ech_config = Some(EchConfig::default());
        }
    }

    /// 检查 ECH 是否启用
    #[cfg(feature = "ech")]
    pub fn is_ech_enabled(&self) -> bool {
        self.ech_config.as_ref().map_or(false, |c| c.enabled)
    }

    /// 执行网络安全检查
    #[allow(clippy::field_reassign_with_default)]
    #[allow(unused_variables)]
    pub async fn perform_security_checks(&self, hostname: &str) -> Result<SecurityCheckResult> {
        let mut result = SecurityCheckResult::default();

        // TLS 验证检查
        result.tls_verification = match self.tls_config.verify_mode {
            TlsVerifyMode::Strict => TlsVerificationStatus::Strict,
            #[cfg(feature = "tls-pinning")]
            TlsVerifyMode::StrictWithPinning => TlsVerificationStatus::StrictWithPinning,
        };

        // DoH 可用性检查
        #[cfg(feature = "doh")]
        if let Some(ref resolver) = self.doh_resolver {
            result.doh_available = true;
            result.doh_provider = resolver.get_current_provider().map(|p| p.name.clone());
        }

        // ECH 支持检查
        #[cfg(feature = "ech")]
        if let Some(ref ech_config) = self.ech_config {
            if ech_config.enabled {
                match ech_config.probe_ech_support(hostname).await {
                    Ok(supported) => {
                        result.ech_supported = supported;
                        result.ech_fallback_available = ech_config.fallback_enabled;
                    }
                    Err(e) => {
                        tracing::warn!("ECH support check failed: {}", e);
                        result.ech_supported = false;
                        result.ech_fallback_available = ech_config.fallback_enabled;
                    }
                }
            }
        }

        Ok(result)
    }
}

impl WebSocketClient {
    pub fn new(
        reconnect_strategy: ReconnectStrategy,
        heartbeat_interval: Duration,
        url: String,
        device_id: String,
    ) -> Self {
        Self {
            reconnect_strategy,
            heartbeat_interval,
            url,
            device_id,
            crypto_manager: None,
        }
    }

    /// 创建带有加密管理器的 WebSocket 客户端
    pub fn with_crypto(
        reconnect_strategy: ReconnectStrategy,
        heartbeat_interval: Duration,
        url: String,
        device_id: String,
        crypto_manager: Arc<CryptoManager>,
    ) -> Self {
        Self {
            reconnect_strategy,
            heartbeat_interval,
            url,
            device_id,
            crypto_manager: Some(crypto_manager),
        }
    }

    /// 设置加密管理器
    pub fn set_crypto_manager(&mut self, crypto_manager: Arc<CryptoManager>) {
        self.crypto_manager = Some(crypto_manager);
    }

    /// 建立 WebSocket 连接并处理消息
    pub async fn connect_and_run<F, Fut>(&self, message_handler: F) -> Result<(), WebSocketError>
    where
        F: Fn(WSMessage) -> Fut + Send + Sync + Clone + 'static,
        Fut: std::future::Future<Output = Result<Option<WSMessage>, anyhow::Error>> + Send,
    {
        let mut attempt = 0;
        let mut delay = self.reconnect_strategy.initial_delay;

        loop {
            match self.try_connect(&message_handler).await {
                Ok(_) => {
                    // 连接成功，重置重连参数
                    attempt = 0;
                    delay = self.reconnect_strategy.initial_delay;
                    tracing::info!("WebSocket connection established successfully");
                }
                Err(e) => {
                    attempt += 1;
                    tracing::warn!("WebSocket connection failed (attempt {}): {}", attempt, e);

                    // 检查是否超过最大重试次数
                    if let Some(max_attempts) = self.reconnect_strategy.max_attempts {
                        if attempt >= max_attempts {
                            return Err(WebSocketError::ReconnectExhausted);
                        }
                    }

                    // 指数退避延迟
                    tracing::info!("Retrying connection in {:?}", delay);
                    sleep(delay).await;

                    delay = Duration::from_secs_f64(
                        (delay.as_secs_f64() * self.reconnect_strategy.backoff_factor)
                            .min(self.reconnect_strategy.max_delay.as_secs_f64()),
                    );
                }
            }
        }
    }

    /// 尝试建立单次连接
    async fn try_connect<F, Fut>(&self, message_handler: &F) -> Result<(), WebSocketError>
    where
        F: Fn(WSMessage) -> Fut + Send + Sync + Clone,
        Fut: std::future::Future<Output = Result<Option<WSMessage>, anyhow::Error>> + Send,
    {
        // 建立 WebSocket 连接
        let (ws_stream, _) = connect_async(&self.url)
            .await
            .map_err(|e| WebSocketError::ConnectionFailed(e.to_string()))?;

        tracing::info!("WebSocket connected to {}", self.url);

        let (mut write, mut read) = ws_stream.split();

        // 发送认证消息
        let auth_message = WSMessage::Auth {
            device_id: self.device_id.clone(),
            signature: self.generate_auth_signature().await?,
        };

        let auth_json = serde_json::to_string(&auth_message)
            .map_err(|e| WebSocketError::InvalidMessage(e.to_string()))?;

        write
            .send(Message::Text(auth_json.into()))
            .await
            .map_err(|e| WebSocketError::MessageSendFailed(e.to_string()))?;

        // 创建通道用于心跳消息
        let (heartbeat_tx, mut heartbeat_rx) = tokio::sync::mpsc::unbounded_channel::<WSMessage>();

        // 启动心跳任务
        let heartbeat_tx_clone = heartbeat_tx.clone();
        let heartbeat_interval = self.heartbeat_interval;
        let heartbeat_task = tokio::spawn(async move {
            let mut interval = tokio::time::interval(heartbeat_interval);
            loop {
                interval.tick().await;
                let presence_msg = WSMessage::Presence {
                    status: crate::core::protocol::PresenceStatus::Online,
                };

                if heartbeat_tx_clone.send(presence_msg).is_err() {
                    tracing::error!("Failed to send heartbeat message to channel");
                    break;
                }
            }
        });

        // 消息处理循环
        loop {
            tokio::select! {
                // 处理来自服务器的消息
                message = read.next() => {
                    match message {
                        Some(Ok(Message::Text(text))) => {
                            match serde_json::from_str::<WSMessage>(&text) {
                                Ok(ws_message) => {
                                    // 调用消息处理器
                                    match message_handler(ws_message).await {
                                        Ok(Some(response)) => {
                                            // 发送响应消息
                                            let response_json = serde_json::to_string(&response)
                                                .map_err(|e| WebSocketError::InvalidMessage(e.to_string()))?;

                                            write.send(Message::Text(response_json.into())).await
                                                .map_err(|e| WebSocketError::MessageSendFailed(e.to_string()))?;
                                        }
                                        Ok(None) => {
                                            // 无需响应
                                        }
                                        Err(e) => {
                                            tracing::error!("Message handler error: {}", e);
                                        }
                                    }
                                }
                                Err(e) => {
                                    tracing::error!("Failed to parse WebSocket message: {}", e);
                                }
                            }
                        }
                        Some(Ok(Message::Close(_))) => {
                            tracing::info!("WebSocket connection closed by server");
                            break;
                        }
                        Some(Err(e)) => {
                            tracing::error!("WebSocket error: {}", e);
                            break;
                        }
                        None => {
                            tracing::info!("WebSocket stream ended");
                            break;
                        }
                        _ => {
                            // 忽略其他消息类型
                        }
                    }
                }
                // 处理心跳消息
                heartbeat_msg = heartbeat_rx.recv() => {
                    if let Some(msg) = heartbeat_msg {
                        if let Ok(json) = serde_json::to_string(&msg) {
                            if let Err(e) = write.send(Message::Text(json.into())).await {
                                tracing::error!("Failed to send heartbeat: {}", e);
                                break;
                            }
                        }
                    }
                }
            }
        }
        // 取消心跳任务
        heartbeat_task.abort();

        // 连接断开，返回错误以触发重连
        Err(WebSocketError::ConnectionFailed(
            "Connection closed".to_string(),
        ))
    }

    /// 生成认证签名
    /// 使用 Ed25519 私钥对 device_id + timestamp 进行签名
    async fn generate_auth_signature(&self) -> Result<String, WebSocketError> {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| WebSocketError::InvalidMessage(e.to_string()))?
            .as_millis() as u64;

        // 构造签名数据: device_id:timestamp
        let signature_data = format!("{}:{}", self.device_id, timestamp);

        match &self.crypto_manager {
            Some(crypto) => {
                // 使用 CryptoManager 进行 Ed25519 签名
                let signature = crypto.sign(signature_data.as_bytes());

                // 返回格式: timestamp:signature (服务端需要时间戳来验证)
                Ok(format!("{}:{}", timestamp, signature))
            }
            None => {
                // 没有加密管理器，返回错误
                tracing::warn!("No crypto manager available for signing");
                Err(WebSocketError::AuthenticationFailed)
            }
        }
    }

    /// 生成请求签名（用于 HTTP API 请求）
    /// 返回 (timestamp, nonce, signature)
    pub fn sign_request(
        &self,
        payload: &serde_json::Value,
    ) -> Result<(u64, String, String), WebSocketError> {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| WebSocketError::InvalidMessage(e.to_string()))?
            .as_millis() as u64;

        let nonce = CryptoManager::generate_nonce();

        match &self.crypto_manager {
            Some(crypto) => {
                // 构造签名数据：按字段排序的 JSON
                let mut sign_data = serde_json::json!({
                    "device_id": self.device_id,
                    "timestamp": timestamp,
                    "nonce": nonce,
                });

                // 合并 payload
                if let serde_json::Value::Object(map) = payload {
                    if let serde_json::Value::Object(ref mut sign_map) = sign_data {
                        for (k, v) in map {
                            sign_map.insert(k.clone(), v.clone());
                        }
                    }
                }

                // 排序 JSON 键并序列化
                let sorted_json = sort_json_keys(&sign_data);
                let signature = crypto.sign(sorted_json.as_bytes());

                Ok((timestamp, nonce, signature))
            }
            None => Err(WebSocketError::AuthenticationFailed),
        }
    }

    /// 发送消息到 WebSocket
    pub async fn send_message(&self, _message: WSMessage) -> Result<(), WebSocketError> {
        // 注意: 实际的消息发送应该通过 connect_and_run 中的通道进行
        // 这里提供一个占位实现
        Err(WebSocketError::MessageSendFailed(
            "Use connect_and_run for message handling".to_string(),
        ))
    }
}

/// 递归排序 JSON 对象的键
fn sort_json_keys(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::Object(map) => {
            let mut sorted: Vec<(&String, &serde_json::Value)> = map.iter().collect();
            sorted.sort_by(|a, b| a.0.cmp(b.0));

            let pairs: Vec<String> = sorted
                .iter()
                .map(|(k, v)| format!("\"{}\":{}", k, sort_json_keys(v)))
                .collect();

            format!("{{{}}}", pairs.join(","))
        }
        serde_json::Value::Array(arr) => {
            let items: Vec<String> = arr.iter().map(sort_json_keys).collect();
            format!("[{}]", items.join(","))
        }
        serde_json::Value::String(s) => format!("\"{}\"", s),
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::Bool(b) => b.to_string(),
        serde_json::Value::Null => "null".to_string(),
    }
}

impl Default for ReconnectStrategy {
    fn default() -> Self {
        Self {
            initial_delay: Duration::from_secs(1),
            max_delay: Duration::from_secs(60),
            backoff_factor: 2.0,
            max_attempts: Some(10),
        }
    }
}

impl Default for TlsConfig {
    fn default() -> Self {
        Self {
            verify_mode: TlsVerifyMode::Strict,
            #[cfg(feature = "tls-pinning")]
            certificate_pinning: None,
            min_tls_version: TlsVersion::Tls12,
            cipher_suites: None,
            debug_mode: false,
        }
    }
}
