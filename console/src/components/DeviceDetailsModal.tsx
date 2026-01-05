import { X, Monitor, Cpu, HardDrive, Key } from 'lucide-react';
import { Device } from '../types/api';
import { formatTimestamp, formatRelativeTime, getDeviceStatusColor, cn } from '../lib/utils';

interface DeviceDetailsModalProps {
  device: Device | null;
  isOpen: boolean;
  onClose: () => void;
}

export function DeviceDetailsModal({ device, isOpen, onClose }: DeviceDetailsModalProps) {
  if (!isOpen || !device) return null;

  const statusColor = getDeviceStatusColor(device.status);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <Monitor className="h-6 w-6 text-gray-400" />
            <div>
              <h3 className="text-lg font-medium text-gray-900">
                设备详情
              </h3>
              <p className="text-sm text-gray-500">
                {device.id}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Status Section */}
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-3">状态信息</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">当前状态</span>
                  <span className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                    statusColor
                  )}>
                    {device.status === 'online' ? '在线' : 
                     device.status === 'offline' ? '离线' : '忙碌'}
                  </span>
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">最后活动</span>
                  <span className="text-sm font-medium text-gray-900">
                    {formatRelativeTime(device.lastSeen)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* System Information */}
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-3">系统信息</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center space-x-2 mb-1">
                  <Cpu className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-600">操作系统</span>
                </div>
                <span className="text-sm font-medium text-gray-900">
                  {device.platform}
                </span>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center space-x-2 mb-1">
                  <HardDrive className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-600">Agent 版本</span>
                </div>
                <span className="text-sm font-medium text-gray-900">
                  v{device.version}
                </span>
              </div>
            </div>
          </div>

          {/* Security Information */}
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-3">安全信息</h4>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center space-x-2 mb-2">
                <Key className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-600">公钥指纹</span>
              </div>
              <div className="text-xs font-mono text-gray-700 bg-white rounded border p-2 break-all">
                {device.publicKey.substring(0, 64)}...
              </div>
            </div>
          </div>

          {/* Timeline Information */}
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-3">时间线</h4>
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0">
                  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-900">设备注册</span>
                    <span className="text-xs text-gray-500">
                      {formatTimestamp(device.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0">
                  <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-900">最后更新</span>
                    <span className="text-xs text-gray-500">
                      {formatTimestamp(device.updatedAt)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0">
                  <div className={cn(
                    "w-2 h-2 rounded-full",
                    device.status === 'online' ? 'bg-green-400' : 'bg-gray-400'
                  )}></div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-900">最后心跳</span>
                    <span className="text-xs text-gray-500">
                      {formatTimestamp(device.lastSeen)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              关闭
            </button>
            <button
              disabled={device.status !== 'online'}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              创建会话
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}