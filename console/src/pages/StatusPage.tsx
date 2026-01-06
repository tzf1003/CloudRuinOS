import React, { useState, useEffect } from 'react';
import { RefreshCw, Activity, AlertTriangle, CheckCircle, XCircle, Clock, Server, Database, HardDrive, Shield, Lock, Play, Pause } from 'lucide-react';
import { useHealthMonitor } from '../hooks/useHealthMonitor';
import { apiClient } from '../lib/api-client';
import { Device, Session } from '../types/api';
import { Card } from '../components/ui/Card';
import { cn } from '../lib/utils';
import clsx from 'clsx';

export function StatusPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30000); // 30 seconds

  const {
    health,
    readiness,
    liveness,
    metrics,
    loading,
    error,
    lastUpdate,
    isConnected,
    refresh,
    toggleAutoRefresh
  } = useHealthMonitor({
    refreshInterval,
    autoRefresh,
    retryOnError: true,
    maxRetries: 3
  });

  // Fetch devices and sessions data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [devicesData, sessionsData] = await Promise.all([
          apiClient.getDevices(),
          apiClient.getSessions()
        ]);
        setDevices(devicesData);
        setSessions(sessionsData);
      } catch (error) {
        console.error('Failed to fetch devices/sessions:', error);
      }
    };

    fetchData();
    
    // Set up interval for devices/sessions data
    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-emerald-400';
      case 'degraded':
        return 'text-amber-400';
      case 'unhealthy':
        return 'text-red-400';
      default:
        return 'text-slate-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-5 h-5 text-emerald-400" />;
      case 'degraded':
        return <AlertTriangle className="w-5 h-5 text-amber-400" />;
      case 'unhealthy':
        return <XCircle className="w-5 h-5 text-red-400" />;
      default:
        return <Clock className="w-5 h-5 text-slate-400" />;
    }
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return `${days}d ${hours}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  const formatLastUpdate = (timestamp: number | null) => {
    if (!timestamp) return 'Never';
    const now = Date.now();
    const diff = Math.floor((now - timestamp) / 1000);
    
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  const onlineDevices = devices.filter(d => d.status === 'online').length;
  const activeSessions = sessions.filter(s => s.status === 'active' || s.status === 'connected').length;

  const componentIcons: Record<string, any> = {
    database: Database,
    kv: Server,
    r2: HardDrive,
    durableObjects: Server,
    secrets: Lock,
    default: Activity
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-500 bg-clip-text text-transparent flex items-center gap-3">
            <Activity className="h-8 w-8 text-emerald-500" />
            系统状态
          </h1>
          <div className="flex items-center gap-3 mt-1">
             <p className="text-slate-400 text-sm">
              实时系统健康与指标
            </p>
            {lastUpdate && (
              <span className={cn(
                "text-xs px-2 py-0.5 rounded-full border flex items-center gap-1",
                 isConnected ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border-red-500/20 text-red-400"
              )}>
                {isConnected ? <CheckCircle className="w-3 h-3"/> : <XCircle className="w-3 h-3"/>}
                已更新: {formatLastUpdate(lastUpdate)}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-slate-900/50 p-2 rounded-lg border border-slate-800">
           <button
             onClick={() => {
               setAutoRefresh(!autoRefresh);
               toggleAutoRefresh();
             }}
             className={cn(
               "p-2 rounded-md transition-all flex items-center gap-2 text-xs font-bold uppercase",
               autoRefresh ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-slate-800 text-slate-500 border border-slate-700"
             )}
             title={autoRefresh ? "暂停自动刷新" : "恢复自动刷新"}
           >
             {autoRefresh ? <><Pause className="h-4 w-4" /> 实时</> : <><Play className="h-4 w-4" /> 暂停</>}
           </button>

            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              className="bg-slate-950 border border-slate-700 text-slate-300 text-xs rounded-md px-2 py-2 focus:ring-1 focus:ring-cyan-500 outline-none"
            >
              <option value={10000}>10s</option>
              <option value={30000}>30s</option>
              <option value={60000}>1m</option>
              <option value={300000}>5m</option>
            </select>

            <button
              onClick={refresh}
              disabled={loading}
              className="p-2 bg-cyan-600/20 text-cyan-400 hover:bg-cyan-600/30 border border-cyan-500/30 rounded-md transition-colors disabled:opacity-50"
              title="立即刷新"
            >
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <Card variant="glass" className="bg-red-950/20 border-red-500/30 p-4 animate-in slide-in-from-top-2">
          <div className="flex gap-3">
            <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-red-400">健康检查失败</h3>
              <p className="mt-1 text-sm text-red-300/80">{error}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Main Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { 
            label: '系统状态', 
            val: health?.status === 'healthy' ? '运行正常' : health?.status === 'degraded' ? '性能降级' : health?.status === 'unhealthy' ? '严重错误' : '未知', // Using custom text instead of raw status
            icon: Shield,
            color: health?.status === 'healthy' ? 'text-emerald-400' : health?.status === 'degraded' ? 'text-amber-400' : 'text-red-400',
            sub: '整体健康状况',
            bg: health?.status === 'healthy' ? 'bg-emerald-500/10' : 'bg-slate-800/50'
          },
          { 
            label: '在线设备', 
            val: onlineDevices, 
            icon: Activity,
            color: 'text-cyan-400',
             sub: `共 ${devices.length} 台注册设备`,
             bg: 'bg-cyan-500/10'
          },
          { 
            label: '活跃会话', 
            val: activeSessions, 
            icon: Server,
            color: 'text-purple-400',
            sub: `共 ${sessions.length} 个会话`,
            bg: 'bg-purple-500/10'
          },
          { 
            label: '运行时间', 
            val: metrics?.uptime ? formatUptime(metrics.uptime) : '未知', 
            icon: Clock,
            color: 'text-emerald-400',
            sub: '自上次重启',
            bg: 'bg-emerald-500/10'
          }
        ].map((stat, i) => (
          <Card key={i} variant="glass" className="p-4 flex flex-col justify-between h-32 relative overflow-hidden group hover:border-slate-600 transition-colors">
            <div className={`absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity`}>
               <stat.icon className="h-16 w-16" />
            </div>
            <div className="flex items-start justify-between relative z-10">
               <div className={cn("p-2 rounded-lg", stat.bg)}>
                  <stat.icon className={cn("h-5 w-5", stat.color)} />
               </div>
            </div>
            <div className="relative z-10">
                <div className={cn("text-2xl font-bold", stat.color)}>{stat.val}</div>
                <div className="text-xs uppercase font-semibold text-slate-500 tracking-wider mb-0.5">{stat.label}</div>
                <div className="text-xs text-slate-600">{stat.sub}</div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Component Health */}
        <Card variant="glass" className="flex flex-col h-full">
           <div className="p-4 border-b border-slate-800 bg-slate-900/30 flex justify-between items-center">
             <h3 className="font-bold text-slate-200 flex items-center gap-2">
               <Server className="h-4 w-4 text-cyan-400" /> 组件状态
             </h3>
           </div>
           
           <div className="p-4 flex-1">
             {health ? (
                <div className="space-y-3">
                  {Object.entries(health.checks).map(([component, status]) => {
                     const Icon = componentIcons[component] || componentIcons.default;
                     return (
                      <div key={component} className="flex items-center justify-between p-3 rounded-lg bg-slate-900/50 border border-slate-800 hover:border-slate-700 transition-colors">
                        <div className="flex items-center gap-3">
                           <div className={cn("p-2 rounded bg-slate-950 border border-slate-800", getStatusColor(status.status))}>
                             <Icon className="h-4 w-4" />
                           </div>
                           <div>
                              <span className="text-sm font-medium text-slate-200 capitalize block">
                                  {component.replace(/([A-Z])/g, ' $1').trim()}
                              </span>
                              {status.error && (
                                <span className="text-xs text-red-400 block max-w-xs truncate">{status.error}</span>
                              )}
                           </div>
                        </div>
                        <div className="text-right">
                           <div className={cn("text-xs font-bold px-2 py-1 rounded bg-black/20 uppercase tracking-wide inline-block", getStatusColor(status.status))}>
                              {status.status}
                           </div>
                           {status.responseTime && (
                             <div className="text-xs text-slate-500 mt-1 font-mono">
                                {status.responseTime.toFixed(0)}ms
                             </div>
                           )}
                        </div>
                      </div>
                     );
                  })}
                </div>
             ) : (
                <div className="h-full flex items-center justify-center text-slate-500 italic">
                   暂无健康数据
                </div>
             )}
           </div>
        </Card>

        {/* System Metrics */}
        {metrics && (
           <Card variant="glass" className="flex flex-col h-full">
             <div className="p-4 border-b border-slate-800 bg-slate-900/30 flex justify-between items-center">
               <h3 className="font-bold text-slate-200 flex items-center gap-2">
                 <Activity className="h-4 w-4 text-emerald-400" /> 性能指标
               </h3>
             </div>
             <div className="p-4 flex-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-800 flex flex-col items-center justify-center text-center">
                      <div className="text-3xl font-bold text-slate-200 mb-1 font-mono">
                         {(metrics.requestCount ?? 0).toLocaleString()}
                      </div>
                      <div className="text-xs text-slate-500 uppercase font-semibold">总请求数</div>
                   </div>

                    <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-800 flex flex-col items-center justify-center text-center">
                      <div className="text-3xl font-bold text-slate-200 mb-1 font-mono">
                         {(metrics.averageResponseTime ?? 0).toFixed(0)}<span className="text-sm text-slate-500 ml-1">ms</span>
                      </div>
                      <div className="text-xs text-slate-500 uppercase font-semibold">平均响应时间</div>
                   </div>

                    <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-800 flex flex-col items-center justify-center text-center">
                      <div className={cn("text-3xl font-bold mb-1 font-mono", (metrics.errorRate || 0) > 0.05 ? "text-red-400" : "text-emerald-400")}>
                         {((metrics.errorRate ?? 0) * 100).toFixed(2)}<span className="text-sm opacity-50 ml-1">%</span>
                      </div>
                      <div className="text-xs text-slate-500 uppercase font-semibold">错误率</div>
                   </div>
                   
                   {/* Placeholder for future metric */}
                    <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-800 flex flex-col items-center justify-center text-center opacity-50">
                      <div className="text-3xl font-bold text-slate-600 mb-1 font-mono">
                         --
                      </div>
                      <div className="text-xs text-slate-600 uppercase font-semibold">CPU 负载</div>
                   </div>
                </div>
             </div>
           </Card>
        )}
      </div>
    </div>
  );
}
