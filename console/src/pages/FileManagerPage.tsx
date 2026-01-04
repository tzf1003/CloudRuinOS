import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  FolderOpen, 
  Upload, 
  Download, 
  RefreshCw, 
  ChevronRight,
  Home,
  AlertCircle
} from 'lucide-react';
import { apiClient } from '../lib/api-client';
import { Device, FileInfo } from '../types/api';
import { FileExplorer } from '../components/FileExplorer';
import { FileUploadZone } from '../components/FileUploadZone';

export function FileManagerPage() {
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [currentPath, setCurrentPath] = useState<string>('/');
  const [showUploadZone, setShowUploadZone] = useState(false);

  // Fetch devices
  const { 
    data: devices = [], 
    isLoading: devicesLoading, 
    error: devicesError 
  } = useQuery({
    queryKey: ['devices'],
    queryFn: () => apiClient.getDevices(),
  });

  // Fetch files for selected device and path
  const { 
    data: files = [], 
    isLoading: filesLoading, 
    error: filesError,
    refetch: refetchFiles 
  } = useQuery({
    queryKey: ['files', selectedDevice?.id, currentPath],
    queryFn: () => selectedDevice ? apiClient.listFiles(selectedDevice.id, currentPath) : Promise.resolve([]),
    enabled: !!selectedDevice,
  });

  // Get online devices only
  const onlineDevices = devices.filter(device => device.status === 'online');

  // Handle device selection
  const handleDeviceSelect = (device: Device) => {
    setSelectedDevice(device);
    setCurrentPath('/'); // Reset to root when switching devices
  };

  // Handle path navigation
  const handlePathChange = (newPath: string) => {
    setCurrentPath(newPath);
  };

  // Handle file refresh
  const handleRefresh = () => {
    refetchFiles();
  };

  // Generate breadcrumb from current path
  const generateBreadcrumb = () => {
    if (currentPath === '/') return [{ name: 'Root', path: '/' }];
    
    const parts = currentPath.split('/').filter(Boolean);
    const breadcrumb = [{ name: 'Root', path: '/' }];
    
    let currentBreadcrumbPath = '';
    parts.forEach(part => {
      currentBreadcrumbPath += `/${part}`;
      breadcrumb.push({ name: part, path: currentBreadcrumbPath });
    });
    
    return breadcrumb;
  };

  const breadcrumb = generateBreadcrumb();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">文件管理</h1>
          <p className="text-gray-600">管理远程设备上的文件和目录</p>
        </div>
        
        <div className="flex items-center space-x-3">
          <button
            onClick={handleRefresh}
            disabled={!selectedDevice || filesLoading}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${filesLoading ? 'animate-spin' : ''}`} />
            刷新
          </button>
          
          <button
            onClick={() => setShowUploadZone(!showUploadZone)}
            disabled={!selectedDevice}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload className="h-4 w-4 mr-2" />
            上传文件
          </button>
        </div>
      </div>

      {/* Device Selector */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">选择设备</h2>
        
        {devicesLoading && (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-500">加载设备列表...</span>
          </div>
        )}

        {devicesError && (
          <div className="flex items-center p-4 bg-red-50 rounded-md">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <span className="ml-2 text-red-700">加载设备列表失败</span>
          </div>
        )}

        {!devicesLoading && !devicesError && (
          <>
            {onlineDevices.length === 0 ? (
              <div className="text-center py-8">
                <FolderOpen className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">没有在线设备</h3>
                <p className="mt-1 text-sm text-gray-500">
                  当前没有在线的设备可用于文件管理
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {onlineDevices.map((device) => (
                  <button
                    key={device.id}
                    onClick={() => handleDeviceSelect(device)}
                    className={`p-4 border rounded-lg text-left transition-colors ${
                      selectedDevice?.id === device.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-green-400 rounded-full mr-3"></div>
                      <div>
                        <h3 className="font-medium text-gray-900">
                          {device.name || device.deviceId}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {device.platform} {device.version}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* File Explorer */}
      {selectedDevice && (
        <div className="bg-white shadow rounded-lg">
          {/* Path Navigation */}
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center space-x-2">
              <Home className="h-4 w-4 text-gray-400" />
              <nav className="flex items-center space-x-2">
                {breadcrumb.map((item, index) => (
                  <React.Fragment key={item.path}>
                    {index > 0 && <ChevronRight className="h-4 w-4 text-gray-400" />}
                    <button
                      onClick={() => handlePathChange(item.path)}
                      className={`text-sm font-medium ${
                        index === breadcrumb.length - 1
                          ? 'text-gray-900'
                          : 'text-blue-600 hover:text-blue-800'
                      }`}
                      disabled={index === breadcrumb.length - 1}
                    >
                      {item.name}
                    </button>
                  </React.Fragment>
                ))}
              </nav>
            </div>
          </div>

          {/* File List */}
          <div className="p-6">
            {filesError && (
              <div className="flex items-center p-4 bg-red-50 rounded-md mb-4">
                <AlertCircle className="h-5 w-5 text-red-400" />
                <span className="ml-2 text-red-700">加载文件列表失败</span>
              </div>
            )}

            <FileExplorer
              deviceId={selectedDevice.id}
              currentPath={currentPath}
              files={files}
              loading={filesLoading}
              onPathChange={handlePathChange}
              onRefresh={handleRefresh}
            />
          </div>
        </div>
      )}

      {/* Upload Zone */}
      {selectedDevice && showUploadZone && (
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-gray-900">上传文件</h2>
            <button
              onClick={() => setShowUploadZone(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>
          
          <FileUploadZone
            deviceId={selectedDevice.id}
            targetPath={currentPath}
            onUploadComplete={() => {
              refetchFiles();
              setShowUploadZone(false);
            }}
            onUploadError={(error) => {
              console.error('Upload error:', error);
            }}
          />
        </div>
      )}
    </div>
  );
}