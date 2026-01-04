import React, { useState, useEffect } from 'react';
import { 
  X, 
  Download, 
  Eye, 
  FileText, 
  Image as ImageIcon,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { FileInfo } from '../types/api';
import { apiClient } from '../lib/api-client';

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

  // Determine preview type based on file extension
  const getPreviewType = (fileName: string): 'text' | 'image' | 'unsupported' => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    
    const textExtensions = ['txt', 'md', 'json', 'xml', 'html', 'css', 'js', 'ts', 'py', 'java', 'c', 'cpp', 'h', 'log', 'cfg', 'conf', 'ini'];
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'];
    
    if (textExtensions.includes(extension || '')) {
      return 'text';
    } else if (imageExtensions.includes(extension || '')) {
      return 'image';
    }
    
    return 'unsupported';
  };

  // Load file content for preview
  const loadFileContent = async () => {
    if (!file || file.is_directory) return;

    setLoading(true);
    setError(null);
    setContent(null);

    try {
      const blob = await apiClient.downloadFile(deviceId, file.path);
      
      if (previewType === 'text') {
        // For text files, read as text
        const text = await blob.text();
        setContent(text);
      } else if (previewType === 'image') {
        // For images, create object URL
        const imageUrl = URL.createObjectURL(blob);
        setContent(imageUrl);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '预览失败');
    } finally {
      setLoading(false);
    }
  };

  // Handle file download
  const handleDownload = async () => {
    if (!file || file.is_directory) return;

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
    } catch (err) {
      setError(err instanceof Error ? err.message : '下载失败');
    }
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Update preview type when file changes
  useEffect(() => {
    if (file && !file.is_directory) {
      const type = getPreviewType(file.name);
      setPreviewType(type);
    }
  }, [file]);

  // Load content when modal opens and file is previewable
  useEffect(() => {
    if (isOpen && file && !file.is_directory && previewType !== 'unsupported') {
      loadFileContent();
    }
    
    // Cleanup image URLs when modal closes
    return () => {
      if (content && previewType === 'image' && content.startsWith('blob:')) {
        URL.revokeObjectURL(content);
      }
    };
  }, [isOpen, file, previewType]);

  if (!isOpen || !file) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div 
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={onClose}
        />

        {/* Modal panel */}
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
          {/* Header */}
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                {previewType === 'text' && <FileText className="h-6 w-6 text-gray-400 mr-3" />}
                {previewType === 'image' && <ImageIcon className="h-6 w-6 text-gray-400 mr-3" />}
                {previewType === 'unsupported' && <Eye className="h-6 w-6 text-gray-400 mr-3" />}
                
                <div>
                  <h3 className="text-lg leading-6 font-medium text-gray-900">
                    {file.name}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {formatFileSize(file.size)} • {new Date(file.modified * 1000).toLocaleString('zh-CN')}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleDownload}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <Download className="h-4 w-4 mr-2" />
                  下载
                </button>
                
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="bg-gray-50 px-4 py-5 sm:p-6">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
                <span className="ml-3 text-gray-500">加载预览...</span>
              </div>
            )}

            {error && (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <AlertCircle className="mx-auto h-12 w-12 text-red-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">预览失败</h3>
                  <p className="mt-1 text-sm text-gray-500">{error}</p>
                  <button
                    onClick={loadFileContent}
                    className="mt-3 inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    重试
                  </button>
                </div>
              </div>
            )}

            {!loading && !error && previewType === 'unsupported' && (
              <div className="text-center py-12">
                <Eye className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">无法预览此文件</h3>
                <p className="mt-1 text-sm text-gray-500">
                  此文件类型不支持预览，您可以下载文件查看内容
                </p>
              </div>
            )}

            {!loading && !error && content && previewType === 'text' && (
              <div className="bg-white rounded-lg border">
                <div className="p-4">
                  <pre className="text-sm text-gray-900 whitespace-pre-wrap font-mono overflow-auto max-h-96">
                    {content}
                  </pre>
                </div>
              </div>
            )}

            {!loading && !error && content && previewType === 'image' && (
              <div className="bg-white rounded-lg border p-4">
                <div className="flex justify-center">
                  <img
                    src={content}
                    alt={file.name}
                    className="max-w-full max-h-96 object-contain"
                    onError={() => setError('图片加载失败')}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              onClick={onClose}
              className="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}