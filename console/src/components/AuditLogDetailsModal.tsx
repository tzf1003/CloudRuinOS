import { X, FileText, Monitor, Terminal, FolderOpen, Radio, AlertTriangle, Clock } from 'lucide-react';
import { AuditLog } from '../types/api';
import { formatTimestamp, cn } from '../lib/utils';

interface AuditLogDetailsModalProps {
  log: AuditLog | null;
  isOpen: boolean;
  onClose: () => void;
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

const actionNames = {
  'device_enrollment': '设备注册',
  'device_heartbeat': '设备心跳',
  'command_execution': '命令执行',
  'file_operation': '文件操作',
  'session_created': '会话创建',
  'session_closed': '会话关闭',
  'security_event': '安全事件',
};

export function AuditLogDetailsModal({ log, isOpen, onClose }: AuditLogDetailsModalProps) {
  if (!isOpen || !log) return null;

  const IconComponent = actionIcons[log.actionType as keyof typeof actionIcons] || FileText;
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <IconComponent className="h-6 w-6 text-gray-400" />
            <div>
              <h3 className="text-lg font-medium text-gray-900">
                审计日志详情
              </h3>
              <p className="text-sm text-gray-500">
                ID: {log.id}
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
          {/* Basic Information */}
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-3">基本信息</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">操作类型</span>
                  <span className="text-sm font-medium text-gray-900">
                    {actionName}
                  </span>
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">执行结果</span>
                  <span className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                    isSuccess ? "bg-green-100 text-green-800" : 
                    isError ? "bg-red-100 text-red-800" : 
                    "bg-gray-100 text-gray-800"
                  )}>
                    {isSuccess ? '成功' : isError ? '失败' : '未知'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Device and Session Information */}
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-3">关联信息</h4>
            <div className="space-y-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center space-x-2 mb-1">
                  <Monitor className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-600">设备 ID</span>
                </div>
                <span className="text-sm font-mono text-gray-900">
                  {log.deviceId}
                </span>
              </div>
              
              {log.sessionId && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center space-x-2 mb-1">
                    <Radio className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-600">会话 ID</span>
                  </div>
                  <span className="text-sm font-mono text-gray-900">
                    {log.sessionId}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Action Data */}
          {actionData && (
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-3">操作详情</h4>
              <div className="bg-gray-50 rounded-lg p-3">
                {log.actionType === 'command_execution' && (
                  <div className="space-y-2">
                    {actionData.command && (
                      <div>
                        <span className="text-xs text-gray-500">执行命令:</span>
                        <div className="mt-1 font-mono text-sm bg-white p-2 rounded border">
                          $ {actionData.command}
                        </div>
                      </div>
                    )}
                    {actionData.exit_code !== undefined && (
                      <div>
                        <span className="text-xs text-gray-500">退出码:</span>
                        <span className="ml-2 text-sm font-mono">{actionData.exit_code}</span>
                      </div>
                    )}
                    {actionData.stdout && (
                      <div>
                        <span className="text-xs text-gray-500">标准输出:</span>
                        <pre className="mt-1 text-xs bg-white p-2 rounded border overflow-x-auto">
                          {actionData.stdout}
                        </pre>
                      </div>
                    )}
                    {actionData.stderr && (
                      <div>
                        <span className="text-xs text-gray-500">错误输出:</span>
                        <pre className="mt-1 text-xs bg-red-50 text-red-700 p-2 rounded border overflow-x-auto">
                          {actionData.stderr}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                {log.actionType === 'file_operation' && (
                  <div className="space-y-2">
                    {actionData.operation && (
                      <div>
                        <span className="text-xs text-gray-500">操作类型:</span>
                        <span className="ml-2 text-sm">{actionData.operation}</span>
                      </div>
                    )}
                    {actionData.path && (
                      <div>
                        <span className="text-xs text-gray-500">文件路径:</span>
                        <div className="mt-1 font-mono text-sm bg-white p-2 rounded border">
                          {actionData.path}
                        </div>
                      </div>
                    )}
                    {actionData.size && (
                      <div>
                        <span className="text-xs text-gray-500">文件大小:</span>
                        <span className="ml-2 text-sm">{actionData.size} bytes</span>
                      </div>
                    )}
                  </div>
                )}

                {log.actionType === 'device_enrollment' && (
                  <div className="space-y-2">
                    {actionData.platform && (
                      <div>
                        <span className="text-xs text-gray-500">操作系统:</span>
                        <span className="ml-2 text-sm">{actionData.platform}</span>
                      </div>
                    )}
                    {actionData.version && (
                      <div>
                        <span className="text-xs text-gray-500">Agent 版本:</span>
                        <span className="ml-2 text-sm">v{actionData.version}</span>
                      </div>
                    )}
                    {actionData.public_key && (
                      <div>
                        <span className="text-xs text-gray-500">公钥指纹:</span>
                        <div className="mt-1 font-mono text-xs bg-white p-2 rounded border break-all">
                          {actionData.public_key.substring(0, 64)}...
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {(log.actionType === 'session_created' || log.actionType === 'session_closed') && (
                  <div className="space-y-2">
                    {actionData.session_id && (
                      <div>
                        <span className="text-xs text-gray-500">会话 ID:</span>
                        <div className="mt-1 font-mono text-sm bg-white p-2 rounded border">
                          {actionData.session_id}
                        </div>
                      </div>
                    )}
                    {actionData.duration && (
                      <div>
                        <span className="text-xs text-gray-500">会话时长:</span>
                        <span className="ml-2 text-sm">{actionData.duration}秒</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Generic JSON display for other action types */}
                {!['command_execution', 'file_operation', 'device_enrollment', 'session_created', 'session_closed'].includes(log.actionType) && (
                  <pre className="text-xs bg-white p-2 rounded border overflow-x-auto">
                    {JSON.stringify(actionData, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          )}

          {/* Result Information */}
          {log.result && log.result !== 'success' && (
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-3">错误信息</h4>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-800">{log.result}</p>
              </div>
            </div>
          )}

          {/* Timestamp */}
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-3">时间信息</h4>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-600">发生时间:</span>
                <span className="text-sm font-medium text-gray-900">
                  {formatTimestamp(log.timestamp)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}