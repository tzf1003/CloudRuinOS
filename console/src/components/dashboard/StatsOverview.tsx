import React from 'react';
import { Monitor, Users, Activity, FileText, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { Card, CardContent } from '../ui/Card';
import { SystemMetrics, HealthData } from '../../types/api';

interface DeviceStats {
  online: number;
  offline: number;
  busy: number;
  total: number;
}

interface StatsOverviewProps {
  overview: {
    devices: DeviceStats;
    sessions: { active: number; total: number };
    health: HealthData | null;
    metrics: SystemMetrics | null;
    auditActivity: { today: number; thisWeek: number };
  };
}

export function StatsOverview({ overview }: StatsOverviewProps) {
  const getHealthStatusIcon = (status?: string) => {
    switch (status) {
      case 'healthy': return CheckCircle;
      case 'degraded': return AlertCircle;
      case 'unhealthy': return AlertCircle;
      default: return Clock;
    }
  };

  const getHealthStatusColor = (status?: string) => {
    switch (status) {
      case 'healthy': return 'text-emerald-500';
      case 'degraded': return 'text-amber-500';
      case 'unhealthy': return 'text-red-500';
      default: return 'text-slate-500';
    }
  };

  const stats = [
    {
      title: '设备总数',
      value: overview.devices.total,
      icon: Monitor,
      color: 'text-primary',
      footer: (
        <div className="flex gap-3 text-xs">
          <span className="text-emerald-400">● {overview.devices.online} 在线</span>
          <span className="text-red-400">● {overview.devices.offline} 离线</span>
        </div>
      )
    },
    {
      title: '活跃会话',
      value: overview.sessions.active,
      icon: Users,
      color: 'text-secondary',
      footer: (
        <div className="text-xs text-slate-400">
          <span className="text-slate-200">{overview.sessions.total}</span> 总会话
        </div>
      )
    },
    {
      title: '系统健康',
      value: overview.health?.status === 'healthy' ? '正常' :
             overview.health?.status === 'degraded' ? '降级' :
             overview.health?.status === 'unhealthy' ? '异常' : '未知',
      icon: getHealthStatusIcon(overview.health?.status),
      color: getHealthStatusColor(overview.health?.status),
      footer: (
        <div className="text-xs text-slate-400">
          平均响应: <span className="text-slate-200">
            {overview.metrics?.averageResponseTime ? 
              `${Math.round(overview.metrics.averageResponseTime * 1000)}ms` : 
              'N/A'}
          </span>
        </div>
      )
    },
    {
      title: '今日活动',
      value: overview.auditActivity.today,
      icon: FileText,
      color: 'text-orange-500',
      footer: (
        <div className="text-xs text-slate-400">
          <span className="text-slate-200">{overview.auditActivity.thisWeek}</span> 本周
        </div>
      )
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {stats.map((stat, i) => (
        <Card key={i} className="relative overflow-hidden group">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-400">{stat.title}</p>
                <h3 className="text-2xl font-bold text-slate-100 mt-2 tracking-tight">{stat.value}</h3>
              </div>
              <div className={`p-3 rounded-xl bg-surface/50 border border-white/5 ${stat.color}`}>
                <stat.icon size={20} />
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-white/5">
              {stat.footer}
            </div>
          </CardContent>
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-white/5 to-transparent rounded-full blur-2xl -mr-16 -mt-16 pointer-events-none group-hover:from-white/10 transition-colors" />
        </Card>
      ))}
    </div>
  );
}
