import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  FolderOpen, 
  Upload, 
  RefreshCw, 
  ChevronRight,
  Home,
  Monitor,
  Server
} from 'lucide-react';
import { apiClient } from '../lib/api-client';
import { Device, FileInfo } from '../types/api';
import { FileExplorer } from '../components/FileExplorer';
import { FileUploadZone } from '../components/FileUploadZone';
import { Card } from '../components/ui/Card';
import { cn } from '../lib/utils';
import { useNotifications } from '../contexts/UIContext';

export function FileManagerPage() {
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [currentPath, setCurrentPath] = useState<string>('/');
  const [showUploadZone, setShowUploadZone] = useState(false);
  const { addNotification } = useNotifications();

  // Fetch devices
  const { 
    data: devices = [], 
    isLoading: devicesLoading, 
  } = useQuery({
    queryKey: ['devices'],
    queryFn: () => apiClient.getDevices(),
  });

  // Fetch files for selected device and path
  const { 
    data: files = [], 
    isLoading: filesLoading, 
    refetch: refetchFiles 
  } = useQuery({
    queryKey: ['files', selectedDevice?.id, currentPath],
    queryFn: () => selectedDevice ? apiClient.listFiles(selectedDevice.id, currentPath) : Promise.resolve([]),
    enabled: !!selectedDevice,
  });

  // Get online devices only
  const onlineDevices = devices.filter(device => device.status === 'online');

  // Auto-select first online device if none selected
  useEffect(() => {
    if (!selectedDevice && onlineDevices.length > 0) {
        setSelectedDevice(onlineDevices[0]);
    }
  }, [onlineDevices, selectedDevice]);

  const handleDeviceSelect = (device: Device) => {
    setSelectedDevice(device);
    setCurrentPath('/');
  };

  const generateBreadcrumb = () => {
    if (currentPath === '/') return [{ name: '根目录', path: '/' }];

    const parts = currentPath.split('/').filter(Boolean);
    const breadcrumb = [{ name: '根目录', path: '/' }];

    let currentBreadcrumbPath = '';
    parts.forEach(part => {
      currentBreadcrumbPath += `/${part}`;
      breadcrumb.push({ name: part, path: currentBreadcrumbPath });
    });

    return breadcrumb;
  };

  const breadcrumb = generateBreadcrumb();

  return (
    <div className="space-y-6 h-[calc(100vh-100px)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">文件管理器</h1>
          <p className="text-sm text-slate-400 mt-1">管理远程文件系统</p>
        </div>
        
        <div className="flex items-center space-x-3">
          <button
            onClick={() => refetchFiles()}
            disabled={!selectedDevice || filesLoading}
            className="inline-flex items-center px-3 py-2 rounded-lg border border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800 hover:text-white transition-all shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${filesLoading ? 'animate-spin' : ''}`} />
            刷新
          </button>

          <button
            onClick={() => setShowUploadZone(!showUploadZone)}
            disabled={!selectedDevice}
            className={cn(
                "inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-all shadow-sm",
                showUploadZone
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                    : "bg-cyan-600 text-white hover:bg-cyan-500 hover:shadow-[0_0_15px_-3px_rgba(6,182,212,0.4)]"
            )}
          >
            <Upload className="h-4 w-4 mr-2" />
            {showUploadZone ? '隐藏上传' : '上传文件'}
          </button>
        </div>
      </div>

      <div className="flex gap-6 flex-1 min-h-0">
        {/* Device Sidebar */}
        <Card variant="glass" className="w-64 flex flex-col p-0 overflow-hidden flex-shrink-0">
            <div className="p-4 border-b border-slate-700/50 bg-slate-900/30">
                <h3 className="font-semibold text-slate-200 flex items-center gap-2">
                    <Server className="w-4 h-4 text-cyan-400" />
                    在线设备
                </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {onlineDevices.length > 0 ? (
                    onlineDevices.map(device => (
                        <button
                            key={device.id}
                            onClick={() => handleDeviceSelect(device)}
                            className={cn(
                                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all text-left",
                                selectedDevice?.id === device.id 
                                    ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20" 
                                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                            )}
                        >
                            <Monitor className="w-4 h-4" />
                            <div className="flex-1 min-w-0">
                                <span className="block truncate font-medium">{device.id}</span>
                                <span className="block truncate text-xs opacity-70">{device.platform}</span>
                            </div>
                            {selectedDevice?.id === device.id && (
                                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_var(--color-cyan-400)]" />
                            )}
                        </button>
                    ))
                ) : (
                    <div className="text-center py-8 px-4 text-slate-500">
                        <Server className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">没有在线设备</p>
                    </div>
                )}
            </div>
        </Card>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0 bg-transparent gap-4">
            {selectedDevice ? (
                <>
                     {/* Breadcrumb */}
                    <Card variant="default" className="p-2 flex items-center gap-1 bg-slate-900/50 border-slate-800 text-sm overflow-x-auto whitespace-nowrap scrollbar-hide">
                        <button 
                            onClick={() => setCurrentPath('/')}
                            className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-cyan-400 transition-colors"
                        >
                            <Home className="w-4 h-4" />
                        </button>
                        {breadcrumb.map((item, index) => (
                            <React.Fragment key={item.path}>
                                <ChevronRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
                                <button
                                    onClick={() => setCurrentPath(item.path)}
                                    className={cn(
                                        "px-2 py-1 rounded-md transition-colors",
                                        index === breadcrumb.length - 1
                                            ? "text-cyan-300 font-medium bg-cyan-500/10"
                                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                                    )}
                                >
                                    {item.name}
                                </button>
                            </React.Fragment>
                        ))}
                    </Card>

                    {showUploadZone && (
                        <div className="animate-in fade-in slide-in-from-top-4 duration-300">
                            <FileUploadZone 
                                deviceId={selectedDevice.id}
                                targetPath={currentPath}
                                onUploadComplete={(uploaded) => {
                                    addNotification({
                                        type: 'success',
                                        title: '上传完成',
                                        message: `成功上传 ${uploaded.length} 个文件`
                                    });
                                    refetchFiles();
                                }}
                                onUploadError={(err) => {
                                     addNotification({
                                        type: 'error',
                                        title: '上传失败',
                                        message: err
                                    });
                                }}
                            />
                        </div>
                    )}

                    <div className="flex-1 min-h-0">
                         <FileExplorer 
                            deviceId={selectedDevice.id}
                            currentPath={currentPath}
                            files={files}
                            loading={filesLoading}
                            onPathChange={setCurrentPath}
                            onRefresh={refetchFiles}
                         />
                    </div>
                </>
            ) : (
                 <div className="flex-1 flex flex-col items-center justify-center text-slate-500 border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/20">
                    <Monitor className="w-16 h-16 mb-4 text-slate-700" />
                    <h3 className="text-lg font-medium text-slate-300">选择设备</h3>
                    <p>从侧边栏选择一个在线设备以管理文件</p>
                 </div>
            )}
        </div>
      </div>
    </div>
  );
}
