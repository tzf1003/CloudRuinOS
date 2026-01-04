import React, { useState } from 'react';
import { 
  File, 
  Folder, 
  Download, 
  Eye, 
  MoreHorizontal,
  RefreshCw,
  CheckSquare,
  Square,
  Calendar,
  HardDrive
} from 'lucide-react';
import { FileInfo } from '../types/api';
import { apiClient } from '../lib/api-client';
import { FilePreviewModal } from './FilePreviewModal';
import { useNotifications } from '../contexts/UIContext';

interface FileExplorerProps {
  deviceId: string;
  currentPath: string;
  files: FileInfo[];
  loading: boolean;
  onPathChange: (path: string) => void;
  onRefresh: () => void;
}

interface SelectedFiles {
  [path: string]: boolean;
}

export function FileExplorer({ 
  deviceId, 
  currentPath, 
  files, 
  loading, 
  onPathChange, 
  onRefresh 
}: FileExplorerProps) {
  const [selectedFiles, setSelectedFiles] = useState<SelectedFiles>({});
  const [downloadingFiles, setDownloadingFiles] = useState<Set<string>>(new Set());
  const [previewFile, setPreviewFile] = useState<FileInfo | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  
  // 通知系统
  const { addNotification } = useNotifications();

  // Handle file/directory click
  const handleItemClick = (file: FileInfo) => {
    if (file.isDirectory) {
      // Navigate to directory
      const newPath = currentPath === '/' 
        ? `/${file.name}` 
        : `${currentPath}/${file.name}`;
      onPathChange(newPath);
    } else {
      // Toggle file selection
      setSelectedFiles(prev => ({
        ...prev,
        [file.path]: !prev[file.path]
      }));
    }
  };

  // Handle file download
  const handleDownload = async (file: FileInfo) => {
    if (file.isDirectory) return;

    setDownloadingFiles(prev => new Set(prev).add(file.path));
    
    try {
      const blob = await apiClient.downloadFile(deviceId, file.path);
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      // 显示下载成功通知
      addNotification({
        type: 'success',
        title: '下载成功',
        message: `文件 ${file.name} 已成功下载`,
        duration: 3000
      });
    } catch (error) {
      console.error('Download failed:', error);
      // 显示错误通知
      addNotification({
        type: 'error',
        title: '下载失败',
        message: `无法下载文件 ${file.name}: ${error instanceof Error ? error.message : '未知错误'}`,
        duration: 5000,
        persistent: true
      });
    } finally {
      setDownloadingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(file.path);
        return newSet;
      });
    }
  };

  // Handle file preview
  const handlePreview = (file: FileInfo) => {
    if (file.isDirectory) return;
    
    setPreviewFile(file);
    setShowPreviewModal(true);
  };

  // Handle select all/none
  const handleSelectAll = () => {
    const allSelected = files.every(file => !file.isDirectory && selectedFiles[file.path]);
    
    if (allSelected) {
      // Deselect all
      setSelectedFiles({});
    } else {
      // Select all files (not directories)
      const newSelection: SelectedFiles = {};
      files.forEach(file => {
        if (!file.isDirectory) {
          newSelection[file.path] = true;
        }
      });
      setSelectedFiles(newSelection);
    }
  };

  // Handle batch download
  const handleBatchDownload = async () => {
    const selectedFilePaths = Object.keys(selectedFiles).filter(path => selectedFiles[path]);
    
    for (const filePath of selectedFilePaths) {
      const file = files.find(f => f.path === filePath);
      if (file && !file.isDirectory) {
        await handleDownload(file);
      }
    }
    
    setSelectedFiles({});
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Format date
  const formatDate = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleString('zh-CN');
  };

  // Get file icon
  const getFileIcon = (file: FileInfo) => {
    if (file.isDirectory) {
      return <Folder className="h-5 w-5 text-blue-500" />;
    }
    
    // Determine file type by extension
    const extension = file.name?.split('.').pop()?.toLowerCase();
    const iconClass = "h-5 w-5 text-gray-500";
    
    switch (extension) {
      case 'txt':
      case 'md':
      case 'log':
        return <File className={`${iconClass} text-gray-600`} />;
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
        return <File className={`${iconClass} text-green-600`} />;
      case 'pdf':
        return <File className={`${iconClass} text-red-600`} />;
      case 'zip':
      case 'tar':
      case 'gz':
        return <File className={`${iconClass} text-yellow-600`} />;
      default:
        return <File className={iconClass} />;
    }
  };

  const selectedCount = Object.values(selectedFiles).filter(Boolean).length;
  const fileCount = files.filter(f => !f.isDirectory).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
        <span className="ml-3 text-gray-500">加载文件列表...</span>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="text-center py-12">
        <Folder className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">目录为空</h3>
        <p className="mt-1 text-sm text-gray-500">
          当前目录中没有文件或文件夹
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      {fileCount > 0 && (
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center space-x-4">
            <button
              onClick={handleSelectAll}
              className="flex items-center text-sm text-gray-600 hover:text-gray-900"
            >
              {selectedCount === fileCount ? (
                <CheckSquare className="h-4 w-4 mr-2" />
              ) : (
                <Square className="h-4 w-4 mr-2" />
              )}
              {selectedCount === fileCount ? '取消全选' : '全选'}
            </button>
            
            {selectedCount > 0 && (
              <span className="text-sm text-gray-500">
                已选择 {selectedCount} 个文件
              </span>
            )}
          </div>
          
          {selectedCount > 0 && (
            <button
              onClick={handleBatchDownload}
              className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Download className="h-3 w-3 mr-1" />
              批量下载
            </button>
          )}
        </div>
      )}

      {/* File List */}
      <div className="bg-white overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                名称
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                大小
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                修改时间
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {/* Parent directory link */}
            {currentPath !== '/' && (
              <tr className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <button
                    onClick={() => {
                      const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
                      onPathChange(parentPath);
                    }}
                    className="flex items-center text-blue-600 hover:text-blue-800"
                  >
                    <Folder className="h-5 w-5 mr-3 text-blue-500" />
                    <span className="font-medium">.. (上级目录)</span>
                  </button>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
              </tr>
            )}
            
            {/* Files and directories */}
            {files.map((file) => (
              <tr key={file.path} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    {!file.isDirectory && (
                      <button
                        onClick={() => handleItemClick(file)}
                        className="mr-3"
                      >
                        {selectedFiles[file.path] ? (
                          <CheckSquare className="h-4 w-4 text-blue-600" />
                        ) : (
                          <Square className="h-4 w-4 text-gray-400" />
                        )}
                      </button>
                    )}
                    
                    <button
                      onClick={() => handleItemClick(file)}
                      className="flex items-center text-left"
                    >
                      {getFileIcon(file)}
                      <span className={`ml-3 font-medium ${
                        file.isDirectory ? 'text-blue-600 hover:text-blue-800' : 'text-gray-900'
                      }`}>
                        {file.name}
                      </span>
                    </button>
                  </div>
                </td>
                
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {file.isDirectory ? '-' : formatFileSize(file.size)}
                </td>
                
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 mr-1" />
                    {formatDate(file.modified)}
                  </div>
                </td>
                
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {!file.isDirectory && (
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleDownload(file)}
                        disabled={downloadingFiles.has(file.path)}
                        className="text-blue-600 hover:text-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="下载文件"
                      >
                        {downloadingFiles.has(file.path) ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                      </button>
                      
                      <button
                        onClick={() => handlePreview(file)}
                        className="text-gray-400 hover:text-gray-600"
                        title="预览文件"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      
                      <button
                        className="text-gray-400 hover:text-gray-600"
                        title="更多操作"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between text-sm text-gray-500 pt-4 border-t border-gray-200">
        <div className="flex items-center space-x-4">
          <div className="flex items-center">
            <Folder className="h-4 w-4 mr-1" />
            <span>{files.filter(f => f.isDirectory).length} 个文件夹</span>
          </div>
          <div className="flex items-center">
            <File className="h-4 w-4 mr-1" />
            <span>{fileCount} 个文件</span>
          </div>
        </div>
        
        <div className="flex items-center">
          <HardDrive className="h-4 w-4 mr-1" />
          <span>
            总大小: {formatFileSize(
              files.filter(f => !f.isDirectory).reduce((sum, f) => sum + f.size, 0)
            )}
          </span>
        </div>
      </div>

      {/* File Preview Modal */}
      <FilePreviewModal
        isOpen={showPreviewModal}
        onClose={() => {
          setShowPreviewModal(false);
          setPreviewFile(null);
        }}
        file={previewFile}
        deviceId={deviceId}
      />
    </div>
  );
}