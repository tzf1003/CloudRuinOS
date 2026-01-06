import React, { useState } from 'react';
import { 
  File as FileIcon, 
  Folder, 
  Download, 
  Eye, 
  CheckSquare,
  Square,
  Calendar,
  HardDrive,
  FileText,
  Image as ImageIcon,
  Archive,
  Music,
  Video,
  Code
} from 'lucide-react';
import { FileInfo } from '../types/api';
import { apiClient } from '../lib/api-client';
import { FilePreviewModal } from './FilePreviewModal';
import { useNotifications } from '../contexts/UIContext';
import { Card } from './ui/Card';
import { cn } from '../lib/utils';

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
  
  const { addNotification } = useNotifications();

  const handleItemClick = (file: FileInfo) => {
    if (file.isDirectory) {
      const newPath = currentPath === '/' 
        ? `/${file.name}` 
        : `${currentPath}/${file.name}`;
      onPathChange(newPath);
    } else {
      setSelectedFiles(prev => ({
        ...prev,
        [file.path]: !prev[file.path]
      }));
    }
  };

  const handleDownload = async (file: FileInfo) => {
    if (file.isDirectory) return;

    setDownloadingFiles(prev => new Set(prev).add(file.path));
    
    try {
      const blob = await apiClient.downloadFile(deviceId, file.path);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      addNotification({
        type: 'success',
        title: '下载完成',
        message: `文件 ${file.name} 下载成功`,
        duration: 3000
      });
    } catch (error) {
      console.error('Download failed:', error);
      addNotification({
        type: 'error',
        title: '下载失败',
        message: `无法下载 ${file.name}`,
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

  const handlePreview = (file: FileInfo) => {
    if (file.isDirectory) return;
    setPreviewFile(file);
    setShowPreviewModal(true);
  };

  const handleSelectAll = () => {
    const allSelected = files.every(file => !file.isDirectory && selectedFiles[file.path]);
    
    if (allSelected) {
      setSelectedFiles({});
    } else {
      const newSelection: SelectedFiles = {};
      files.forEach(file => {
        if (!file.isDirectory) {
          newSelection[file.path] = true;
        }
      });
      setSelectedFiles(newSelection);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const getFileIcon = (file: FileInfo) => {
    if (file.isDirectory) {
      return <Folder className="h-5 w-5 text-cyan-400 fill-cyan-400/20" />;
    }
    
    const extension = file.name.split('.').pop()?.toLowerCase();
    const commonClasses = "h-5 w-5";
    
    switch (extension) {
      case 'txt': case 'md': case 'log': case 'ini': case 'cfg':
        return <FileText className={`${commonClasses} text-slate-400`} />;
      case 'jpg': case 'jpeg': case 'png': case 'gif': case 'svg':
        return <ImageIcon className={`${commonClasses} text-purple-400`} />;
      case 'zip': case 'tar': case 'gz': case 'rar': case '7z':
        return <Archive className={`${commonClasses} text-amber-400`} />;
      case 'js': case 'ts': case 'jsx': case 'tsx': case 'json': case 'html': case 'css':
        return <Code className={`${commonClasses} text-blue-400`} />;
      case 'mp3': case 'wav': case 'ogg':
        return <Music className={`${commonClasses} text-pink-400`} />;
      case 'mp4': case 'avi': case 'mkv':
        return <Video className={`${commonClasses} text-red-400`} />;
      default:
        return <FileIcon className={`${commonClasses} text-slate-500`} />;
    }
  };

  const selectedCount = Object.values(selectedFiles).filter(Boolean).length;
  const fileCount = files.filter(f => !f.isDirectory).length;

  return (
    <>
      <Card variant="glass" className="overflow-hidden min-h-[600px] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-700/50 bg-slate-900/30">
          <div className="flex items-center gap-2 text-sm text-slate-400">
             <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4" />
                <span className="font-mono text-cyan-300">{currentPath}</span>
             </div>
             <span className="text-slate-600">|</span>
             <span>{files.length} 项</span>
          </div>

          <div className="flex items-center gap-2">
            {selectedCount > 0 && (
                <button 
                    onClick={() => {
                        const selected = files.filter(f => selectedFiles[f.path]);
                        selected.forEach(handleDownload);
                        setSelectedFiles({});
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 text-xs font-medium transition-colors"
                >
                    <Download className="h-3.5 w-3.5" />
                    下载选中 ({selectedCount})
                </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
             <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-500">
                <div className="w-10 h-10 border-4 border-slate-700 border-t-cyan-500 rounded-full animate-spin" />
                <p>正在加载文件...</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-900/50 text-xs uppercase text-slate-500 font-semibold sticky top-0 z-10 backdrop-blur-md">
                <tr>
                  <th className="px-6 py-3 border-b border-slate-700/50 w-12 text-center">
                    <button onClick={handleSelectAll} className="hover:text-cyan-400 transition-colors">
                        {fileCount > 0 && selectedCount === fileCount ? (
                            <CheckSquare className="h-4 w-4" />
                        ) : (
                            <Square className="h-4 w-4" />
                        )}
                    </button>
                  </th>
                  <th className="px-6 py-3 border-b border-slate-700/50">名称</th>
                  <th className="px-6 py-3 border-b border-slate-700/50 w-32">大小</th>
                  <th className="px-6 py-3 border-b border-slate-700/50 w-48">修改日期</th>
                  <th className="px-6 py-3 border-b border-slate-700/50 w-24 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 text-sm">
                 {files.length === 0 ? (
                    <tr>
                        <td colSpan={5} className="py-20 text-center text-slate-500">
                            <Folder className="h-12 w-12 mx-auto mb-3 opacity-20" />
                            <p>目录为空</p>
                        </td>
                    </tr>
                 ) : (
                    files.map((file) => (
                      <tr 
                        key={file.path} 
                        className={cn(
                            "group hover:bg-slate-800/50 transition-colors",
                            selectedFiles[file.path] && "bg-cyan-500/5 hover:bg-cyan-500/10"
                        )}
                      >
                        <td className="px-6 py-3 text-center">
                            {!file.isDirectory && (
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleItemClick(file);
                                    }}
                                    className={cn(
                                        "text-slate-600 hover:text-cyan-400 transition-colors",
                                        selectedFiles[file.path] && "text-cyan-400"
                                    )}
                                >
                                    {selectedFiles[file.path] ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                                </button>
                            )}
                        </td>
                        <td className="px-6 py-3">
                            <div 
                                className="flex items-center gap-3 cursor-pointer"
                                onClick={() => handleItemClick(file)}
                            >
                                {getFileIcon(file)}
                                <span className={cn(
                                    "font-medium truncate max-w-[300px]",
                                    file.isDirectory ? "text-slate-100 group-hover:text-cyan-300" : "text-slate-300 group-hover:text-white"
                                )}>
                                    {file.name}
                                </span>
                            </div>
                        </td>
                        <td className="px-6 py-3 text-slate-500 font-mono text-xs">
                          {file.isDirectory ? '-' : formatFileSize(file.size)}
                        </td>
                        <td className="px-6 py-3 text-slate-500 text-xs">
                            <div className="flex items-center gap-1.5">
                                <Calendar className="h-3 w-3" />
                                {formatDate(file.modified)}
                            </div>
                        </td>
                        <td className="px-6 py-3 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {!file.isDirectory && (
                                <>
                                    <button
                                        onClick={() => handlePreview(file)}
                                        className="p-1.5 rounded-md text-slate-400 hover:text-cyan-300 hover:bg-slate-700/50 transition-colors"
                                        title="预览"
                                    >
                                        <Eye className="h-4 w-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDownload(file)}
                                        className="p-1.5 rounded-md text-slate-400 hover:text-cyan-300 hover:bg-slate-700/50 transition-colors"
                                        title="下载"
                                        disabled={downloadingFiles.has(file.path)}
                                    >
                                        {downloadingFiles.has(file.path) ? (
                                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-cyan-500" />
                                        ) : (
                                            <Download className="h-4 w-4" />
                                        )}
                                    </button>
                                </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                 )}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {showPreviewModal && previewFile && (
        <FilePreviewModal
          file={previewFile}
          isOpen={showPreviewModal}
          onClose={() => setShowPreviewModal(false)}
          deviceId={deviceId}
        />
      )}
    </>
  );
}
