import { X, Clock, Monitor, Terminal, FileJson, AlertTriangle, Shield, CheckCircle } from 'lucide-react';
import { AuditLog } from '../types/api';
import { formatTimestamp, cn } from '../lib/utils';
import { Card } from './ui/Card';

interface AuditLogDetailsModalProps {
  log: AuditLog | null;
  isOpen: boolean;
  onClose: () => void;
}

export function AuditLogDetailsModal({ log, isOpen, onClose }: AuditLogDetailsModalProps) {
  if (!isOpen || !log) return null;

  let actionData = {};
  try {
    actionData = log.actionData ? (typeof log.actionData === 'string' ? JSON.parse(log.actionData) : log.actionData) : {};
  } catch {
    actionData = { raw: log.actionData };
  }

  const isSuccess = log.result === 'success' || (!log.result && log.actionType === 'device_heartbeat');
  const isError = log.result === 'error' || log.result === 'failed';

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div 
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />
      
      <Card variant="glass" className="relative w-full max-w-2xl m-4 p-0 shadow-2xl border-slate-700/50 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className={cn(
                "p-2 rounded-lg border",
                isError ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-cyan-500/10 border-cyan-500/20 text-cyan-400"
            )}>
                {isError ? <AlertTriangle className="w-5 h-5" /> : <Shield className="w-5 h-5" />}
            </div>
            <div>
                <h3 className="text-lg font-semibold text-slate-100">审计日志详情</h3>
                <p className="text-xs text-slate-400 font-mono text-left">{log.id}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
            {/* Status Banner */}
            <div className={cn(
                "flex items-center gap-3 p-3 rounded-lg border",
                isError ? "bg-red-500/5 border-red-500/20" : "bg-emerald-500/5 border-emerald-500/20"
            )}>
                {isError ? <AlertTriangle className="text-red-400 w-5 h-5" /> : <CheckCircle className="text-emerald-400 w-5 h-5" />}
                <div>
                     <p className={cn("text-sm font-medium", isError ? "text-red-400" : "text-emerald-400")}>
                        操作{isError ? '失败' : '成功'}
                     </p>
                    {/* Error message handling if needed, relying on Log Result or Data */}
                </div>
            </div>

            {/* Meta Grid */}
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                    <label className="text-xs text-slate-500 uppercase font-semibold">操作类型</label>
                    <div className="flex items-center gap-2 text-slate-200 bg-slate-900/50 p-2 rounded border border-slate-800">
                        <Terminal className="w-4 h-4 text-slate-500" />
                        <span className="font-mono text-sm">{log.actionType}</span>
                    </div>
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-slate-500 uppercase font-semibold">时间戳</label>
                    <div className="flex items-center gap-2 text-slate-200 bg-slate-900/50 p-2 rounded border border-slate-800">
                        <Clock className="w-4 h-4 text-slate-500" />
                        <span className="font-mono text-sm">{formatTimestamp(log.timestamp)}</span>
                    </div>
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-slate-500 uppercase font-semibold">设备 ID</label>
                     <div className="flex items-center gap-2 text-slate-200 bg-slate-900/50 p-2 rounded border border-slate-800">
                        <Monitor className="w-4 h-4 text-slate-500" />
                        <span className="font-mono text-sm truncate" title={log.deviceId}>{log.deviceId}</span>
                    </div>
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-slate-500 uppercase font-semibold">操作员 / 用户</label>
                     <div className="flex items-center gap-2 text-slate-200 bg-slate-900/50 p-2 rounded border border-slate-800">
                        <Shield className="w-4 h-4 text-slate-500" />
                        <span className="font-mono text-sm">系统</span>
                    </div>
                </div>
            </div>

            {/* Detailed Data */}
            <div className="space-y-2">
                 <div className="flex items-center gap-2 text-slate-400">
                    <FileJson className="w-4 h-4" />
                    <h4 className="text-sm font-medium">载荷数据</h4>
                 </div>
                 <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 overflow-x-auto">
                    <pre className="text-xs font-mono text-cyan-300">
                        {JSON.stringify(actionData, null, 2)}
                    </pre>
                 </div>
            </div>
        </div>
      </Card>
    </div>
  );
}
