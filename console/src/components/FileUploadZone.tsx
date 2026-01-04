import React, { useState, useCallback, useRef } from 'react';
import { 
  Upload, 
  X, 
  CheckCircle, 
  AlertCircle, 
  File,
  RefreshCw
} from 'lucide-react';
import { apiClient } from '../lib/api-client';

interface FileUploadZoneProps {
  deviceId: string;
  targetPath: string;
  onUploadComplete: (files: UploadedFile[]) => void;
  onUploadError: (error: string) => void;
  maxFiles?: number;
  maxFileSize?: number; // in bytes
  acceptedTypes?: string[];
}

interface UploadedFile {
  name: string;
  path: string;
  size: number;
}

interface UploadProgress {
  file: File;
  progress: number;
  status: 'uploading' | 'success' | 'error';
  error?: string;
}

export function FileUploadZone({
  deviceId,
  targetPath,
  onUploadComplete,
  onUploadError,
  maxFiles = 10,
  maxFileSize = 100 * 1024 * 1024, // 100MB default
  acceptedTypes = []
}: FileUploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Map<string, UploadProgress>>(new Map());
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle drag events
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  }, [deviceId, targetPath, maxFiles, maxFileSize, acceptedTypes]);

  // Handle file input change
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleFiles(files);
    
    // Reset input value to allow selecting the same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [deviceId, targetPath, maxFiles, maxFileSize, acceptedTypes]);

  // Validate and process files
  const handleFiles = useCallback((files: File[]) => {
    // Validate file count
    if (files.length > maxFiles) {
      onUploadError(`最多只能上传 ${maxFiles} 个文件`);
      return;
    }

    // Validate each file
    const validFiles: File[] = [];
    const errors: string[] = [];

    files.forEach(file => {
      // Check file size
      if (file.size > maxFileSize) {
        errors.push(`文件 "${file.name}" 超过最大大小限制 (${formatFileSize(maxFileSize)})`);
        return;
      }

      // Check file type if restrictions exist
      if (acceptedTypes.length > 0) {
        const fileExtension = file.name.split('.').pop()?.toLowerCase();
        const mimeType = file.type.toLowerCase();
        
        const isAccepted = acceptedTypes.some(type => {
          if (type.startsWith('.')) {
            return fileExtension === type.substring(1);
          }
          if (type.includes('/')) {
            return mimeType === type || mimeType.startsWith(type.replace('*', ''));
          }
          return false;
        });

        if (!isAccepted) {
          errors.push(`文件 "${file.name}" 类型不被支持`);
          return;
        }
      }

      validFiles.push(file);
    });

    // Show errors if any - this should prevent upload
    if (errors.length > 0) {
      onUploadError(errors.join('\n'));
      return; // Critical fix: return early to prevent upload
    }

    // Upload valid files only if no errors
    if (validFiles.length > 0) {
      uploadFiles(validFiles);
    }
  }, [maxFiles, maxFileSize, acceptedTypes, onUploadError]);

  // Upload files
  const uploadFiles = useCallback(async (files: File[]) => {
    setIsUploading(true);
    const newProgress = new Map<string, UploadProgress>();
    
    // Initialize progress for all files
    files.forEach(file => {
      newProgress.set(file.name, {
        file,
        progress: 0,
        status: 'uploading'
      });
    });
    
    setUploadProgress(newProgress);

    const uploadedFiles: UploadedFile[] = [];
    const uploadPromises = files.map(async (file) => {
      try {
        // Simulate progress updates (since the API doesn't provide real progress)
        const progressInterval = setInterval(() => {
          setUploadProgress(prev => {
            const updated = new Map(prev);
            const current = updated.get(file.name);
            if (current && current.status === 'uploading' && current.progress < 90) {
              updated.set(file.name, {
                ...current,
                progress: Math.min(current.progress + Math.random() * 20, 90)
              });
            }
            return updated;
          });
        }, 500);

        // Convert file to base64 for upload
        const fileContent = await fileToBase64(file);
        const checksum = await calculateChecksum(fileContent);
        
        // Construct target file path
        const filePath = targetPath === '/' 
          ? `/${file.name}` 
          : `${targetPath}/${file.name}`;

        // Upload file
        await apiClient.uploadFile(deviceId, filePath, file);

        // Clear progress interval
        clearInterval(progressInterval);

        // Update progress to success
        setUploadProgress(prev => {
          const updated = new Map(prev);
          updated.set(file.name, {
            file,
            progress: 100,
            status: 'success'
          });
          return updated;
        });

        uploadedFiles.push({
          name: file.name,
          path: filePath,
          size: file.size
        });

      } catch (error) {
        // Clear progress interval
        const progressInterval = setInterval(() => {}, 0);
        clearInterval(progressInterval);

        // Update progress to error
        setUploadProgress(prev => {
          const updated = new Map(prev);
          updated.set(file.name, {
            file,
            progress: 0,
            status: 'error',
            error: error instanceof Error ? error.message : '上传失败'
          });
          return updated;
        });

        console.error(`Upload failed for ${file.name}:`, error);
      }
    });

    // Wait for all uploads to complete
    await Promise.allSettled(uploadPromises);
    
    setIsUploading(false);

    // Call completion callback with successfully uploaded files
    if (uploadedFiles.length > 0) {
      onUploadComplete(uploadedFiles);
    }

    // Clear progress after a delay
    setTimeout(() => {
      setUploadProgress(new Map());
    }, 3000);
  }, [deviceId, targetPath, onUploadComplete]);

  // Convert file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

  // Calculate simple checksum (MD5 would be better but this is a simple implementation)
  const calculateChecksum = async (content: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Remove file from upload queue
  const removeFile = (fileName: string) => {
    setUploadProgress(prev => {
      const updated = new Map(prev);
      updated.delete(fileName);
      return updated;
    });
  };

  const progressEntries = Array.from(uploadProgress.entries());

  return (
    <div className="space-y-4">
      {/* Upload Zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragOver
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400'
        } ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Upload className="mx-auto h-12 w-12 text-gray-400" />
        <div className="mt-4">
          <p className="text-lg font-medium text-gray-900">
            拖拽文件到此处上传
          </p>
          <p className="text-sm text-gray-500 mt-1">
            或者{' '}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-blue-600 hover:text-blue-800 font-medium"
              disabled={isUploading}
            >
              点击选择文件
            </button>
          </p>
        </div>
        
        <div className="mt-4 text-xs text-gray-500">
          <p>最多 {maxFiles} 个文件，每个文件最大 {formatFileSize(maxFileSize)}</p>
          {acceptedTypes.length > 0 && (
            <p>支持的文件类型: {acceptedTypes.join(', ')}</p>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileInputChange}
          accept={acceptedTypes.join(',')}
          disabled={isUploading}
        />
      </div>

      {/* Upload Progress */}
      {progressEntries.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-900">上传进度</h3>
          
          {progressEntries.map(([fileName, progress]) => (
            <div key={fileName} className="bg-white border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <File className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{fileName}</p>
                    <p className="text-xs text-gray-500">
                      {formatFileSize(progress.file.size)}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  {progress.status === 'uploading' && (
                    <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
                  )}
                  {progress.status === 'success' && (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  )}
                  {progress.status === 'error' && (
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  )}
                  
                  <button
                    onClick={() => removeFile(fileName)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              
              {/* Progress Bar */}
              {progress.status === 'uploading' && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                    <span>上传中...</span>
                    <span>{Math.round(progress.progress)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${progress.progress}%` }}
                    />
                  </div>
                </div>
              )}
              
              {/* Success Message */}
              {progress.status === 'success' && (
                <div className="mt-2 text-xs text-green-600">
                  上传成功
                </div>
              )}
              
              {/* Error Message */}
              {progress.status === 'error' && (
                <div className="mt-2 text-xs text-red-600">
                  {progress.error || '上传失败'}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}