use async_trait::async_trait;
use anyhow::{Result, anyhow};
use std::path::{Path, PathBuf};
use std::process::Output;
use sha2::{Sha256, Digest};

#[cfg(test)]
pub mod tests;

// 跨平台 trait 定义
#[async_trait]
pub trait CommandExecutor {
    async fn execute(&self, cmd: &str, args: &[String]) -> Result<Output>;
}

#[async_trait]
pub trait FileSystem {
    async fn list_files(&self, path: &Path) -> Result<Vec<FileInfo>>;
    async fn read_file(&self, path: &Path) -> Result<Vec<u8>>;
    async fn write_file(&self, path: &Path, data: &[u8]) -> Result<()>;
    
    // 带安全策略的文件操作
    async fn list_files_secure(&self, path: &Path, policy: &PathSecurityPolicy) -> Result<Vec<FileInfo>> {
        policy.is_path_allowed(path)?;
        self.list_files(path).await
    }
    
    async fn read_file_secure(&self, path: &Path, policy: &PathSecurityPolicy) -> Result<Vec<u8>> {
        policy.is_path_allowed(path)?;
        let data = self.read_file(path).await?;
        policy.validate_file_size(data.len() as u64)?;
        Ok(data)
    }
    
    async fn write_file_secure(&self, path: &Path, data: &[u8], policy: &PathSecurityPolicy) -> Result<()> {
        policy.is_path_allowed(path)?;
        policy.validate_file_size(data.len() as u64)?;
        self.write_file(path, data).await
    }
}

#[derive(Debug, Clone)]
pub struct CommandOutput {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Clone)]
pub struct FileInfo {
    pub path: PathBuf,
    pub size: u64,
    pub is_dir: bool,
    pub modified: Option<std::time::SystemTime>,
    pub checksum: Option<String>, // SHA256 checksum for files
}

// 路径安全策略
#[derive(Debug, Clone)]
pub struct PathSecurityPolicy {
    pub allowed_paths: Vec<PathBuf>,
    pub blocked_paths: Vec<PathBuf>,
    pub max_file_size: u64, // bytes
    pub allow_hidden_files: bool,
}

impl Default for PathSecurityPolicy {
    fn default() -> Self {
        Self {
            allowed_paths: vec![
                PathBuf::from("/tmp"),
                PathBuf::from("/var/log"),
                #[cfg(target_os = "windows")]
                PathBuf::from("C:\\temp"),
                #[cfg(target_os = "windows")]
                PathBuf::from("C:\\logs"),
            ],
            blocked_paths: vec![
                PathBuf::from("/etc/passwd"),
                PathBuf::from("/etc/shadow"),
                #[cfg(target_os = "windows")]
                PathBuf::from("C:\\Windows\\System32"),
            ],
            max_file_size: 100 * 1024 * 1024, // 100MB
            allow_hidden_files: false,
        }
    }
}

impl PathSecurityPolicy {
    pub fn is_path_allowed(&self, path: &Path) -> Result<()> {
        // For non-existent files, canonicalize the parent directory instead
        let canonical_path = if path.exists() {
            path.canonicalize()
                .map_err(|e| anyhow!("Failed to canonicalize path: {}", e))?
        } else {
            // If file doesn't exist, canonicalize parent and append filename
            if let Some(parent) = path.parent() {
                let canonical_parent = parent.canonicalize()
                    .map_err(|e| anyhow!("Failed to canonicalize parent path: {}", e))?;
                if let Some(filename) = path.file_name() {
                    canonical_parent.join(filename)
                } else {
                    return Err(anyhow!("Invalid path: no filename component"));
                }
            } else {
                return Err(anyhow!("Invalid path: no parent directory"));
            }
        };
        
        // Check if path is blocked
        for blocked in &self.blocked_paths {
            if canonical_path.starts_with(blocked) {
                return Err(anyhow!("Path is blocked by security policy: {:?}", path));
            }
        }
        
        // Check if path is in allowed list (if not empty)
        if !self.allowed_paths.is_empty() {
            let mut allowed = false;
            for allowed_path in &self.allowed_paths {
                // Canonicalize allowed path for comparison
                let canonical_allowed = allowed_path.canonicalize()
                    .map_err(|e| anyhow!("Failed to canonicalize allowed path {:?}: {}", allowed_path, e))?;
                if canonical_path.starts_with(&canonical_allowed) {
                    allowed = true;
                    break;
                }
            }
            if !allowed {
                return Err(anyhow!("Path not in allowed list: {:?}", path));
            }
        }
        
        // Check for invalid filenames
        if let Some(filename) = canonical_path.file_name() {
            let filename_str = filename.to_string_lossy();
            if filename_str == "." || filename_str == ".." {
                return Err(anyhow!("Invalid filename: {:?}", filename_str));
            }
        }
        
        // Check hidden files
        if !self.allow_hidden_files {
            if let Some(filename) = canonical_path.file_name() {
                if filename.to_string_lossy().starts_with('.') {
                    return Err(anyhow!("Hidden files not allowed: {:?}", path));
                }
            }
        }
        
        Ok(())
    }
    
    pub fn validate_file_size(&self, size: u64) -> Result<()> {
        if size > self.max_file_size {
            return Err(anyhow!("File size {} exceeds maximum allowed size {}", size, self.max_file_size));
        }
        Ok(())
    }
}

// 文件完整性验证
pub fn calculate_checksum(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    format!("{:x}", hasher.finalize())
}

// 平台特定实现模块
#[cfg(all(target_os = "windows", feature = "windows"))]
pub mod windows;

#[cfg(all(target_os = "linux", feature = "linux"))]
pub mod linux;

#[cfg(all(target_os = "macos", feature = "macos"))]
pub mod macos;

// 平台工厂函数

/// 创建平台特定的命令执行器
/// 
/// # Errors
/// 如果当前平台不受支持或缺少对应的 feature flag，返回错误
pub fn create_command_executor() -> Result<Box<dyn CommandExecutor + Send + Sync>> {
    #[cfg(all(target_os = "windows", feature = "windows"))]
    return Ok(Box::new(windows::WindowsCommandExecutor::new()));
    
    #[cfg(all(target_os = "linux", feature = "linux"))]
    return Ok(Box::new(linux::LinuxCommandExecutor::new()));
    
    #[cfg(all(target_os = "macos", feature = "macos"))]
    return Ok(Box::new(macos::MacOSCommandExecutor::new()));
    
    #[cfg(not(any(
        all(target_os = "windows", feature = "windows"),
        all(target_os = "linux", feature = "linux"),
        all(target_os = "macos", feature = "macos")
    )))]
    Err(anyhow!("Unsupported platform or missing platform feature flag. \
        Current OS: {}. Please enable the appropriate feature: windows, linux, or macos", 
        std::env::consts::OS))
}

/// 创建平台特定的文件系统操作器
/// 
/// # Errors
/// 如果当前平台不受支持或缺少对应的 feature flag，返回错误
pub fn create_file_system() -> Result<Box<dyn FileSystem + Send + Sync>> {
    #[cfg(all(target_os = "windows", feature = "windows"))]
    return Ok(Box::new(windows::WindowsFileSystem::new()));
    
    #[cfg(all(target_os = "linux", feature = "linux"))]
    return Ok(Box::new(linux::LinuxFileSystem::new()));
    
    #[cfg(all(target_os = "macos", feature = "macos"))]
    return Ok(Box::new(macos::MacOSFileSystem::new()));
    
    #[cfg(not(any(
        all(target_os = "windows", feature = "windows"),
        all(target_os = "linux", feature = "linux"),
        all(target_os = "macos", feature = "macos")
    )))]
    Err(anyhow!("Unsupported platform or missing platform feature flag. \
        Current OS: {}. Please enable the appropriate feature: windows, linux, or macos", 
        std::env::consts::OS))
}