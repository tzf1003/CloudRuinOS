import React, { useState, useEffect } from 'react';
import { 
  X, 
  Download, 
  Eye, 
  FileText, 
  Image as ImageIcon,
  AlertCircle,
  RefreshCw,
  Code
} from 'lucide-react';
import { FileInfo } from '../types/api';
import { apiClient } from '../lib/api-client';
import { Card } from './ui/Card';
import { cn } from '../lib/utils';
import { formatFileSize } from '../lib/utils'; // Assuming this exists or I'll implement locally

interface FilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: FileInfo | null;
  deviceId: string;
}

export function FilePreviewModal({ isOpen, onClose, file, deviceId }: FilePreviewModalProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<'text' | 'image' | 'unsupported'>('unsupported');

  useEffect(() => {
    if (file) {
      const type = getPreviewType(file.name);
      setPreviewType(type);
      if (isOpen && type !== 'unsupported') {
        loadFileContent();
      }
    }
    return () => {
        // Cleanup object URLs to avoid memory leaks
        if (content && previewType === 'image') {
            URL.revokeObjectURL(content);
        }
    };
  }, [file, isOpen]);

  const getPreviewType = (fileName: string): 'text' | 'image' | 'unsupported' => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    
    const textExtensions = ['txt', 'md', 'json', 'xml', 'html', 'css', 'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'log', 'cfg', 'conf', 'ini', 'sh', 'bat', 'yaml', 'yml'];
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'];
    
    if (textExtensions.includes(extension || '')) {
      return 'text';
    } else if (imageExtensions.includes(extension || '')) {
      return 'image';
    }
    
    return 'unsupported';
  };

  const loadFileContent = async () => {
    if (!file || file.isDirectory) return;

    setLoading(true);
    setError(null);
    // Cleanup previous image url
    if (content && previewType === 'image') {
        URL.revokeObjectURL(content);
    }
    setContent(null);

    try {
      const type = getPreviewType(file.name);
      const blob = await apiClient.downloadFile(deviceId, file.path);
      
      if (type === 'text') {
        const text = await blob.text();
        setContent(text);
      } else if (type === 'image') {
        const imageUrl = URL.createObjectURL(blob);
        setContent(imageUrl);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载预览失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!file || file.isDirectory) return;

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
    } catch (err) {
      console.error(err);
    }
  };

  const formatSize = (bytes: number) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!isOpen || !file) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div 
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />
      
      <Card variant="glass" className="relative w-full max-w-4xl max-h-[90vh] flex flex-col p-0 shadow-2xl m-4 border-slate-700/50">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50 bg-slate-900/50">
          <div className="flex items-center gap-3 min-w-0">
             <div className="p-2 rounded-lg bg-slate-800 text-slate-300">
               {previewType === 'image' ? <ImageIcon className="w-5 h-5 text-purple-400" /> : <FileText className="w-5 h-5 text-cyan-400" />}
             </div>
             <div className="min-w-0">
                <h3 className="text-lg font-semibold text-slate-100 truncate pr-4">
                    {file.name}
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                    {formatSize(file.size)} • {file.path}
                </p>
             </div>
          </div>
          
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
                onClick={loadFileContent}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                title="刷新"
            >
                <RefreshCw className={cn("w-5 h-5", loading && "animate-spin")} />
            </button>
            <button
                onClick={handleDownload}
                className="p-2 text-slate-400 hover:text-cyan-300 hover:bg-slate-800 rounded-lg transition-colors"
                title="下载"
            >
                <Download className="w-5 h-5" />
            </button>
            <div className="w-px h-6 bg-slate-700 mx-1" />
            <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
            >
                <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-slate-950 p-6 min-h-[400px] relative">
            {loading ? (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="space-y-4 text-center">
                        <div className="w-12 h-12 border-4 border-slate-800 border-t-cyan-500 rounded-full animate-spin mx-auto" />
                        <p className="text-slate-500 text-sm">正在加载预览...</p>
                    </div>
                </div>
            ) : error ? (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center max-w-sm px-4">
                        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4 opacity-80" />
                        <h4 className="text-slate-200 font-medium mb-2">预览失败</h4>
                        <p className="text-slate-500 text-sm">{error}</p>
                    </div>
                </div>
            ) : previewType === 'unsupported' ? (
                <div className="absolute inset-0 flex items-center justify-center">
                     <div className="text-center">
                        <div className="w-20 h-20 bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-slate-800">
                             <FileText className="w-10 h-10 text-slate-600" />
                        </div>
                        <h4 className="text-slate-200 font-medium mb-2">无可用预览</h4>
                        <p className="text-slate-500 text-sm mb-6">
                            此文件类型无法直接预览。
                        </p>
                        <button
                            onClick={handleDownload}
                            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm transition-colors border border-slate-700"
                        >
                            下载文件
                        </button>
                    </div>
                </div>
            ) : (
                <div className="relative">
                    {previewType === 'text' && content && (
                        <pre className="font-mono text-sm text-slate-300 whitespace-pre-wrap break-words bg-slate-900/50 p-4 rounded-lg border border-slate-800/50">
                            {content}
                        </pre>
                    )}
                    {previewType === 'image' && content && (
                         <div className="flex justify-center">
                            <img 
                                src={content} 
                                alt={file.name} 
                                className="max-w-full rounded-lg shadow-2xl border border-slate-800"
                            />
                         </div>
                    )}
                </div>
            )}
        </div>
      </Card>
    </div>
  );
}
