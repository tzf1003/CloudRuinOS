import { Monitor, Cpu, HardDrive, Terminal } from 'lucide-react';
import { Device } from '../types/api';
import { getDeviceStatusColor, cn } from '../lib/utils';
import { Card } from './ui/Card';

interface DeviceCardProps {
  device: Device;
  onSelect?: (device: Device) => void;
}

export function DeviceCard({ device, onSelect }: DeviceCardProps) {
  const statusColor = getDeviceStatusColor(device.status);
  
  return (
    <Card 
      variant="glass"
      className={cn(
        "group cursor-pointer hover:border-cyan-500/30 transition-all active:scale-[0.98]",
        onSelect && "hover:bg-slate-800/80"
      )}
      onClick={() => onSelect?.(device)}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-4 min-w-0">
          <div className="flex-shrink-0 p-3 rounded-xl bg-slate-900/50 border border-slate-700/50 group-hover:border-cyan-500/30 group-hover:shadow-[0_0_15px_-5px_var(--color-cyan-500)] transition-all">
            <Monitor className="h-6 w-6 text-slate-400 group-hover:text-cyan-400 transition-colors" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h3 className="text-base font-semibold text-slate-200 truncate group-hover:text-cyan-300 transition-colors">
                {device.id}
              </h3>
              <span className={cn(
                "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium shadow-sm",
                statusColor
              )}>
                {device.status === 'online' ? '在线' :
                 device.status === 'offline' ? '离线' : '忙碌'}
              </span>
            </div>
            
            <div className="flex items-center space-x-4 mt-2">
              <div className="flex items-center space-x-1.5 text-xs text-slate-500 group-hover:text-slate-400 transition-colors">
                <Cpu className="h-3.5 w-3.5" />
                <span>{device.platform}</span>
              </div>
              <div className="flex items-center space-x-1.5 text-xs text-slate-500 group-hover:text-slate-400 transition-colors">
                <HardDrive className="h-3.5 w-3.5" />
                <span>v{device.version}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-cyan-500/20 hover:text-cyan-300">
                <Terminal className="w-4 h-4" />
            </div>
        </div>
      </div>
      
      {/* Decorative gradient bar at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
    </Card>
  );
}
