import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  AlertCircle
} from 'lucide-react';
import { apiClient } from '../lib/api-client';
import { SystemMetrics, HealthData } from '../types/api';
import { HistoryTrendChart } from './HistoryTrendChart';
import { AuditStatsChart } from './AuditStatsChart';
import { clsx } from 'clsx';
import { StatsOverview } from './dashboard/StatsOverview';
import { DeviceCharts } from './dashboard/DeviceCharts';
import { SystemMetricsPanel } from './dashboard/SystemMetrics';
import { Card, CardContent } from './ui/Card';

// Dashboard 组件属性接口
interface DashboardProps {
  refreshInterval?: number;
  showMetrics?: boolean;
  compactMode?: boolean;
}

// 设备状态统计数据接口
interface DeviceStats {
  online: number;
  offline: number;
  busy: number;
  total: number;
}

// 系统概览数据接口
interface SystemOverview {
  devices: DeviceStats;
  sessions: {
    active: number;
    total: number;
  };
  health: HealthData | null;
  metrics: SystemMetrics | null;
  auditActivity: {
    today: number;
    thisWeek: number;
  };
}

export function Dashboard({ 
  refreshInterval = 30000, 
  showMetrics = true
}: DashboardProps) {
  const [overview, setOverview] = useState<SystemOverview>({
    devices: { online: 0, offline: 0, busy: 0, total: 0 },
    sessions: { active: 0, total: 0 },
    health: null,
    metrics: null,
    auditActivity: { today: 0, thisWeek: 0 }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());

  // 获取系统概览数据
  const fetchOverviewData = async () => {
    try {
      setError(null);
      
      const [devices, sessions, healthData, metricsData] = await Promise.allSettled([
        apiClient.getDevices(),
        apiClient.getSessions(),
        apiClient.getHealth(),
        apiClient.getMetrics()
      ]);

      let deviceStats: DeviceStats = { online: 0, offline: 0, busy: 0, total: 0 };
      if (devices.status === 'fulfilled') {
        const deviceList = devices.value;
        deviceStats = {
          online: deviceList.filter(d => d.status === 'online').length,
          offline: deviceList.filter(d => d.status === 'offline').length,
          busy: deviceList.filter(d => d.status === 'busy').length,
          total: deviceList.length
        };
      }

      let sessionStats = { active: 0, total: 0 };
      if (sessions.status === 'fulfilled') {
        const sessionList = sessions.value;
        sessionStats = {
          active: sessionList.filter(s => s.status === 'active' || s.status === 'connected').length,
          total: sessionList.length
        };
      }

      const health = healthData.status === 'fulfilled' ? healthData.value : null;
      const metrics = metricsData.status === 'fulfilled' ? metricsData.value : null;

      // 获取审计活动统计 (Using dummy data for safe fallback if API fails)
      const now = Date.now();
      const todayStart = new Date(now).setHours(0, 0, 0, 0);
      const weekStart = now - 7 * 24 * 60 * 60 * 1000;
      
      let auditActivity = { today: 0, thisWeek: 0 };
      try {
        const auditResponse = await apiClient.getAuditLogs({
          startTime: weekStart,
          limit: 1000
        });
        
        auditActivity = {
          today: auditResponse.logs.filter(log => log.timestamp >= todayStart).length,
          thisWeek: auditResponse.logs.length
        };
      } catch (auditError) {
        console.warn('Failed to fetch audit activity:', auditError);
      }

      setOverview({
        devices: deviceStats,
        sessions: sessionStats,
        health,
        metrics,
        auditActivity
      });
      
      setLastUpdate(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取概览数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverviewData();
    const interval = setInterval(fetchOverviewData, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  const handleRefresh = () => {
    setLoading(true);
    fetchOverviewData();
  };

  if (loading && !overview.health) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="loader-spinner w-8 h-8" />
        <span className="ml-3 text-slate-400">正在加载系统概览...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white glow-text">系统概览</h1>
          <p className="text-sm text-slate-400 mt-1">
            最后更新时间: {new Date(lastUpdate).toLocaleString()}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-primary hover:bg-primary/90 focus:ring-2 focus:ring-offset-2 focus:ring-primary focus:ring-offset-slate-900 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
        >
          <Activity className={clsx("h-4 w-4 mr-2", loading && "animate-spin")} />
          刷新
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-center text-red-400">
          <AlertCircle className="h-5 w-5 mr-3" />
          <span>{error}</span>
        </div>
      )}

      {/* Stats Cards */}
      <StatsOverview overview={overview} />

      {/* Charts Section */}
      <DeviceCharts deviceData={overview.devices} />

      {/* Historical Trend */}
      <Card>
        <CardContent className="pt-6">
           <HistoryTrendChart
            timeRange="24h"
            showDeviceTrend={true}
            showSessionTrend={true}
            showAuditTrend={false}
            height={400}
            refreshInterval={refreshInterval}
          />
        </CardContent>
      </Card>

      {/* Audit Stats */}
      <Card>
         <CardContent className="pt-6">
           <AuditStatsChart />
        </CardContent>
      </Card>
      {/* System Metrics */}
      {showMetrics && (
        <SystemMetricsPanel metrics={overview.metrics} />
      )}
    </div>
  );
}