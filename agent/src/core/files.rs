use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tracing::{debug, info};

/// 文件信息结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileInfo {
    pub path: String,
    pub size: u64,
    pub is_dir: bool,
    pub modified: Option<u64>,
}

/// 文件操作客户端
#[derive(Clone)]
pub struct FileManager {
    /// 允许的根路径列表
    allowed_paths: Vec<PathBuf>,
    /// 最大文件大小 (bytes)
    max_file_size: u64,
    /// 禁止的路径模式
    forbidden_patterns: Vec<String>,
}

/// 文件管理器配置
#[derive(Debug, Clone)]
pub struct FileManagerConfig {
    pub allowed_paths: Vec<PathBuf>,
    pub max_file_size: u64,
    pub forbidden_patterns: Vec<String>,
}

impl Default for FileManagerConfig {
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
            max_file_size: 100 * 1024 * 1024, // 100MB
            forbidden_patterns: vec![
                "passwd".to_string(),
                "shadow".to_string(),
                "ssh_host_".to_string(),
                ".ssh/id_".to_string(),
                "private_key".to_string(),
            ],
        }
    }
}

impl FileManager {
    /// 创建新的文件管理器
    pub fn new(config: FileManagerConfig) -> Self {
        Self {
            allowed_paths: config.allowed_paths,
            max_file_size: config.max_file_size,
            forbidden_patterns: config.forbidden_patterns,
        }
    }

    /// 验证路径是否安全
    pub fn validate_path(&self, path: &str) -> Result<PathBuf> {
        let path_buf = PathBuf::from(path);

        // 规范化路径，防止路径遍历攻击
        let canonical_path = match path_buf.canonicalize() {
            Ok(p) => p,
            Err(_) => {
                // 如果路径不存在，尝试规范化父目录
                if let Some(parent) = path_buf.parent() {
                    let canonical_parent = parent
                        .canonicalize()
                        .map_err(|_| anyhow!("Invalid path: parent directory does not exist"))?;
                    canonical_parent.join(path_buf.file_name().unwrap_or_default())
                } else {
                    return Err(anyhow!("Invalid path: cannot resolve"));
                }
            }
        };

        // 检查是否在允许的路径内
        let mut path_allowed = false;
        for allowed_path in &self.allowed_paths {
            if let Ok(canonical_allowed) = allowed_path.canonicalize() {
                if canonical_path.starts_with(&canonical_allowed) {
                    path_allowed = true;
                    break;
                }
            }
        }

        if !path_allowed {
            return Err(anyhow!("Path not in allowed directories: {}", path));
        }

        // 检查禁止的路径模式
        let path_str = canonical_path.to_string_lossy().to_lowercase();
        for pattern in &self.forbidden_patterns {
            if path_str.contains(&pattern.to_lowercase()) {
                return Err(anyhow!("Path contains forbidden pattern: {}", pattern));
            }
        }

        Ok(canonical_path)
    }

    /// 列出目录内容
    pub async fn list_files(&self, path: &str) -> Result<Vec<FileInfo>> {
        let validated_path = self.validate_path(path)?;

        debug!("Listing files in: {:?}", validated_path);

        if !validated_path.exists() {
            return Err(anyhow!("Path does not exist: {}", path));
        }

        if !validated_path.is_dir() {
            return Err(anyhow!("Path is not a directory: {}", path));
        }

        let mut files = Vec::new();
        let entries = fs::read_dir(&validated_path)
            .map_err(|e| anyhow!("Failed to read directory: {}", e))?;

        for entry in entries {
            let entry = entry.map_err(|e| anyhow!("Failed to read directory entry: {}", e))?;
            let entry_path = entry.path();

            let metadata = entry
                .metadata()
                .map_err(|e| anyhow!("Failed to read file metadata: {}", e))?;

            let file_info = FileInfo {
                path: entry_path.to_string_lossy().to_string(),
                size: metadata.len(),
                is_dir: metadata.is_dir(),
                modified: metadata
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs()),
            };

            files.push(file_info);
        }

        // 按名称排序
        files.sort_by(|a, b| a.path.cmp(&b.path));

        info!("Listed {} files in {}", files.len(), path);
        Ok(files)
    }

    /// 读取文件内容
    pub async fn read_file(&self, path: &str) -> Result<(Vec<u8>, String)> {
        let validated_path = self.validate_path(path)?;

        debug!("Reading file: {:?}", validated_path);

        if !validated_path.exists() {
            return Err(anyhow!("File does not exist: {}", path));
        }

        if !validated_path.is_file() {
            return Err(anyhow!("Path is not a file: {}", path));
        }

        let metadata = fs::metadata(&validated_path)
            .map_err(|e| anyhow!("Failed to read file metadata: {}", e))?;

        if metadata.len() > self.max_file_size {
            return Err(anyhow!(
                "File size {} exceeds maximum allowed size {}",
                metadata.len(),
                self.max_file_size
            ));
        }

        let content =
            fs::read(&validated_path).map_err(|e| anyhow!("Failed to read file: {}", e))?;

        // 计算 SHA-256 校验和
        let checksum = self.calculate_checksum(&content);

        info!("Read file {} ({} bytes)", path, content.len());
        Ok((content, checksum))
    }

    /// 写入文件内容
    pub async fn write_file(
        &self,
        path: &str,
        content: &[u8],
        expected_checksum: &str,
    ) -> Result<()> {
        let validated_path = self.validate_path(path)?;

        debug!(
            "Writing file: {:?} ({} bytes)",
            validated_path,
            content.len()
        );

        // 检查文件大小限制
        if content.len() as u64 > self.max_file_size {
            return Err(anyhow!(
                "File size {} exceeds maximum allowed size {}",
                content.len(),
                self.max_file_size
            ));
        }

        // 验证校验和
        let actual_checksum = self.calculate_checksum(content);
        if actual_checksum != expected_checksum {
            return Err(anyhow!(
                "Checksum mismatch: expected {}, got {}",
                expected_checksum,
                actual_checksum
            ));
        }

        // 确保父目录存在
        if let Some(parent) = validated_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| anyhow!("Failed to create parent directory: {}", e))?;
        }

        // 写入文件
        fs::write(&validated_path, content).map_err(|e| anyhow!("Failed to write file: {}", e))?;

        info!("Wrote file {} ({} bytes)", path, content.len());
        Ok(())
    }

    /// 删除文件
    pub async fn delete_file(&self, path: &str) -> Result<()> {
        let validated_path = self.validate_path(path)?;

        debug!("Deleting file: {:?}", validated_path);

        if !validated_path.exists() {
            return Err(anyhow!("File does not exist: {}", path));
        }

        if validated_path.is_dir() {
            fs::remove_dir_all(&validated_path)
                .map_err(|e| anyhow!("Failed to delete directory: {}", e))?;
        } else {
            fs::remove_file(&validated_path)
                .map_err(|e| anyhow!("Failed to delete file: {}", e))?;
        }

        info!("Deleted file: {}", path);
        Ok(())
    }

    /// 计算文件内容的 SHA-256 校验和
    fn calculate_checksum(&self, content: &[u8]) -> String {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(content);
        format!("{:x}", hasher.finalize())
    }

    /// 获取文件信息
    pub async fn get_file_info(&self, path: &str) -> Result<FileInfo> {
        let validated_path = self.validate_path(path)?;

        if !validated_path.exists() {
            return Err(anyhow!("File does not exist: {}", path));
        }

        let metadata = fs::metadata(&validated_path)
            .map_err(|e| anyhow!("Failed to read file metadata: {}", e))?;

        Ok(FileInfo {
            path: validated_path.to_string_lossy().to_string(),
            size: metadata.len(),
            is_dir: metadata.is_dir(),
            modified: metadata
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs()),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::{tempdir, NamedTempFile};

    #[tokio::test]
    async fn test_file_manager_creation() {
        let config = FileManagerConfig::default();
        let file_manager = FileManager::new(config);
        assert!(!file_manager.allowed_paths.is_empty());
        assert!(file_manager.max_file_size > 0);
    }

    #[tokio::test]
    async fn test_path_validation() {
        let temp_dir = tempdir().unwrap();
        let config = FileManagerConfig {
            allowed_paths: vec![temp_dir.path().to_path_buf()],
            max_file_size: 1024,
            forbidden_patterns: vec!["secret".to_string()],
        };
        let file_manager = FileManager::new(config);

        // 测试有效路径
        let valid_path = temp_dir.path().join("test.txt");
        let result = file_manager.validate_path(&valid_path.to_string_lossy());
        assert!(result.is_ok());

        // 测试禁止的路径模式
        let forbidden_path = temp_dir.path().join("secret.txt");
        let result = file_manager.validate_path(&forbidden_path.to_string_lossy());
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_file_operations() {
        let temp_dir = tempdir().unwrap();
        let config = FileManagerConfig {
            allowed_paths: vec![temp_dir.path().to_path_buf()],
            max_file_size: 1024,
            forbidden_patterns: vec![],
        };
        let file_manager = FileManager::new(config);

        // 创建测试文件
        let test_file = temp_dir.path().join("test.txt");
        let test_content = b"Hello, World!";
        fs::write(&test_file, test_content).unwrap();

        // 测试文件读取
        let (content, checksum) = file_manager
            .read_file(&test_file.to_string_lossy())
            .await
            .unwrap();
        assert_eq!(content, test_content);
        assert!(!checksum.is_empty());

        // 测试文件写入
        let new_file = temp_dir.path().join("new.txt");
        let new_content = b"New content";
        let new_checksum = file_manager.calculate_checksum(new_content);

        file_manager
            .write_file(&new_file.to_string_lossy(), new_content, &new_checksum)
            .await
            .unwrap();

        // 验证写入的文件
        let written_content = fs::read(&new_file).unwrap();
        assert_eq!(written_content, new_content);

        // 测试目录列表
        let files = file_manager
            .list_files(&temp_dir.path().to_string_lossy())
            .await
            .unwrap();
        assert_eq!(files.len(), 2);
    }

    #[tokio::test]
    async fn test_file_size_limit() {
        let temp_dir = tempdir().unwrap();
        let config = FileManagerConfig {
            allowed_paths: vec![temp_dir.path().to_path_buf()],
            max_file_size: 10, // 很小的限制
            forbidden_patterns: vec![],
        };
        let file_manager = FileManager::new(config);

        // 测试超过大小限制的文件
        let large_content = vec![0u8; 20]; // 超过 10 字节限制
        let checksum = file_manager.calculate_checksum(&large_content);
        let test_file = temp_dir.path().join("large.txt");

        let result = file_manager
            .write_file(&test_file.to_string_lossy(), &large_content, &checksum)
            .await;
        assert!(result.is_err());
    }
}
