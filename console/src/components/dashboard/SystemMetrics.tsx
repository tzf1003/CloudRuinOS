import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { SystemMetrics } from '../../types/api';
import { Zap, Activity, Clock, Server } from 'lucide-react';

interface SystemMetricsProps {
  metrics: SystemMetrics | null;
}

export function SystemMetricsPanel({ metrics }: SystemMetricsProps) {
  if (!metrics) return null;

  const items = [
    {
      label: '运行时间',
      value: `${Math.floor((metrics.uptime ?? 0) / 3600)}小时`,
      icon: Clock,
      color: 'text-blue-500'
    },
    {
      label: '总请求数',
      value: (metrics.requestCount ?? 0).toLocaleString(),
      icon: Activity,
      color: 'text-emerald-500'
    },
    {
      label: '错误率',
      value: `${((metrics.errorRate ?? 0) * 100).toFixed(2)}%`,
      icon: Zap,
      color: 'text-red-500'
    },
    {
      label: '平均响应',
      value: `${Math.round((metrics.averageResponseTime ?? 0) * 1000)}ms`,
      icon: Server,
      color: 'text-violet-500'
    },
    {
        label: '活跃连接',
        value: metrics.activeConnections ?? 0,
        icon: Server,
        color: 'text-orange-500'
    }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>系统性能指标</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {items.map((item, i) => (
            <div key={i} className="flex flex-col items-center justify-center p-4 rounded-lg bg-surface/50 border border-white/5 hover:bg-white/5 transition-colors">
              <item.icon className={`h-6 w-6 mb-2 ${item.color}`} />
              <span className="text-xl font-bold text-slate-100">{item.value}</span>
              <span className="text-xs text-slate-500 uppercase tracking-wider font-medium">{item.label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
