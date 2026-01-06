import React, { useState, useCallback, useRef } from 'react';
import { 
  Upload, 
  X, 
  CheckCircle, 
  AlertCircle, 
  File
} from 'lucide-react';
import { apiClient } from '../lib/api-client';
import { cn } from '../lib/utils';
import { Card } from './ui/Card';

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
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      handleFiles(files);
    }
  }, []);

  const handleFiles = (files: File[]) => {
    if (isUploading) return;

    // Validation
    if (files.length > maxFiles) {
      onUploadError(`Maximum ${maxFiles} files allowed`);
      return;
    }

    const validFiles = files.filter(file => {
      if (file.size > maxFileSize) {
        onUploadError(`File ${file.name} is too large (max ${maxFileSize / 1024 / 1024}MB)`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    // Initialize progress
    const newProgress = new Map(uploadProgress);
    validFiles.forEach(file => {
      newProgress.set(file.name, {
        file,
        progress: 0,
        status: 'uploading'
      });
    });
    setUploadProgress(newProgress);
    
    uploadFiles(validFiles);
  };

  const uploadFiles = async (files: File[]) => {
    setIsUploading(true);
    const uploadedFiles: UploadedFile[] = [];

    for (const file of files) {
      try {
        // Update progress to started
        setUploadProgress(prev => {
          const newMap = new Map(prev);
          const item = newMap.get(file.name);
          if (item) {
            newMap.set(file.name, { ...item, progress: 10 });
          }
          return newMap;
        });

        // Actual upload
        await apiClient.uploadFile(deviceId, targetPath, file, (progress) => {
             setUploadProgress(prev => {
                const newMap = new Map(prev);
                const item = newMap.get(file.name);
                if (item) {
                    newMap.set(file.name, { ...item, progress });
                }
                return newMap;
            });
        });

        setUploadProgress(prev => {
          const newMap = new Map(prev);
          const item = newMap.get(file.name);
          if (item) {
            newMap.set(file.name, { ...item, progress: 100, status: 'success' });
          }
          return newMap;
        });

        uploadedFiles.push({
          name: file.name,
          path: `${targetPath}/${file.name}`.replace('//', '/'),
          size: file.size
        });
      } catch (error) {
        console.error(`Error uploading ${file.name}:`, error);
        setUploadProgress(prev => {
          const newMap = new Map(prev);
          const item = newMap.get(file.name);
          if (item) {
            newMap.set(file.name, { 
              ...item, 
              status: 'error', 
              error: error instanceof Error ? error.message : 'Upload failed' 
            });
          }
          return newMap;
        });
      }
    }

    setIsUploading(false);
    if (uploadedFiles.length > 0) {
      onUploadComplete(uploadedFiles);
    }
  };

  const removeFile = (fileName: string) => {
    setUploadProgress(prev => {
      const newMap = new Map(prev);
      newMap.delete(fileName);
      return newMap;
    });
  };

  const progressArray = Array.from(uploadProgress.values());

  return (
    <div className="space-y-4">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300",
          isDragOver 
            ? "border-cyan-500 bg-cyan-500/10 shadow-[0_0_30px_-5px_var(--color-cyan-500)]" 
            : "border-slate-700 hover:border-cyan-500/50 hover:bg-slate-800/50 bg-slate-900/30",
          isUploading && "pointer-events-none opacity-50"
        )}
      >
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          multiple
          onChange={handleFileSelect}
        />
        
        <div className="pointer-events-none">
          <div className={cn(
            "p-3 rounded-full bg-slate-800 inline-block mb-3 transition-colors",
            isDragOver ? "text-cyan-400 bg-cyan-500/20" : "text-slate-400"
          )}>
            <Upload className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-slate-200">
            Click to upload or drag and drop
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Max file size {maxFileSize / 1024 / 1024}MB
          </p>
        </div>
      </div>

      {progressArray.length > 0 && (
        <Card variant="default" className="bg-slate-900/50 border-slate-800">
          <ul className="divide-y divide-slate-800/50">
            {progressArray.map((item) => (
              <li key={item.file.name} className="py-3 px-4 flex items-center justify-between group">
                <div className="flex items-center space-x-3 w-full max-w-[70%]">
                  {item.status === 'success' ? (
                    <CheckCircle className="h-5 w-5 text-emerald-400" />
                  ) : item.status === 'error' ? (
                    <AlertCircle className="h-5 w-5 text-red-400" />
                  ) : (
                    <File className="h-5 w-5 text-slate-400" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-300 truncate">
                      {item.file.name}
                    </p>
                    {item.status === 'uploading' && (
                       <div className="w-full h-1 mt-2 bg-slate-800 rounded-full overflow-hidden">
                          <div 
                                className="h-full bg-cyan-500 rounded-full transition-all duration-300 ease-out"
                                style={{ width: `${item.progress}%` }}
                          />
                       </div>
                    )}
                     {item.status === 'error' && (
                        <p className="text-xs text-red-400 mt-0.5">{item.error}</p>
                     )}
                  </div>
                </div>
                
                <div className="flex items-center">
                    {item.status === 'uploading' && (
                        <span className="text-xs text-cyan-400 font-mono mr-3">{Math.round(item.progress)}%</span>
                    )}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            removeFile(item.file.name);
                        }}
                        className="text-slate-500 hover:text-red-400 p-1 rounded-md transition-colors"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
