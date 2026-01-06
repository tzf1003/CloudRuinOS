import { useState, useEffect } from 'react';
import { Plus, Search, Filter, RefreshCw, CheckSquare, Square, Trash2, Play, Pause, AlertTriangle, Activity, X, Terminal, Server } from 'lucide-react';
import { useSessions, useDeleteSession } from '../hooks/useApi';
import { useSessionCleanup } from '../hooks/useSessionCleanup';
import { Session } from '../types/api';
import { SessionCard } from '../components/SessionCard';
import { CreateSessionDialog } from '../components/CreateSessionDialog';
import { SessionDetailsModal } from '../components/SessionDetailsModal';
import { SessionTerminateDialog } from '../components/SessionTerminateDialog';
import { SessionDiagnostics } from '../components/SessionDiagnostics';
import { Card } from '../components/ui/Card';
import { cn } from '../lib/utils';
import clsx from 'clsx';

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

  // Session Cleanup and Monitoring
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

  // Notification Management
  const addNotification = (type: 'warning' | 'error' | 'info', message: string, sessionId?: string) => {
    const id = Date.now().toString() + Math.random().toString();
    setNotifications(prev => [...prev, { id, type, message, sessionId }]);
    
    // Auto-remove
    setTimeout(() => {
      removeNotification(id);
    }, 10000);
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id && n.sessionId !== id));
  };

  // Auto-refresh mechanism
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      refetch();
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, refetch]);

  // Filter sessions
  const filteredSessions = sessions.filter(session => {
    const sessionId = session.id || '';
    const deviceId = session.deviceId || '';
    
    const matchesSearch = sessionId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         deviceId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || session.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Statistics
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

  // Batch Actions
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
    if (confirm(`确定要终止 ${selectedSessions.size} 个会话吗？`)) {
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
        addNotification('error', `终止失败: ${(error as any)?.message || '未知错误'}`);
      }
    });
  };

  const handleDiagnoseSession = (session: Session) => {
    setSessionToDiagnose(session);
  };

  const getSessionActivityStatus = (session: Session) => {
    const now = Date.now();
    const lastActivity = session.lastActivity;
    if (!lastActivity) return 'unknown';
    const timeSinceActivity = now - lastActivity * 1000;
    if (timeSinceActivity < 60000) return 'active';
    if (timeSinceActivity < 300000) return 'recent';
    return 'idle';
  };

  return (
    <div className="space-y-6">
      {/* Notifications Area */}
      {notifications.length > 0 && (
        <div className="fixed top-20 right-4 z-50 space-y-2 w-80 pointer-events-none">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={clsx(
                "p-3 rounded-lg border shadow-lg backdrop-blur-md flex items-start gap-3 pointer-events-auto transition-all animate-in slide-in-from-right fade-in",
                notification.type === 'warning' ? 'bg-amber-950/80 border-amber-500/30 text-amber-200' :
                notification.type === 'error' ? 'bg-red-950/80 border-red-500/30 text-red-200' :
                'bg-slate-800/80 border-cyan-500/30 text-cyan-200'
              )}
            >
              <div className="mt-0.5">
                {notification.type === 'warning' ? <AlertTriangle className="h-4 w-4 text-amber-500" /> :
                 notification.type === 'error' ? <AlertTriangle className="h-4 w-4 text-red-500" /> :
                 <Activity className="h-4 w-4 text-cyan-400" />}
              </div>
              <div className="flex-1 text-sm font-medium">{notification.message}</div>
              <button
                onClick={() => removeNotification(notification.id)}
                className="text-white/40 hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent flex items-center gap-3">
            <Terminal className="h-8 w-8 text-cyan-500" />
            会话控制
          </h1>
          <p className="text-slate-400 mt-1 flex items-center gap-2">
            实时设备管理与遥测
            <span className={cn(
              "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border",
              autoRefresh ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-slate-800 border-slate-700 text-slate-500"
            )}>
              {autoRefresh ? <><Play className="h-3 w-3" /> 实时</> : <><Pause className="h-3 w-3" /> 已暂停</>}
            </span>
          </p>
        </div>
        
        <div className="flex items-center gap-2 w-full lg:w-auto">
           <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={cn(
              "p-2 rounded-lg border transition-all",
              autoRefresh 
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20" 
                : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-300"
            )}
            title={autoRefresh ? "暂停更新" : "恢复更新"}
          >
            {autoRefresh ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>
          
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="p-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 hover:text-cyan-400 hover:border-cyan-500/50 transition-all disabled:opacity-50"
            title="立即刷新"
          >
            <RefreshCw className={cn("h-5 w-5", isLoading && "animate-spin")} />
          </button>

          {stats.needsCleanup > 0 && (
            <button
              onClick={cleanupExpiredSessions}
              className="px-3 py-2 bg-orange-500/10 border border-orange-500/30 text-orange-400 rounded-lg hover:bg-orange-500/20 transition-all flex items-center gap-2 text-sm font-medium"
            >
              <Trash2 className="h-4 w-4" />
              清理 ({stats.needsCleanup})
            </button>
          )}

          <button
            onClick={() => setShowCreateDialog(true)}
            className="flex-1 lg:flex-none px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg font-medium shadow-lg shadow-cyan-900/20 transition-all flex items-center justify-center gap-2"
          >
            <Plus className="h-4 w-4" />
            新建会话
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        {[
          { label: '总计', value: stats.total, color: 'text-slate-200', bg: 'bg-slate-800/50' },
          { label: '活动', value: stats.active, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: '已连接', value: stats.connected, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
          { label: '未活动', value: stats.inactive, color: 'text-slate-400', bg: 'bg-slate-900/50' },
          { label: '等待中', value: stats.pending, color: 'text-amber-400', bg: 'bg-amber-500/10' },
          { label: '已过期', value: stats.expired, color: 'text-red-400', bg: 'bg-red-500/10' },
        ].map((stat, i) => (
          <Card key={i} variant="glass" className="p-4 flex flex-col items-center justify-center border-slate-800">
            <div className={cn("text-2xl font-bold mb-1", stat.color)}>{stat.value}</div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{stat.label}</div>
          </Card>
        ))}
      </div>

      {/* Toolbar */}
      <Card variant="glass" className="p-4">
        <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
          <div className="flex-1 w-full flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="搜索会话或设备..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-950/50 border border-slate-700/50 text-slate-200 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-500" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-950/50 border border-slate-700/50 text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
              >
                <option value="all">所有状态</option>
                <option value="active">活动</option>
                <option value="connected">已连接</option>
                <option value="inactive">未活动</option>
                <option value="pending">等待中</option>
                <option value="expired">已过期</option>
              </select>
            </div>
          </div>

          <button
            onClick={() => setShowBatchActions(!showBatchActions)}
            className={cn(
              "px-3 py-2 rounded-lg text-sm font-medium border transition-colors w-full md:w-auto text-center",
              showBatchActions 
                ? "bg-cyan-500/10 border-cyan-500/50 text-cyan-400" 
                : "bg-slate-800/50 border-slate-700 text-slate-400 hover:text-slate-200"
            )}
          >
            {showBatchActions ? '隐藏操作' : '批量操作'}
          </button>
        </div>

        {/* Batch Action Bar */}
        {showBatchActions && (
          <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between animate-in slide-in-from-top-2">
            <button
              onClick={handleSelectAll}
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
            >
              {selectedSessions.size === filteredSessions.length && filteredSessions.length > 0 ? (
                <CheckSquare className="h-5 w-5 text-cyan-500" />
              ) : (
                <Square className="h-5 w-5" />
              )}
              <span>全选 ({filteredSessions.length})</span>
            </button>

            {selectedSessions.size > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-500 px-2">已选择 {selectedSessions.size} 个</span>
                <button
                  onClick={handleBatchDelete}
                  className="px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-sm hover:bg-red-500/20 transition-all flex items-center gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  终止所选
                </button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Main Content */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <RefreshCw className="h-10 w-10 text-cyan-500 animate-spin mb-4" />
          <p className="text-slate-400">加载会话中...</p>
        </div>
      ) : error ? (
        <Card variant="glass" className="p-8 flex flex-col items-center justify-center border-red-500/30 bg-red-950/10">
          <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
          <h3 className="text-lg font-bold text-red-400 mb-2">加载会话失败</h3>
          <p className="text-slate-400 mb-4 text-center max-w-md">{(error as any)?.message || '获取会话数据时发生未知错误。'}</p>
          <button onClick={() => refetch()} className="px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors">
            重试
          </button>
        </Card>
      ) : filteredSessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <Server className="h-16 w-16 mb-4 opacity-20" />
          <p className="text-lg font-medium">未找到会话</p>
          <p className="text-sm opacity-60 mt-1">
            {searchTerm || statusFilter !== 'all' ? '尝试调整您的筛选条件' : '创建新会话开始'}
          </p>
          {sessions.length === 0 && (
            <button
              onClick={() => setShowCreateDialog(true)}
              className="mt-6 px-4 py-2 bg-slate-800 text-cyan-400 border border-slate-700 rounded-lg hover:border-cyan-500/50 transition-all"
            >
              开始首个会话
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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

      {/* Dialogs */}
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
