import { Monitor, Clock, Cpu, HardDrive } from 'lucide-react';
import { Device } from '../types/api';
import { formatRelativeTime, getDeviceStatusColor, cn } from '../lib/utils';

interface DeviceCardProps {
  device: Device;
  onSelect?: (device: Device) => void;
}

export function DeviceCard({ device, onSelect }: DeviceCardProps) {
  const statusColor = getDeviceStatusColor(device.status);
  
  return (
    <div 
      className={cn(
        "bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer",
        onSelect && "hover:border-blue-300"
      )}
      onClick={() => onSelect?.(device)}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            <Monitor className="h-8 w-8 text-gray-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-medium text-gray-900 truncate">
                {device.id}
              </h3>
              <span className={cn(
                "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                statusColor
              )}>
                {device.status === 'online' ? '在线' : 
                 device.status === 'offline' ? '离线' : '忙碌'}
              </span>
            </div>
            <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500">
              <div className="flex items-center space-x-1">
                <Cpu className="h-3 w-3" />
                <span>{device.platform}</span>
              </div>
              <div className="flex items-center space-x-1">
                <HardDrive className="h-3 w-3" />
                <span>v{device.version}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center space-x-1">
          <Clock className="h-3 w-3" />
          <span>最后活动: {formatRelativeTime(device.lastSeen)}</span>
        </div>
        <div>
          注册于: {new Date((device.createdAt || 0) * 1000).toLocaleDateString('zh-CN')}
        </div>
      </div>
    </div>
  );
}