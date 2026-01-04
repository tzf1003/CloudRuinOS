#[cfg(target_os = "linux")]
use super::{CommandExecutor, FileSystem, FileInfo, calculate_checksum};
use async_trait::async_trait;
use anyhow::{Result, anyhow};
use std::path::Path;
use std::process::Output;
use tokio::process::Command;
use tokio::fs;
use std::time::SystemTime;

pub struct LinuxCommandExecutor;

impl LinuxCommandExecutor {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl CommandExecutor for LinuxCommandExecutor {
    async fn execute(&self, cmd: &str, args: &[String]) -> Result<Output> {
        let output = Command::new("sh")
            .arg("-c")
            .arg(format!("{} {}", cmd, args.join(" ")))
            .output()
            .await?;
        
        Ok(output)
    }
}

pub struct LinuxFileSystem;

impl LinuxFileSystem {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl FileSystem for LinuxFileSystem {
    async fn list_files(&self, path: &Path) -> Result<Vec<FileInfo>> {
        let mut files = Vec::new();
        let mut entries = fs::read_dir(path).await
            .map_err(|e| anyhow!("Failed to read directory {}: {}", path.display(), e))?;
        
        while let Some(entry) = entries.next_entry().await
            .map_err(|e| anyhow!("Failed to read directory entry: {}", e))? {
            
            let metadata = entry.metadata().await
                .map_err(|e| anyhow!("Failed to read metadata for {}: {}", entry.path().display(), e))?;
            
            let modified = metadata.modified().ok();
            let is_dir = metadata.is_dir();
            let size = if is_dir { 0 } else { metadata.len() };
            
            // Calculate checksum for files (not directories)
            let checksum = if !is_dir && size > 0 && size < 10 * 1024 * 1024 { // Only for files < 10MB
                match fs::read(&entry.path()).await {
                    Ok(data) => Some(calculate_checksum(&data)),
                    Err(_) => None, // Skip checksum if file can't be read
                }
            } else {
                None
            };
            
            files.push(FileInfo {
                path: entry.path(),
                size,
                is_dir,
                modified,
                checksum,
            });
        }
        
        Ok(files)
    }

    async fn read_file(&self, path: &Path) -> Result<Vec<u8>> {
        fs::read(path).await
            .map_err(|e| anyhow!("Failed to read file {}: {}", path.display(), e))
    }

    async fn write_file(&self, path: &Path, data: &[u8]) -> Result<()> {
        // Create parent directories if they don't exist
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).await
                .map_err(|e| anyhow!("Failed to create parent directories for {}: {}", path.display(), e))?;
        }
        
        fs::write(path, data).await
            .map_err(|e| anyhow!("Failed to write file {}: {}", path.display(), e))
    }
}