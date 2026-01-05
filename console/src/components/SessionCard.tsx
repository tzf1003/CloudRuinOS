import { Radio, Clock, Monitor, Trash2, CheckSquare, Square, Activity, Wifi, WifiOff, AlertTriangle, Stethoscope } from 'lucide-react';
import { Session } from '../types/api';
import { formatRelativeTime, getSessionStatusColor, cn } from '../lib/utils';

interface SessionCardProps {
  session: Session;
  onSelect?: (session: Session) => void;
  onDelete?: (session: Session) => void;
  onDiagnose?: (session: Session) => void;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  showActivityStatus?: boolean;
  activityStatus?: 'active' | 'recent' | 'idle' | 'unknown';
  isExpiring?: boolean;
  isExpired?: boolean;
  timeRemaining?: number;
}

export function SessionCard({ 
  session, 
  onSelect, 
  onDelete, 
  onDiagnose,
  isSelected = false,
  onToggleSelect,
  showActivityStatus = false,
  activityStatus = 'unknown',
  isExpiring = false,
  isExpired = false,
  timeRemaining = 0
}: SessionCardProps) {
  const statusColor = getSessionStatusColor(session.status);
  
  // 获取会话字段
  const deviceId = session.deviceId || '';
  const createdAt = session.createdAt || 0;
  const expiresAt = session.expiresAt || 0;
  const lastActivity = session.lastActivity;
  
  // 活动状态颜色
  const getActivityStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-green-500';
      case 'recent':
        return 'text-yellow-500';
      case 'idle':
        return 'text-gray-400';
      default:
        return 'text-gray-300';
    }
  };

  // 活动状态文本
  const getActivityStatusText = (status: string) => {
    switch (status) {
      case 'active':
        return '活跃中';
      case 'recent':
        return '最近活跃';
      case 'idle':
        return '空闲';
      default:
        return '未知';
    }
  };

  // 计算会话剩余时间
  const getTimeRemaining = () => {
    if (!expiresAt) return null;
    
    const now = Date.now();
    const remaining = expiresAt * 1000 - now;
    
    if (remaining <= 0) return '已过期';
    
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}小时${minutes}分钟后过期`;
    } else {
      return `${minutes}分钟后过期`;
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // 如果点击的是选择框、诊断按钮或删除按钮，不触发卡片选择
    if ((e.target as HTMLElement).closest('.select-checkbox') || 
        (e.target as HTMLElement).closest('.diagnose-button') ||
        (e.target as HTMLElement).closest('.delete-button')) {
      return;
    }
    
    onSelect?.(session);
  };

  const handleSelectClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleSelect?.();
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(session);
  };

  const handleDiagnoseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDiagnose?.(session);
  };
  
  return (
    <div 
      className={cn(
        "bg-white rounded-lg shadow-sm border p-4 transition-all duration-200",
        isSelected ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-blue-300",
        isExpired ? "border-red-300 bg-red-50" : isExpiring ? "border-yellow-300 bg-yellow-50" : "",
        onSelect && "cursor-pointer hover:shadow-md"
      )}
      onClick={handleCardClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3 flex-1">
          {/* 批量选择复选框 */}
          {onToggleSelect && (
            <div className="select-checkbox flex-shrink-0">
              <button
                onClick={handleSelectClick}
                className="text-gray-400 hover:text-blue-600"
              >
                {isSelected ? (
                  <CheckSquare className="h-4 w-4 text-blue-600" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
              </button>
            </div>
          )}
          
          <div className="flex-shrink-0">
            <Radio className="h-8 w-8 text-gray-400" />
          </div>
          
          <div className="min-w-0 flex-1">
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-medium text-gray-900 truncate">
                会话 {session.id.substring(0, 8)}...
              </h3>
              <span className={cn(
                "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                statusColor
              )}>
                {session.status === 'active' ? '活跃' : 
                 session.status === 'connected' ? '已连接' :
                 session.status === 'inactive' ? '非活跃' : 
                 session.status === 'pending' ? '等待中' : '已过期'}
              </span>
            </div>
            
            <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500">
              <div className="flex items-center space-x-1">
                <Monitor className="h-3 w-3" />
                <span>设备: {deviceId.substring(0, 8)}...</span>
              </div>
              
              {/* 连接状态指示器 */}
              {session.status === 'connected' || session.status === 'active' ? (
                <div className="flex items-center space-x-1 text-green-600">
                  <Wifi className="h-3 w-3" />
                  <span>在线</span>
                </div>
              ) : (
                <div className="flex items-center space-x-1 text-gray-400">
                  <WifiOff className="h-3 w-3" />
                  <span>离线</span>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* 活动状态和操作按钮 */}
        <div className="flex items-center space-x-2">
          {showActivityStatus && (
            <div className="flex items-center space-x-1" title={getActivityStatusText(activityStatus)}>
              <Activity className={cn("h-3 w-3", getActivityStatusColor(activityStatus))} />
            </div>
          )}
          
          {/* 过期警告 */}
          {(isExpiring || isExpired) && (
            <div className="flex items-center space-x-1" title={
              isExpired ? "会话已过期" : 
              `会话将在 ${Math.floor(timeRemaining / (1000 * 60))} 分钟后过期`
            }>
              <AlertTriangle className={cn("h-3 w-3", isExpired ? "text-red-500" : "text-yellow-500")} />
            </div>
          )}
          
          {onDiagnose && (
            <div className="diagnose-button">
              <button
                onClick={handleDiagnoseClick}
                className="text-gray-400 hover:text-blue-600 p-1"
                title="诊断会话"
              >
                <Stethoscope className="h-4 w-4" />
              </button>
            </div>
          )}
          
          {onDelete && (
            <div className="delete-button">
              <button
                onClick={handleDeleteClick}
                className="text-gray-400 hover:text-red-600 p-1"
                title="终止会话"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* 详细信息 */}
      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center space-x-1">
            <Clock className="h-3 w-3" />
            <span>创建于: {formatRelativeTime(createdAt)}</span>
          </div>
          {lastActivity && (
            <div>
              最后活动: {formatRelativeTime(lastActivity)}
            </div>
          )}
        </div>
        
        <div className="flex items-center justify-between text-xs">
          <div className="text-gray-500">
            {isExpired ? '已过期' : 
             isExpiring ? `${Math.floor(timeRemaining / (1000 * 60))} 分钟后过期` :
             getTimeRemaining()}
          </div>
          {session.devicePlatform && (
            <div className="text-gray-400">
              {session.devicePlatform}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}