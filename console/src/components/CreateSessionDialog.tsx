import { useState } from 'react';
import { X, Monitor, Terminal, AlertTriangle } from 'lucide-react';
import { useDevices, useCreateSession } from '../hooks/useApi';
import { Device } from '../types/api';
import { Card } from './ui/Card';
import { cn } from '../lib/utils';

interface CreateSessionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedDevice?: Device;
}

export function CreateSessionDialog({ isOpen, onClose, preselectedDevice }: CreateSessionDialogProps) {
  const [selectedDeviceId, setSelectedDeviceId] = useState(preselectedDevice?.id || '');
  const { data: devices = [] } = useDevices();
  const createSession = useCreateSession();

  const onlineDevices = devices.filter(device => device.status === 'online');

  const handleCreate = () => {
    if (selectedDeviceId) {
      createSession.mutate(
        { deviceId: selectedDeviceId },
        {
          onSuccess: () => {
            onClose();
            setSelectedDeviceId('');
          }
        }
      );
    }
  };

  const handleClose = () => {
    createSession.reset();
    setSelectedDeviceId(preselectedDevice?.id || '');
    onClose();
  };

  if (!isOpen) return null;

  const selectedDevice = devices.find(d => d.id === selectedDeviceId);

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <Card variant="glass" className="w-full max-w-md p-0 border-slate-700/50 shadow-2xl zoom-in-95 animate-in duration-200">
        <div className="flex items-center justify-between p-6 border-b border-slate-700/50 bg-slate-900/50">
          <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Terminal className="h-5 w-5 text-cyan-400" />
            创建实时会话
          </h3>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 bg-slate-950/30">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">
              选择目标设备
            </label>
            {onlineDevices.length === 0 ? (
              <div className="text-sm text-slate-400 p-4 bg-slate-900/50 border border-slate-800 rounded-lg text-center italic">
                没有可用的在线设备来创建会话。
              </div>
            ) : (
              <select
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                className="w-full bg-slate-900/80 border border-slate-700 text-slate-200 text-sm rounded-lg p-3 focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all"
              >
                <option value="" className="bg-slate-900 text-slate-500">选择设备...</option>
                {onlineDevices.map((device) => (
                  <option key={device.id} value={device.id} className="bg-slate-900 text-slate-200">
                    {device.id} ({device.platform}) - 在线
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedDevice && (
            <div className="bg-cyan-900/10 border border-cyan-500/20 rounded-lg p-4 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-start space-x-3">
                <div className="p-2 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
                     <Monitor className="h-4 w-4 text-cyan-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-cyan-100 truncate">
                    {selectedDevice.id}
                  </div>
                  <div className="text-xs text-cyan-400/80 mt-0.5 uppercase tracking-wide">
                    平台: {selectedDevice.platform}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="bg-amber-900/10 border border-amber-500/20 rounded-lg p-4 flex gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
            <p className="text-xs text-amber-200/80 leading-relaxed">
              会话允许实时通信、命令执行和文件管理。会话在 30 分钟无活动后自动过期。
            </p>
          </div>

          <div className="flex justify-end space-x-3 pt-2">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 hover:text-white transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleCreate}
              disabled={!selectedDeviceId || createSession.isPending}
              className="px-4 py-2 text-sm font-bold text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-lg shadow-lg shadow-cyan-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {createSession.isPending ? '创建中...' : '创建会话'}
            </button>
          </div>

          {createSession.error ? (
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 animate-in shake">
              <p className="text-sm text-red-300">
                创建会话失败: {(createSession.error as any)?.message || '未知错误'}
              </p>
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
