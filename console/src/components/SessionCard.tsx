import React from 'react';
import { Radio, Clock, Monitor, Trash2, CheckSquare, Square, Activity, Wifi, WifiOff, AlertTriangle, Stethoscope } from 'lucide-react';
import { Session } from '../types/api';
import { formatRelativeTime, cn } from '../lib/utils';
import { Card } from './ui/Card';

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

const getStatusColor = (status: string) => {
  switch (status) {
    case 'active':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'connected':
      return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
    case 'inactive':
      return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    case 'pending':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'expired':
      return 'bg-red-500/10 text-red-400 border-red-500/20';
    default:
      return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
  }
};

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
  const statusClasses = getStatusColor(session.status);
  
  // Get session fields
  const deviceId = session.deviceId || '';
  const createdAt = session.createdAt || 0;
  const expiresAt = session.expiresAt || 0;
  const lastActivity = session.lastActivity;
  
  // Activity status color and text
  const activityMetadata = {
    active: { color: 'text-emerald-400', label: '活跃', icon: Activity },
    recent: { color: 'text-amber-400', label: '最近活跃', icon: Activity },
    idle: { color: 'text-slate-500', label: '空闲', icon: Activity },
    unknown: { color: 'text-slate-600', label: '未知', icon: Activity }
  };
  
  const activityMeta = activityMetadata[activityStatus] || activityMetadata.unknown;
  const ActivityIcon = activityMeta.icon;

  // Calculate remaining time text
  const getTimeRemainingText = () => {
    if (!expiresAt) return null;

    const now = Date.now();
    const remaining = expiresAt * 1000 - now;

    if (remaining <= 0) return '已过期';

    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `剩余 ${hours}小时 ${minutes}分钟`;
    } else {
      return `剩余 ${minutes}分钟`;
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // If clicking checkbox, diagnose button or delete button, don't trigger card selection
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
    <Card 
      variant="glass"
      className={cn(
        "p-4 transition-all duration-200 border-slate-800",
        isSelected 
            ? "bg-cyan-900/10 border-cyan-500/50 shadow-[0_0_15px_-3px_rgba(6,182,212,0.15)]" 
            : "hover:bg-slate-800/40 hover:border-slate-700",
        (isExpired && !isSelected) ? "border-red-900/30 bg-red-900/5" : (isExpiring && !isSelected) ? "border-amber-900/30 bg-amber-900/5" : "",
        onSelect && "cursor-pointer"
      )}
      onClick={handleCardClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          {/* Batch Select Checkbox */}
          {onToggleSelect && (
            <div className="select-checkbox flex-shrink-0">
              <button
                onClick={handleSelectClick}
                className="text-slate-500 hover:text-cyan-400 transition-colors"
              >
                {isSelected ? (
                  <CheckSquare className="h-4 w-4 text-cyan-400" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
              </button>
            </div>
          )}
          
          <div className="flex-shrink-0 p-2 bg-slate-800/50 rounded-lg border border-slate-700/50">
            <Radio className="h-5 w-5 text-cyan-500" />
          </div>
          
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-slate-100 truncate font-mono">
                {session.id.substring(0, 8)}...
              </h3>
              <span className={cn(
                "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider border",
                statusClasses
              )}>
                {session.status}
              </span>
            </div>
            
            <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
              <div className="flex items-center gap-1.5 min-w-0">
                <Monitor className="h-3 w-3" />
                <span className="truncate" title={deviceId}>设备: {deviceId.substring(0, 8)}...</span>
              </div>

              {/* Connection Status Indicator */}
              {session.status === 'connected' || session.status === 'active' ? (
                <div className="flex items-center gap-1 text-emerald-400">
                  <Wifi className="h-3 w-3" />
                  <span className="hidden sm:inline">在线</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-slate-600">
                  <WifiOff className="h-3 w-3" />
                  <span className="hidden sm:inline">离线</span>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Activity Status and Action Buttons */}
        <div className="flex items-center space-x-1 pl-2">
          {showActivityStatus && (
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-800/50 border border-slate-700/30" title={activityMeta.label}>
              <ActivityIcon className={cn("h-4 w-4", activityMeta.color)} />
            </div>
          )}
          
          {/* Expiration Warning */}
          {(isExpiring || isExpired) && (
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-800/50 border border-slate-700/30" title={
              isExpired ? "会话已过期" :
              `会话将在 ${Math.floor(timeRemaining / (1000 * 60))} 分钟后过期`
            }>
              <AlertTriangle className={cn("h-4 w-4", isExpired ? "text-red-500" : "text-amber-500")} />
            </div>
          )}

          {onDiagnose && (
            <div className="diagnose-button">
              <button
                onClick={handleDiagnoseClick}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors"
                title="会话诊断"
              >
                <Stethoscope className="h-4 w-4" />
              </button>
            </div>
          )}

          {onDelete && (
            <div className="delete-button">
              <button
                onClick={handleDeleteClick}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="终止会话"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* Detail Info */}
      <div className="mt-3 pt-3 border-t border-slate-800/50 flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[10px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            <span>创建: {formatRelativeTime(createdAt)}</span>
          </div>
          {lastActivity && (
            <div className="text-slate-400">
              活跃: {formatRelativeTime(lastActivity)}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between text-[10px]">
          <div className={cn(
             isExpired ? "text-red-400" : isExpiring ? "text-amber-400" : "text-slate-500"
          )}>
            {isExpired ? '已过期' :
             isExpiring ? `剩余${Math.floor(timeRemaining / (1000 * 60))}分钟` :
             getTimeRemainingText()}
          </div>
          {session.devicePlatform && (
            <div className="text-slate-600 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 uppercase tracking-wider">
              {session.devicePlatform}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
