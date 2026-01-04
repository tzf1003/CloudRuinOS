import { useState } from 'react';
import { X, AlertTriangle, Trash2, Clock, Activity } from 'lucide-react';
import { Session } from '../types/api';
import { formatRelativeTime, formatTimestamp } from '../lib/utils';

interface SessionTerminateDialogProps {
  session: Session | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (sessionId: string, reason?: string) => void;
  isLoading?: boolean;
}

export function SessionTerminateDialog({ 
  session, 
  isOpen, 
  onClose, 
  onConfirm, 
  isLoading = false 
}: SessionTerminateDialogProps) {
  const [reason, setReason] = useState('');
  const [forceTerminate, setForceTerminate] = useState(false);

  if (!isOpen || !session) return null;

  const handleConfirm = () => {
    onConfirm(session.id, reason || undefined);
    setReason('');
    setForceTerminate(false);
  };

  const handleClose = () => {
    if (!isLoading) {
      onClose();
      setReason('');
      setForceTerminate(false);
    }
  };

  // 检查会话是否活跃
  const isActiveSession = session.status === 'active' || session.status === 'connected';
  const deviceId = session.device_id || session.deviceId || '';
  const createdAt = session.created_at || session.createdAt || 0;
  const lastActivity = session.last_activity || session.lastActivity;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-6 w-6 text-red-500" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900">
                终止会话
              </h3>
              <p className="text-sm text-gray-500">
                会话 {session.id.substring(0, 8)}...
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6">
          {/* 会话信息 */}
          <div className="mb-6 bg-gray-50 rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-900 mb-3">会话信息</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">设备 ID:</span>
                <span className="font-mono text-gray-900">{deviceId.substring(0, 8)}...</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">状态:</span>
                <span className={`font-medium ${
                  isActiveSession ? 'text-green-600' : 'text-gray-600'
                }`}>
                  {session.status === 'active' ? '活跃' : 
                   session.status === 'connected' ? '已连接' :
                   session.status === 'inactive' ? '非活跃' : 
                   session.status === 'pending' ? '等待中' : '已过期'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">创建时间:</span>
                <span className="text-gray-900">{formatRelativeTime(createdAt)}</span>
              </div>
              {lastActivity && (
                <div className="flex justify-between">
                  <span className="text-gray-500">最后活动:</span>
                  <span className="text-gray-900">{formatRelativeTime(lastActivity)}</span>
                </div>
              )}
            </div>
          </div>

          {/* 警告信息 */}
          {isActiveSession && (
            <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-md p-4">
              <div className="flex">
                <AlertTriangle className="h-5 w-5 text-yellow-400" />
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800">
                    警告：会话正在活跃使用中
                  </h3>
                  <div className="mt-2 text-sm text-yellow-700">
                    <p>此会话当前处于活跃状态，可能有正在进行的操作。强制终止可能导致数据丢失或操作中断。</p>
                  </div>
                  <div className="mt-3">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={forceTerminate}
                        onChange={(e) => setForceTerminate(e.target.checked)}
                        className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                      />
                      <span className="ml-2 text-sm text-yellow-800">
                        我了解风险，强制终止会话
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 终止原因 */}
          <div className="mb-6">
            <label htmlFor="terminate-reason" className="block text-sm font-medium text-gray-700 mb-2">
              终止原因 (可选)
            </label>
            <textarea
              id="terminate-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isLoading}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 disabled:bg-gray-100"
              placeholder="请输入终止会话的原因..."
            />
            <p className="mt-1 text-xs text-gray-500">
              此信息将记录到审计日志中
            </p>
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center justify-end space-x-3">
            <button
              onClick={handleClose}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              disabled={isLoading || (isActiveSession && !forceTerminate)}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  终止中...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  确认终止
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}