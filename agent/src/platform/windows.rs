#[cfg(target_os = "windows")]
use super::{calculate_checksum, CommandExecutor, FileInfo, FileSystem};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use std::path::Path;
use std::process::Output;
use tokio::fs;
use tokio::process::Command;

pub struct WindowsCommandExecutor;

impl Default for WindowsCommandExecutor {
    fn default() -> Self {
        Self::new()
    }
}

impl WindowsCommandExecutor {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl CommandExecutor for WindowsCommandExecutor {
    async fn execute(&self, cmd: &str, args: &[String]) -> Result<Output> {
        let output = Command::new("cmd")
            .arg("/C")
            .arg(cmd)
            .args(args)
            .output()
            .await?;

        Ok(output)
    }
}

pub struct WindowsFileSystem;

impl Default for WindowsFileSystem {
    fn default() -> Self {
        Self::new()
    }
}

impl WindowsFileSystem {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl FileSystem for WindowsFileSystem {
    async fn list_files(&self, path: &Path) -> Result<Vec<FileInfo>> {
        let mut files = Vec::new();
        let mut entries = fs::read_dir(path)
            .await
            .map_err(|e| anyhow!("Failed to read directory {}: {}", path.display(), e))?;

        while let Some(entry) = entries
            .next_entry()
            .await
            .map_err(|e| anyhow!("Failed to read directory entry: {}", e))?
        {
            let metadata = entry.metadata().await.map_err(|e| {
                anyhow!(
                    "Failed to read metadata for {}: {}",
                    entry.path().display(),
                    e
                )
            })?;

            let modified = metadata.modified().ok();
            let is_dir = metadata.is_dir();
            let size = if is_dir { 0 } else { metadata.len() };

            // Calculate checksum for files (not directories)
            let checksum = if !is_dir && size > 0 && size < 10 * 1024 * 1024 {
                // Only for files < 10MB
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
        fs::read(path)
            .await
            .map_err(|e| anyhow!("Failed to read file {}: {}", path.display(), e))
    }

    async fn write_file(&self, path: &Path, data: &[u8]) -> Result<()> {
        // Create parent directories if they don't exist
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).await.map_err(|e| {
                anyhow!(
                    "Failed to create parent directories for {}: {}",
                    path.display(),
                    e
                )
            })?;
        }

        fs::write(path, data)
            .await
            .map_err(|e| anyhow!("Failed to write file {}: {}", path.display(), e))
    }
}
