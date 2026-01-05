import { useState, useEffect } from 'react';
import { Plus, Search, Filter, RefreshCw, CheckSquare, Square, Trash2, Play, Pause, AlertTriangle, Activity, Clock, X } from 'lucide-react';
import { useSessions, useDeleteSession } from '../hooks/useApi';
import { useSessionCleanup } from '../hooks/useSessionCleanup';
import { Session } from '../types/api';
import { SessionCard } from '../components/SessionCard';
import { CreateSessionDialog } from '../components/CreateSessionDialog';
import { SessionDetailsModal } from '../components/SessionDetailsModal';
import { SessionTerminateDialog } from '../components/SessionTerminateDialog';
import { SessionDiagnostics } from '../components/SessionDiagnostics';

export function SessionsPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [sessionToTerminate, setSessionToTerminate] = useState<Session | null>(null);
  const [sessionToDiagnose, setSessionToDiagnose] = useState<Session | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [showBatchActions, setShowBatchActions] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [notifications, setNotifications] = useState<Array<{
    id: string;
    type: 'warning' | 'error' | 'info';
    message: string;
    sessionId?: string;
  }>>([]);

  const { data: sessions = [], isLoading, error, refetch } = useSessions();
  const deleteSession = useDeleteSession();

  // 会话清理和监控
  const {
    expiringSessions,
    expiredSessions,
    cleanupExpiredSessions,
    getTimeRemaining,
    isSessionExpiring,
    isSessionExpired,
  } = useSessionCleanup({
    sessions,
    autoCleanup: true,
    onSessionExpiring: (session, timeRemaining) => {
      const minutes = Math.floor(timeRemaining / (1000 * 60));
      addNotification('warning', `会话 ${session.id.substring(0, 8)}... 将在 ${minutes} 分钟后过期`, session.id);
    },
    onSessionExpired: (session) => {
      addNotification('error', `会话 ${session.id.substring(0, 8)}... 已过期`, session.id);
    },
    onSessionCleaned: (sessionId) => {
      addNotification('info', `已自动清理过期会话 ${sessionId.substring(0, 8)}...`);
      removeNotification(sessionId);
    },
  });

  // 通知管理
  const addNotification = (type: 'warning' | 'error' | 'info', message: string, sessionId?: string) => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, type, message, sessionId }]);
    
    // 自动移除通知
    setTimeout(() => {
      removeNotification(id);
    }, 10000);
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id && n.sessionId !== id));
  };
  // 自动刷新机制
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      refetch();
    }, 5000); // 每5秒刷新一次会话状态

    return () => clearInterval(interval);
  }, [autoRefresh, refetch]);

  // Filter sessions based on search and status
  const filteredSessions = sessions.filter(session => {
    const sessionId = session.id || '';
    const deviceId = session.deviceId || '';
    
    const matchesSearch = sessionId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         deviceId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || session.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Calculate enhanced statistics
  const stats = {
    total: sessions.length,
    active: sessions.filter(s => s.status === 'active').length,
    connected: sessions.filter(s => s.status === 'connected').length,
    inactive: sessions.filter(s => s.status === 'inactive').length,
    expired: sessions.filter(s => s.status === 'expired').length,
    pending: sessions.filter(s => s.status === 'pending').length,
    expiring: expiringSessions.length,
    needsCleanup: expiredSessions.length,
  };

  // 批量操作处理
  const handleSelectAll = () => {
    if (selectedSessions.size === filteredSessions.length) {
      setSelectedSessions(new Set());
    } else {
      setSelectedSessions(new Set(filteredSessions.map(s => s.id)));
    }
  };

  const handleSelectSession = (sessionId: string) => {
    const newSelected = new Set(selectedSessions);
    if (newSelected.has(sessionId)) {
      newSelected.delete(sessionId);
    } else {
      newSelected.add(sessionId);
    }
    setSelectedSessions(newSelected);
  };

  const handleBatchDelete = () => {
    if (selectedSessions.size === 0) return;
    
    const sessionIds = Array.from(selectedSessions);
    const sessionNames = sessionIds.map(id => {
      const session = sessions.find(s => s.id === id);
      return session ? `${id.substring(0, 8)}...` : id;
    }).join(', ');

    if (confirm(`确定要删除 ${selectedSessions.size} 个会话吗？\n会话: ${sessionNames}`)) {
      sessionIds.forEach(sessionId => {
        deleteSession.mutate(sessionId);
      });
      setSelectedSessions(new Set());
    }
  };

  const handleDeleteSession = (session: Session) => {
    setSessionToTerminate(session);
  };

  const handleConfirmTerminate = (sessionId: string, reason?: string) => {
    deleteSession.mutate(sessionId, {
      onSuccess: () => {
        addNotification('info', `会话 ${sessionId.substring(0, 8)}... 已终止`);
        setSessionToTerminate(null);
      },
      onError: (error) => {
        addNotification('error', `终止会话失败: ${(error as any)?.message || '未知错误'}`);
      }
    });
  };

  const handleDiagnoseSession = (session: Session) => {
    setSessionToDiagnose(session);
  };

  // 获取会话活动状态
  const getSessionActivityStatus = (session: Session) => {
    const now = Date.now();
    const lastActivity = session.last_activity || session.lastActivity;
    
    if (!lastActivity) return 'unknown';
    
    const timeSinceActivity = now - lastActivity * 1000;
    
    if (timeSinceActivity < 60000) return 'active'; // 1分钟内
    if (timeSinceActivity < 300000) return 'recent'; // 5分钟内
    return 'idle';
  };

  return (
    <div>
      {/* 通知区域 */}
      {notifications.length > 0 && (
        <div className="mb-4 space-y-2">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={`p-3 rounded-md flex items-center justify-between ${
                notification.type === 'warning' ? 'bg-yellow-50 border border-yellow-200' :
                notification.type === 'error' ? 'bg-red-50 border border-red-200' :
                'bg-blue-50 border border-blue-200'
              }`}
            >
              <div className="flex items-center space-x-2">
                {notification.type === 'warning' ? (
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                ) : notification.type === 'error' ? (
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                ) : (
                  <Activity className="h-4 w-4 text-blue-500" />
                )}
                <span className={`text-sm ${
                  notification.type === 'warning' ? 'text-yellow-800' :
                  notification.type === 'error' ? 'text-red-800' :
                  'text-blue-800'
                }`}>
                  {notification.message}
                </span>
              </div>
              <button
                onClick={() => removeNotification(notification.id)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">会话管理</h1>
            <p className="mt-1 text-sm text-gray-600">
              管理实时通信会话和远程操作 - {autoRefresh ? '自动刷新已启用' : '自动刷新已禁用'}
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`inline-flex items-center px-3 py-2 border text-sm leading-4 font-medium rounded-md ${
                autoRefresh 
                  ? 'border-green-300 text-green-700 bg-green-50 hover:bg-green-100' 
                  : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
              }`}
            >
              {autoRefresh ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              {autoRefresh ? '暂停自动刷新' : '启用自动刷新'}
            </button>
            <button
              onClick={() => refetch()}
              disabled={isLoading}
              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              手动刷新
            </button>
            {stats.needsCleanup > 0 && (
              <button
                onClick={cleanupExpiredSessions}
                className="inline-flex items-center px-3 py-2 border border-orange-300 shadow-sm text-sm leading-4 font-medium rounded-md text-orange-700 bg-orange-50 hover:bg-orange-100"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                清理过期会话 ({stats.needsCleanup})
              </button>
            )}
            <button
              onClick={() => setShowCreateDialog(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              创建会话
            </button>
          </div>
        </div>

        {/* Enhanced Statistics */}
        <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-6">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                    <span className="text-sm font-medium text-gray-600">{stats.total}</span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      总会话数
                    </dt>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <span className="text-sm font-medium text-green-600">{stats.active}</span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      活跃会话
                    </dt>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-sm font-medium text-blue-600">{stats.connected}</span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      已连接
                    </dt>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                    <span className="text-sm font-medium text-gray-600">{stats.inactive}</span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      非活跃
                    </dt>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
                    <span className="text-sm font-medium text-yellow-600">{stats.pending}</span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      等待中
                    </dt>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                    <span className="text-sm font-medium text-red-600">{stats.expired}</span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      已过期
                    </dt>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Filters and Batch Actions */}
      <div className="mb-6 bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4 flex-1">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="搜索会话 ID 或设备 ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Filter className="h-4 w-4 text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">所有状态</option>
                <option value="active">活跃</option>
                <option value="connected">已连接</option>
                <option value="inactive">非活跃</option>
                <option value="pending">等待中</option>
                <option value="expired">已过期</option>
              </select>
            </div>
          </div>
          
          <div className="flex items-center space-x-2 ml-4">
            <button
              onClick={() => setShowBatchActions(!showBatchActions)}
              className={`px-3 py-2 text-sm font-medium rounded-md ${
                showBatchActions 
                  ? 'bg-blue-100 text-blue-700 border border-blue-300' 
                  : 'bg-gray-100 text-gray-700 border border-gray-300'
              } hover:bg-opacity-80`}
            >
              批量操作
            </button>
          </div>
        </div>

        {/* Batch Actions Bar */}
        {showBatchActions && (
          <div className="border-t border-gray-200 pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <button
                  onClick={handleSelectAll}
                  className="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-800"
                >
                  {selectedSessions.size === filteredSessions.length ? (
                    <CheckSquare className="h-4 w-4" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                  <span>
                    {selectedSessions.size === filteredSessions.length ? '取消全选' : '全选'}
                  </span>
                </button>
                
                {selectedSessions.size > 0 && (
                  <span className="text-sm text-gray-500">
                    已选择 {selectedSessions.size} 个会话
                  </span>
                )}
              </div>

              {selectedSessions.size > 0 && (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleBatchDelete}
                    disabled={deleteSession.isPending}
                    className="inline-flex items-center px-3 py-1 border border-red-300 text-sm font-medium rounded text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    批量删除
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Session List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-sm text-gray-500">加载会话列表...</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
            <p className="text-sm text-red-600">
              加载会话列表失败: {(error as any)?.message || '未知错误'}
            </p>
            <button
              onClick={() => refetch()}
              className="mt-2 text-sm text-blue-600 hover:text-blue-800"
            >
              重试
            </button>
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-sm text-gray-500">
              {sessions.length === 0 ? '暂无活跃会话' : '没有找到匹配的会话'}
            </p>
            {sessions.length === 0 && (
              <button
                onClick={() => setShowCreateDialog(true)}
                className="mt-2 text-sm text-blue-600 hover:text-blue-800"
              >
                创建新会话
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onSelect={setSelectedSession}
                onDelete={handleDeleteSession}
                onDiagnose={handleDiagnoseSession}
                isSelected={selectedSessions.has(session.id)}
                onToggleSelect={showBatchActions ? () => handleSelectSession(session.id) : undefined}
                showActivityStatus={true}
                activityStatus={getSessionActivityStatus(session)}
                isExpiring={isSessionExpiring(session)}
                isExpired={isSessionExpired(session)}
                timeRemaining={getTimeRemaining(session)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <CreateSessionDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
      />

      <SessionDetailsModal
        session={selectedSession}
        isOpen={!!selectedSession}
        onClose={() => setSelectedSession(null)}
      />

      <SessionTerminateDialog
        session={sessionToTerminate}
        isOpen={!!sessionToTerminate}
        onClose={() => setSessionToTerminate(null)}
        onConfirm={handleConfirmTerminate}
        isLoading={deleteSession.isPending}
      />

      <SessionDiagnostics
        session={sessionToDiagnose!}
        isOpen={!!sessionToDiagnose}
        onClose={() => setSessionToDiagnose(null)}
      />
    </div>
  );
}