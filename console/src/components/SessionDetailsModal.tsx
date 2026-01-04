import { useState, useEffect } from 'react';
import { X, Radio, Terminal, FolderOpen, Send, Download, Upload, Activity, Wifi, WifiOff, Clock, Monitor, AlertTriangle, CheckCircle } from 'lucide-react';
import { Session } from '../types/api';
import { formatTimestamp, formatRelativeTime, getSessionStatusColor, cn } from '../lib/utils';
import { useSession } from '../hooks/useApi';

interface SessionDetailsModalProps {
  session: Session | null;
  isOpen: boolean;
  onClose: () => void;
}

interface CommandResult {
  id: string;
  command: string;
  timestamp: number;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  status: 'pending' | 'completed' | 'error';
}

export function SessionDetailsModal({ session, isOpen, onClose }: SessionDetailsModalProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'commands' | 'files'>('overview');
  const [command, setCommand] = useState('');
  const [commandHistory, setCommandHistory] = useState<CommandResult[]>([]);
  const [currentPath] = useState('/');

  // 实时获取会话详情
  const { data: sessionDetails, isLoading: isLoadingDetails } = useSession(
    session?.id || '', 
    { enabled: !!session?.id && isOpen }
  );

  // 使用最新的会话数据
  const currentSession = sessionDetails || session;

  useEffect(() => {
    if (!isOpen) {
      setActiveTab('overview');
      setCommand('');
      setCommandHistory([]);
    }
  }, [isOpen]);

  if (!isOpen || !currentSession) return null;

  const statusColor = getSessionStatusColor(currentSession.status);
  
  // 获取设备ID（兼容不同字段名）
  const deviceId = currentSession.device_id || currentSession.deviceId || '';
  const createdAt = currentSession.created_at || currentSession.createdAt || 0;
  const expiresAt = currentSession.expires_at || currentSession.expiresAt || 0;
  const lastActivity = currentSession.last_activity || currentSession.lastActivity;

  // 计算会话统计信息
  const getSessionStats = () => {
    const now = Date.now();
    const sessionAge = now - (createdAt * 1000);
    const timeRemaining = (expiresAt * 1000) - now;
    
    return {
      age: sessionAge,
      remaining: timeRemaining,
      isExpired: timeRemaining <= 0,
      isExpiringSoon: timeRemaining > 0 && timeRemaining < 300000, // 5分钟内过期
    };
  };

  const stats = getSessionStats();

  const handleSendCommand = () => {
    if (!command.trim()) return;

    const newCommand: CommandResult = {
      id: Date.now().toString(),
      command: command.trim(),
      timestamp: Date.now(),
      status: 'pending'
    };

    setCommandHistory(prev => [...prev, newCommand]);
    setCommand('');

    // Simulate command execution (in real implementation, this would use WebSocket)
    setTimeout(() => {
      setCommandHistory(prev => 
        prev.map(cmd => 
          cmd.id === newCommand.id 
            ? {
                ...cmd,
                status: 'completed' as const,
                exitCode: 0,
                stdout: `模拟输出: ${cmd.command} 执行成功\n当前时间: ${new Date().toLocaleString()}\n会话状态: ${currentSession.status}`
              }
            : cmd
        )
      );
    }, 1000 + Math.random() * 2000);
  };

  const tabs = [
    { id: 'overview', name: '会话概览', icon: Radio },
    { id: 'commands', name: '命令执行', icon: Terminal },
    { id: 'files', name: '文件管理', icon: FolderOpen },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <Radio className="h-6 w-6 text-gray-400" />
            <div>
              <h3 className="text-lg font-medium text-gray-900">
                会话详情 {isLoadingDetails && <span className="text-sm text-gray-500">(更新中...)</span>}
              </h3>
              <p className="text-sm text-gray-500">
                {currentSession.id} - 设备: {deviceId.substring(0, 8)}...
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <span className={cn(
              "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
              statusColor
            )}>
              {currentSession.status === 'active' ? '活跃' : 
               currentSession.status === 'connected' ? '已连接' :
               currentSession.status === 'inactive' ? '非活跃' : 
               currentSession.status === 'pending' ? '等待中' : '已过期'}
            </span>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm",
                  activeTab === tab.id
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                )}
              >
                <tab.icon className="h-4 w-4" />
                <span>{tab.name}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'overview' && (
            <div className="h-full overflow-y-auto p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 基本信息 */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-3 flex items-center">
                    <Radio className="h-4 w-4 mr-2" />
                    基本信息
                  </h4>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">会话 ID:</span>
                      <span className="text-sm font-mono text-gray-900">{currentSession.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">设备 ID:</span>
                      <span className="text-sm font-mono text-gray-900">{deviceId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">状态:</span>
                      <span className={cn(
                        "text-sm font-medium",
                        currentSession.status === 'active' || currentSession.status === 'connected' ? 'text-green-600' :
                        currentSession.status === 'pending' ? 'text-yellow-600' :
                        'text-red-600'
                      )}>
                        {currentSession.status === 'active' ? '活跃' : 
                         currentSession.status === 'connected' ? '已连接' :
                         currentSession.status === 'inactive' ? '非活跃' : 
                         currentSession.status === 'pending' ? '等待中' : '已过期'}
                      </span>
                    </div>
                    {currentSession.device_platform && (
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-500">设备平台:</span>
                        <span className="text-sm text-gray-900">{currentSession.device_platform}</span>
                      </div>
                    )}
                    {currentSession.device_version && (
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-500">设备版本:</span>
                        <span className="text-sm text-gray-900">{currentSession.device_version}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 时间信息 */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-3 flex items-center">
                    <Clock className="h-4 w-4 mr-2" />
                    时间信息
                  </h4>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">创建时间:</span>
                      <span className="text-sm text-gray-900">{formatTimestamp(createdAt)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">过期时间:</span>
                      <span className="text-sm text-gray-900">{formatTimestamp(expiresAt)}</span>
                    </div>
                    {lastActivity && (
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-500">最后活动:</span>
                        <span className="text-sm text-gray-900">{formatRelativeTime(lastActivity)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">会话年龄:</span>
                      <span className="text-sm text-gray-900">{formatRelativeTime(createdAt)}</span>
                    </div>
                  </div>
                </div>

                {/* 状态指示器 */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-3 flex items-center">
                    <Activity className="h-4 w-4 mr-2" />
                    连接状态
                  </h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">网络连接:</span>
                      <div className="flex items-center space-x-2">
                        {currentSession.status === 'connected' || currentSession.status === 'active' ? (
                          <>
                            <Wifi className="h-4 w-4 text-green-500" />
                            <span className="text-sm text-green-600">在线</span>
                          </>
                        ) : (
                          <>
                            <WifiOff className="h-4 w-4 text-gray-400" />
                            <span className="text-sm text-gray-500">离线</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">会话健康:</span>
                      <div className="flex items-center space-x-2">
                        {stats.isExpired ? (
                          <>
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                            <span className="text-sm text-red-600">已过期</span>
                          </>
                        ) : stats.isExpiringSoon ? (
                          <>
                            <AlertTriangle className="h-4 w-4 text-yellow-500" />
                            <span className="text-sm text-yellow-600">即将过期</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            <span className="text-sm text-green-600">正常</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 统计信息 */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-3 flex items-center">
                    <Monitor className="h-4 w-4 mr-2" />
                    会话统计
                  </h4>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">执行命令数:</span>
                      <span className="text-sm text-gray-900">{commandHistory.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">剩余时间:</span>
                      <span className={cn(
                        "text-sm",
                        stats.isExpired ? 'text-red-600' :
                        stats.isExpiringSoon ? 'text-yellow-600' : 'text-gray-900'
                      )}>
                        {stats.isExpired ? '已过期' : 
                         stats.remaining > 0 ? 
                         `${Math.floor(stats.remaining / (1000 * 60))} 分钟` : 
                         '即将过期'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 过期警告 */}
              {stats.isExpiringSoon && !stats.isExpired && (
                <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-md p-4">
                  <div className="flex">
                    <AlertTriangle className="h-5 w-5 text-yellow-400" />
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-yellow-800">
                        会话即将过期
                      </h3>
                      <div className="mt-2 text-sm text-yellow-700">
                        <p>此会话将在 {Math.floor(stats.remaining / (1000 * 60))} 分钟后过期。请及时保存重要数据。</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'commands' && (
            <div className="h-full flex flex-col">
              {/* Command History */}
              <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                <div className="space-y-4">
                  {commandHistory.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                      <Terminal className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                      <p>还没有执行任何命令</p>
                      <p className="text-sm">在下方输入框中输入命令开始操作</p>
                    </div>
                  ) : (
                    commandHistory.map((cmd) => (
                      <div key={cmd.id} className="bg-white rounded-lg p-4 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-mono text-gray-600">$</span>
                            <span className="text-sm font-mono">{cmd.command}</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                              cmd.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                              cmd.status === 'completed' ? 'bg-green-100 text-green-800' :
                              'bg-red-100 text-red-800'
                            )}>
                              {cmd.status === 'pending' ? '执行中' :
                               cmd.status === 'completed' ? '已完成' : '错误'}
                            </span>
                            <span className="text-xs text-gray-500">
                              {new Date(cmd.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>
                        
                        {cmd.stdout && (
                          <div className="mt-2">
                            <pre className="text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                              {cmd.stdout}
                            </pre>
                          </div>
                        )}
                        
                        {cmd.stderr && (
                          <div className="mt-2">
                            <pre className="text-xs bg-red-50 text-red-700 p-2 rounded overflow-x-auto">
                              {cmd.stderr}
                            </pre>
                          </div>
                        )}
                        
                        {cmd.exitCode !== undefined && (
                          <div className="mt-2 text-xs text-gray-500">
                            退出码: {cmd.exitCode}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Command Input */}
              <div className="border-t border-gray-200 p-4 bg-white">
                <div className="flex items-center space-x-3">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-mono text-gray-600">$</span>
                      <input
                        type="text"
                        value={command}
                        onChange={(e) => setCommand(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSendCommand()}
                        placeholder="输入命令..."
                        disabled={currentSession.status !== 'active' && currentSession.status !== 'connected'}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm disabled:bg-gray-100"
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleSendCommand}
                    disabled={!command.trim() || (currentSession.status !== 'active' && currentSession.status !== 'connected')}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center space-x-2"
                  >
                    <Send className="h-4 w-4" />
                    <span>执行</span>
                  </button>
                </div>
                {currentSession.status !== 'active' && currentSession.status !== 'connected' && (
                  <p className="mt-2 text-xs text-red-600">
                    会话状态为 {currentSession.status}，无法执行命令
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'files' && (
            <div className="h-full flex flex-col">
              {/* File Browser */}
              <div className="flex-1 overflow-y-auto p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <FolderOpen className="h-5 w-5 text-gray-400" />
                    <span className="text-sm font-mono text-gray-600">{currentPath}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      disabled={currentSession.status !== 'active' && currentSession.status !== 'connected'}
                      className="px-3 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50 flex items-center space-x-1"
                    >
                      <Upload className="h-3 w-3" />
                      <span>上传</span>
                    </button>
                    <button
                      disabled={currentSession.status !== 'active' && currentSession.status !== 'connected'}
                      className="px-3 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50 flex items-center space-x-1"
                    >
                      <Download className="h-3 w-3" />
                      <span>下载</span>
                    </button>
                  </div>
                </div>

                <div className="bg-white rounded-lg border border-gray-200">
                  <div className="text-center py-12 text-gray-500">
                    <FolderOpen className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p>文件管理功能</p>
                    <p className="text-sm">此功能需要与设备建立 WebSocket 连接后才能使用</p>
                    {currentSession.status !== 'active' && currentSession.status !== 'connected' && (
                      <p className="text-sm text-red-600 mt-2">
                        当前会话状态不支持文件操作
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Session Info Footer */}
        <div className="border-t border-gray-200 px-6 py-3 bg-gray-50">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center space-x-4">
              <span>创建时间: {formatTimestamp(createdAt)}</span>
              {lastActivity && (
                <span>最后活动: {formatRelativeTime(lastActivity)}</span>
              )}
            </div>
            <div className="flex items-center space-x-4">
              <span>过期时间: {formatTimestamp(expiresAt)}</span>
              <span className={cn(
                stats.isExpired ? 'text-red-600' :
                stats.isExpiringSoon ? 'text-yellow-600' : 'text-gray-500'
              )}>
                {stats.isExpired ? '已过期' : 
                 stats.remaining > 0 ? 
                 `剩余 ${Math.floor(stats.remaining / (1000 * 60))} 分钟` : 
                 '即将过期'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}