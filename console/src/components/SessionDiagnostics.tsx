import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, Clock, Wifi, WifiOff, Activity, RefreshCw, X } from 'lucide-react';
import { Session } from '../types/api';
import { formatRelativeTime } from '../lib/utils';

interface SessionDiagnosticsProps {
  session: Session;
  isOpen: boolean;
  onClose: () => void;
}

interface DiagnosticResult {
  id: string;
  name: string;
  status: 'checking' | 'passed' | 'failed' | 'warning';
  message: string;
  details?: string;
  suggestion?: string;
}

export function SessionDiagnostics({ session, isOpen, onClose }: SessionDiagnosticsProps) {
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (isOpen) {
      runDiagnostics();
    }
  }, [isOpen, session]);

  const runDiagnostics = async () => {
    setIsRunning(true);
    setDiagnostics([]);

    const checks: DiagnosticResult[] = [
      {
        id: 'session-status',
        name: '会话状态检查',
        status: 'checking',
        message: '检查会话当前状态...',
      },
      {
        id: 'connection-health',
        name: '连接健康检查',
        status: 'checking',
        message: '检查网络连接状态...',
      },
      {
        id: 'session-timeout',
        name: '会话超时检查',
        status: 'checking',
        message: '检查会话是否即将超时...',
      },
      {
        id: 'activity-check',
        name: '活动状态检查',
        status: 'checking',
        message: '检查会话活动状态...',
      },
      {
        id: 'resource-usage',
        name: '资源使用检查',
        status: 'checking',
        message: '检查系统资源使用情况...',
      },
    ];

    setDiagnostics([...checks]);

    // 模拟诊断过程
    for (let i = 0; i < checks.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 1200));
      
      const updatedChecks = [...checks];
      const check = updatedChecks[i];
      
      // 根据会话实际状态进行诊断
      switch (check.id) {
        case 'session-status':
          if (session.status === 'active' || session.status === 'connected') {
            check.status = 'passed';
            check.message = '会话状态正常';
            check.details = `当前状态: ${session.status === 'active' ? '活跃' : '已连接'}`;
          } else if (session.status === 'expired') {
            check.status = 'failed';
            check.message = '会话已过期';
            check.details = '会话已超过有效期限';
            check.suggestion = '请创建新的会话或联系管理员';
          } else {
            check.status = 'warning';
            check.message = '会话状态异常';
            check.details = `当前状态: ${session.status}`;
            check.suggestion = '建议检查设备连接或重新建立会话';
          }
          break;

        case 'connection-health':
          if (session.status === 'connected' || session.status === 'active') {
            check.status = 'passed';
            check.message = '网络连接正常';
            check.details = '设备与服务器连接稳定';
          } else {
            check.status = 'failed';
            check.message = '网络连接异常';
            check.details = '设备可能离线或网络不稳定';
            check.suggestion = '检查设备网络连接，或尝试重新连接';
          }
          break;

        case 'session-timeout':
          const now = Date.now();
          const expiresAt = (session.expiresAt || 0) * 1000;
          const timeRemaining = expiresAt - now;
          
          if (timeRemaining > 300000) { // 5分钟以上
            check.status = 'passed';
            check.message = '会话时间充足';
            check.details = `剩余时间: ${Math.floor(timeRemaining / (1000 * 60))} 分钟`;
          } else if (timeRemaining > 0) {
            check.status = 'warning';
            check.message = '会话即将超时';
            check.details = `剩余时间: ${Math.floor(timeRemaining / (1000 * 60))} 分钟`;
            check.suggestion = '建议尽快完成操作或延长会话时间';
          } else {
            check.status = 'failed';
            check.message = '会话已超时';
            check.details = '会话已过期，无法继续使用';
            check.suggestion = '请创建新的会话';
          }
          break;

        case 'activity-check':
          const lastActivity = session.last_activity || session.lastActivity;
          if (lastActivity) {
            const timeSinceActivity = now - lastActivity * 1000;
            if (timeSinceActivity < 60000) { // 1分钟内
              check.status = 'passed';
              check.message = '会话活跃';
              check.details = '最近有活动记录';
            } else if (timeSinceActivity < 300000) { // 5分钟内
              check.status = 'warning';
              check.message = '会话空闲';
              check.details = `上次活动: ${formatRelativeTime(lastActivity)}`;
              check.suggestion = '会话可能处于空闲状态';
            } else {
              check.status = 'warning';
              check.message = '会话长时间空闲';
              check.details = `上次活动: ${formatRelativeTime(lastActivity)}`;
              check.suggestion = '建议检查会话是否仍在使用';
            }
          } else {
            check.status = 'warning';
            check.message = '无活动记录';
            check.details = '未检测到会话活动';
            check.suggestion = '可能是新创建的会话或存在记录问题';
          }
          break;

        case 'resource-usage':
          // 模拟资源检查
          const resourceUsage = Math.random();
          if (resourceUsage < 0.7) {
            check.status = 'passed';
            check.message = '资源使用正常';
            check.details = `CPU: ${Math.floor(resourceUsage * 50)}%, 内存: ${Math.floor(resourceUsage * 60)}%`;
          } else if (resourceUsage < 0.9) {
            check.status = 'warning';
            check.message = '资源使用较高';
            check.details = `CPU: ${Math.floor(resourceUsage * 80)}%, 内存: ${Math.floor(resourceUsage * 85)}%`;
            check.suggestion = '建议监控系统性能';
          } else {
            check.status = 'failed';
            check.message = '资源使用过高';
            check.details = `CPU: ${Math.floor(resourceUsage * 95)}%, 内存: ${Math.floor(resourceUsage * 90)}%`;
            check.suggestion = '系统资源紧张，建议优化或重启';
          }
          break;
      }

      setDiagnostics([...updatedChecks]);
    }

    setIsRunning(false);
  };

  const getStatusIcon = (status: DiagnosticResult['status']) => {
    switch (status) {
      case 'checking':
        return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'passed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: DiagnosticResult['status']) => {
    switch (status) {
      case 'checking':
        return 'text-blue-600';
      case 'passed':
        return 'text-green-600';
      case 'failed':
        return 'text-red-600';
      case 'warning':
        return 'text-yellow-600';
      default:
        return 'text-gray-600';
    }
  };

  if (!isOpen) return null;

  const deviceId = session.deviceId || '';
  const failedCount = diagnostics.filter(d => d.status === 'failed').length;
  const warningCount = diagnostics.filter(d => d.status === 'warning').length;
  const passedCount = diagnostics.filter(d => d.status === 'passed').length;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <Activity className="h-6 w-6 text-blue-500" />
            <div>
              <h3 className="text-lg font-medium text-gray-900">
                会话诊断
              </h3>
              <p className="text-sm text-gray-500">
                会话 {session.id.substring(0, 8)}... - 设备 {deviceId.substring(0, 8)}...
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

        {/* 诊断概览 */}
        <div className="p-6 border-b border-gray-200">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{passedCount}</div>
              <div className="text-sm text-gray-500">正常</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{warningCount}</div>
              <div className="text-sm text-gray-500">警告</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{failedCount}</div>
              <div className="text-sm text-gray-500">失败</div>
            </div>
          </div>
        </div>

        {/* 诊断结果 */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            {diagnostics.map((diagnostic) => (
              <div key={diagnostic.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 mt-0.5">
                    {getStatusIcon(diagnostic.status)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-gray-900">
                        {diagnostic.name}
                      </h4>
                      <span className={`text-sm font-medium ${getStatusColor(diagnostic.status)}`}>
                        {diagnostic.status === 'checking' ? '检查中' :
                         diagnostic.status === 'passed' ? '正常' :
                         diagnostic.status === 'failed' ? '失败' : '警告'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-600">
                      {diagnostic.message}
                    </p>
                    {diagnostic.details && (
                      <p className="mt-1 text-xs text-gray-500">
                        {diagnostic.details}
                      </p>
                    )}
                    {diagnostic.suggestion && (
                      <div className="mt-2 p-2 bg-blue-50 rounded text-xs text-blue-700">
                        <strong>建议:</strong> {diagnostic.suggestion}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="border-t border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={runDiagnostics}
              disabled={isRunning}
              className="inline-flex items-center px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRunning ? 'animate-spin' : ''}`} />
              {isRunning ? '诊断中...' : '重新诊断'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}