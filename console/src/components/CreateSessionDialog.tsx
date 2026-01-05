import { useState } from 'react';
import { X, Monitor } from 'lucide-react';
import { useDevices, useCreateSession } from '../hooks/useApi';
import { Device } from '../types/api';

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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            创建实时会话
          </h3>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              选择目标设备
            </label>
            {onlineDevices.length === 0 ? (
              <div className="text-sm text-gray-500 p-3 bg-gray-50 rounded-md">
                当前没有在线设备可用于创建会话
              </div>
            ) : (
              <select
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">请选择设备...</option>
                {onlineDevices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.id} ({device.platform})
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedDeviceId && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
              <div className="flex items-center space-x-2">
                <Monitor className="h-4 w-4 text-blue-600" />
                <div className="text-sm text-blue-800">
                  <div className="font-medium">
                    {devices.find(d => d.id === selectedDeviceId)?.id}
                  </div>
                  <div>
                    平台: {devices.find(d => d.id === selectedDeviceId)?.platform}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
            <p className="text-sm text-yellow-800">
              会话将允许您与设备进行实时通信，包括执行命令和管理文件。会话默认30分钟后过期。
            </p>
          </div>

          <div className="flex justify-end space-x-3">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              取消
            </button>
            <button
              onClick={handleCreate}
              disabled={!selectedDeviceId || createSession.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {createSession.isPending ? '创建中...' : '创建会话'}
            </button>
          </div>

          {createSession.error ? (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-sm text-red-800">
                创建会话失败: {(createSession.error as any)?.message || '未知错误'}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}