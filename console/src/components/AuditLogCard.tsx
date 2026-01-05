import { FileText, Monitor, Terminal, FolderOpen, Radio, AlertTriangle } from 'lucide-react';
import { AuditLog } from '../types/api';
import { formatTimestamp, cn } from '../lib/utils';

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
};

const actionColors = {
  'device_enrollment': 'text-green-600 bg-green-100',
  'device_heartbeat': 'text-blue-600 bg-blue-100',
  'command_execution': 'text-purple-600 bg-purple-100',
  'file_operation': 'text-yellow-600 bg-yellow-100',
  'session_created': 'text-indigo-600 bg-indigo-100',
  'session_closed': 'text-gray-600 bg-gray-100',
  'security_event': 'text-red-600 bg-red-100',
};

const actionNames = {
  'device_enrollment': '设备注册',
  'device_heartbeat': '设备心跳',
  'command_execution': '命令执行',
  'file_operation': '文件操作',
  'session_created': '会话创建',
  'session_closed': '会话关闭',
  'security_event': '安全事件',
};

export function AuditLogCard({ log, onSelect }: AuditLogCardProps) {
  const IconComponent = actionIcons[log.actionType as keyof typeof actionIcons] || FileText;
  const actionColor = actionColors[log.actionType as keyof typeof actionColors] || 'text-gray-600 bg-gray-100';
  const actionName = actionNames[log.actionType as keyof typeof actionNames] || log.actionType;

  let actionData;
  try {
    actionData = log.actionData ? JSON.parse(log.actionData) : null;
  } catch {
    actionData = null;
  }

  const isSuccess = log.result === 'success' || (!log.result && log.actionType === 'device_heartbeat');
  const isError = log.result === 'error' || log.result === 'failed';

  return (
    <div 
      className={cn(
        "bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow",
        onSelect && "cursor-pointer hover:border-blue-300"
      )}
      onClick={() => onSelect?.(log)}
    >
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          <div className={cn("p-2 rounded-full", actionColor)}>
            <IconComponent className="h-4 w-4" />
          </div>
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-medium text-gray-900">
                {actionName}
              </h3>
              {(isSuccess || isError) && (
                <span className={cn(
                  "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                  isSuccess ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                )}>
                  {isSuccess ? '成功' : '失败'}
                </span>
              )}
            </div>
            <span className="text-xs text-gray-500">
              {formatTimestamp(log.timestamp)}
            </span>
          </div>
          
          <div className="mt-1 text-sm text-gray-600">
            <div className="flex items-center space-x-4">
              <span>设备: {log.deviceId.substring(0, 8)}...</span>
              {log.sessionId && (
                <span>会话: {log.sessionId.substring(0, 8)}...</span>
              )}
            </div>
          </div>

          {actionData && (
            <div className="mt-2 text-xs text-gray-500">
              {log.actionType === 'command_execution' && actionData.command && (
                <div className="font-mono bg-gray-100 px-2 py-1 rounded">
                  $ {actionData.command}
                </div>
              )}
              {log.actionType === 'file_operation' && actionData.path && (
                <div className="font-mono bg-gray-100 px-2 py-1 rounded">
                  {actionData.operation}: {actionData.path}
                </div>
              )}
              {log.actionType === 'device_enrollment' && actionData.platform && (
                <div>
                  平台: {actionData.platform} | 版本: {actionData.version}
                </div>
              )}
            </div>
          )}

          {log.result && log.result !== 'success' && (
            <div className="mt-2 text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
              {log.result}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}