import { useState } from 'react';
import { X, AlertTriangle, Trash2 } from 'lucide-react';
import { Session } from '../types/api';
import { formatRelativeTime } from '../lib/utils';
import { Card } from './ui/Card';
import { cn } from '../lib/utils';

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

  // Check activity
  const isActiveSession = session.status === 'active' || session.status === 'connected';
  const deviceId = session.deviceId || '';
  const createdAt = session.createdAt || 0;
  const lastActivity = session.lastActivity;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <Card variant="glass" className="w-full max-w-md p-0 border-red-500/20 shadow-2xl shadow-red-900/10 zoom-in-95 animate-in duration-200">
        <div className="flex items-center justify-between p-6 border-b border-red-500/20 bg-red-950/10">
          <h3 className="text-lg font-bold text-red-100 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            终止会话
          </h3>
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 bg-slate-950/30">
          {/* Target Info */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 space-y-2">
            <div className="flex justify-between items-center text-sm border-b border-slate-800 pb-2">
               <span className="text-slate-500">会话 ID</span>
               <span className="text-slate-200 font-mono">{session.id.substring(0, 8)}...</span>
            </div>
             <div className="flex justify-between items-center text-sm border-b border-slate-800 pb-2">
               <span className="text-slate-500">设备</span>
               <span className="text-slate-200 font-mono">{deviceId.substring(0, 8)}...</span>
            </div>
             <div className="flex justify-between items-center text-sm pt-1">
               <span className="text-slate-500">最后活动</span>
               <span className="text-slate-200">
                 {lastActivity ? formatRelativeTime(lastActivity) : '无活动'}
               </span>
            </div>
          </div>

          {/* Warning */}
          {isActiveSession && (
            <div className="bg-amber-950/30 border border-amber-500/30 rounded-lg p-4 animate-in slide-in-from-top-2">
              <div className="flex gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
                <div>
                  <h4 className="text-sm font-bold text-amber-200">活动会话警告</h4>
                  <p className="text-xs text-amber-200/70 mt-1 leading-relaxed">
                    此会话当前处于活动状态。强制终止可能导致数据丢失或操作中断。
                  </p>

                  <label className="flex items-center mt-3 cursor-pointer group">
                    <div className="relative flex items-center">
                        <input
                            type="checkbox"
                            checked={forceTerminate}
                            onChange={(e) => setForceTerminate(e.target.checked)}
                            className="sr-only peer"
                        />
                        <div className="w-4 h-4 border-2 border-amber-500/50 rounded flex items-center justify-center peer-checked:bg-amber-500 peer-checked:border-amber-500 transition-all">
                             <div className="w-2 h-2 bg-amber-950 rounded-sm opacity-0 peer-checked:opacity-100 transition-opacity" />
                        </div>
                    </div>
                    <span className="ml-2 text-xs font-semibold text-amber-200 group-hover:text-amber-100 transition-colors">
                      我了解风险，强制终止
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Reason Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">
              终止原因（可选）
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isLoading}
              rows={3}
              className="w-full bg-slate-900/80 border border-slate-700 text-slate-200 text-sm rounded-lg p-3 focus:ring-1 focus:ring-red-500 focus:border-red-500 outline-none transition-all resize-none placeholder-slate-600 disabled:opacity-50"
              placeholder="输入原因以记录到审计日志..."
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-2">
            <button
              onClick={handleClose}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-50"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              disabled={isLoading || (isActiveSession && !forceTerminate)}
              className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-500 border border-red-500/50 rounded-lg shadow-lg shadow-red-900/20 disabled:opacity-50 disabled:grayscale transition-all flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  终止中...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  终止会话
                </>
              )}
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
