import { FileText, Monitor, Terminal, FolderOpen, Radio, AlertTriangle, ShieldCheck, ShieldAlert } from 'lucide-react';
import { AuditLog } from '../types/api';
import { formatTimestamp, cn } from '../lib/utils';
import { Card } from './ui/Card';

interface AuditLogCardProps {
  log: AuditLog;
  onSelect?: (log: AuditLog) => void;
}

const actionIcons = {
  'device_enrollment': Monitor,
  'device_heartbeat': Radio,
  'command_execution': Terminal,
  'file_operation': FolderOpen,
  'session_created': Radio,
  'session_closed': Radio,
  'security_event': AlertTriangle,
  'login': ShieldCheck,
  'logout': ShieldAlert
};

const actionColors = {
  'device_enrollment': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  'device_heartbeat': 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  'command_execution': 'text-violet-400 bg-violet-500/10 border-violet-500/20',
  'file_operation': 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  'session_created': 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  'session_closed': 'text-slate-400 bg-slate-500/10 border-slate-500/20',
  'security_event': 'text-red-400 bg-red-500/10 border-red-500/20',
  'login': 'text-green-400 bg-green-500/10 border-green-500/20',
  'logout': 'text-orange-400 bg-orange-500/10 border-orange-500/20'
};

const actionNames = {
  'device_enrollment': '设备注册',
  'device_heartbeat': '心跳',
  'command_execution': '命令执行',
  'file_operation': '文件操作',
  'session_created': '会话开始',
  'session_closed': '会话结束',
  'security_event': '安全事件',
  'login': '登录',
  'logout': '登出'
};

export function AuditLogCard({ log, onSelect }: AuditLogCardProps) {
  const IconComponent = actionIcons[log.actionType as keyof typeof actionIcons] || FileText;
  const actionColor = actionColors[log.actionType as keyof typeof actionColors] || 'text-slate-400 bg-slate-500/10 border-slate-500/20';
  const actionName = actionNames[log.actionType as keyof typeof actionNames] || log.actionType;

  let actionData;
  try {
    actionData = log.actionData ? (typeof log.actionData === 'string' ? JSON.parse(log.actionData) : log.actionData) : null;
  } catch {
    actionData = {};
  }

  const isSuccess = log.result === 'success' || (!log.result && log.actionType === 'device_heartbeat');
  const isError = log.result === 'error' || log.result === 'failed';

  return (
    <Card 
      variant="glass"
      className={cn(
        "group cursor-pointer hover:bg-slate-800/50 transition-all p-4 border-slate-800",
        onSelect && "active:scale-[0.99]"
      )}
      onClick={() => onSelect?.(log)}
    >
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 pt-1">
          <div className={cn("p-2 rounded-lg border", actionColor)}>
            <IconComponent className="h-4 w-4" />
          </div>
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors">
                {actionName}
              </h3>
              {(isSuccess || isError) && (
                <span className={cn(
                  "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider border",
                  isSuccess ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"
                )}>
                  {isSuccess ? '成功' : '失败'}
                </span>
              )}
            </div>
            <span className="text-xs font-mono text-slate-500">
              {formatTimestamp(log.timestamp)}
            </span>
          </div>
          
          <div className="flex items-center gap-4 text-xs text-slate-400 font-mono">
            <div className="flex items-center gap-1.5">
                <Monitor className="w-3 h-3 text-slate-600" />
                <span className="truncate max-w-[100px]" title={log.deviceId}>{log.deviceId.substring(0, 8)}...</span>
            </div>
            {log.sessionId && (
                <div className="flex items-center gap-1.5">
                    <Radio className="w-3 h-3 text-slate-600" />
                    <span className="truncate max-w-[100px]" title={log.sessionId}>{log.sessionId.substring(0, 8)}...</span>
                </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
