import React, { useState, useEffect } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer
} from 'recharts';
import { 
  Monitor, 
  Activity, 
  Users, 
  FileText, 
  AlertCircle, 
  CheckCircle, 
  Clock,
  TrendingUp,
  Wifi,
  WifiOff
} from 'lucide-react';
import { apiClient } from '../lib/api-client';
import { SystemMetrics, HealthData } from '../types/api';
import { HistoryTrendChart } from './HistoryTrendChart';
import { AuditStatsChart } from './AuditStatsChart';
import { ChartExport, ChartRef } from './ChartExport';
import { clsx } from 'clsx';

// Dashboard 组件属性接口
interface DashboardProps {
  refreshInterval?: number; // 默认 30 秒
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

// 图表颜色配置
const COLORS = {
  online: '#10B981',   // green-500
  offline: '#EF4444',  // red-500
  busy: '#F59E0B',     // amber-500
  primary: '#3B82F6',  // blue-500
  secondary: '#8B5CF6', // violet-500
  accent: '#06B6D4',   // cyan-500
};

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

  // 图表引用，用于导出功能
  const chartRefs = useState<ChartRef[]>([
    {
      id: 'device-pie-chart',
      name: '设备状态分布饼图',
      element: null as any,
      selected: false
    },
    {
      id: 'device-bar-chart', 
      name: '设备状态统计柱状图',
      element: null as any,
      selected: false
    },
    {
      id: 'history-trend-chart',
      name: '历史趋势图表',
      element: null as any,
      selected: false
    },
    {
      id: 'audit-stats-chart',
      name: '审计统计可视化',
      element: null as any,
      selected: false
    }
  ])[0];

  // 获取系统概览数据
  const fetchOverviewData = async () => {
    try {
      setError(null);
      
      // 并行获取所有数据
      const [devices, sessions, healthData, metricsData] = await Promise.allSettled([
        apiClient.getDevices(),
        apiClient.getSessions(),
        apiClient.getHealth(),
        apiClient.getMetrics()
      ]);

      // 处理设备统计
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

      // 处理会话统计
      let sessionStats = { active: 0, total: 0 };
      if (sessions.status === 'fulfilled') {
        const sessionList = sessions.value;
        sessionStats = {
          active: sessionList.filter(s => s.status === 'active' || s.status === 'connected').length,
          total: sessionList.length
        };
      }

      // 处理健康数据
      const health = healthData.status === 'fulfilled' ? healthData.value : null;
      
      // 处理指标数据
      const metrics = metricsData.status === 'fulfilled' ? metricsData.value : null;

      // 获取审计活动统计（简化版本，实际应该从 API 获取）
      const now = Date.now();
      const todayStart = new Date(now).setHours(0, 0, 0, 0);
      const weekStart = now - 7 * 24 * 60 * 60 * 1000;
      
      let auditActivity = { today: 0, thisWeek: 0 };
      try {
        const auditResponse = await apiClient.getAuditLogs({
          start_time: weekStart,
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
      setError(err instanceof Error ? err.message : '获取系统概览数据失败');
    } finally {
      setLoading(false);
    }
  };

  // 初始化和定时刷新
  useEffect(() => {
    fetchOverviewData();
    
    const interval = setInterval(fetchOverviewData, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  // 手动刷新
  const handleRefresh = () => {
    setLoading(true);
    fetchOverviewData();
  };

  // 设置图表元素引用
  const setChartRef = (chartId: string, element: HTMLElement | null) => {
    const chartIndex = chartRefs.findIndex(ref => ref.id === chartId);
    if (chartIndex !== -1 && element) {
      chartRefs[chartIndex].element = element;
    }
  };

  // 准备设备状态饼图数据
  const devicePieData = [
    { name: '在线', value: overview.devices.online, color: COLORS.online },
    { name: '离线', value: overview.devices.offline, color: COLORS.offline },
    { name: '忙碌', value: overview.devices.busy, color: COLORS.busy }
  ].filter(item => item.value > 0);

  // 准备设备状态柱状图数据
  const deviceBarData = [
    { status: '在线', count: overview.devices.online, color: COLORS.online },
    { status: '离线', count: overview.devices.offline, color: COLORS.offline },
    { status: '忙碌', count: overview.devices.busy, color: COLORS.busy }
  ];

  // 系统健康状态指示器
  const getHealthStatusColor = (status?: string) => {
    switch (status) {
      case 'healthy': return 'text-green-600 bg-green-100';
      case 'degraded': return 'text-yellow-600 bg-yellow-100';
      case 'unhealthy': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  // 系统健康状态图标
  const getHealthStatusIcon = (status?: string) => {
    switch (status) {
      case 'healthy': return CheckCircle;
      case 'degraded': return AlertCircle;
      case 'unhealthy': return AlertCircle;
      default: return Clock;
    }
  };

  if (loading && !overview.health) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">系统概览</h1>
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white p-6 rounded-lg shadow animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-8 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页面标题和控制按钮 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">系统概览</h1>
          <p className="text-sm text-gray-500 mt-1">
            最后更新: {new Date(lastUpdate).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <ChartExport
            charts={chartRefs.filter(ref => ref.element)}
            onExport={async (config, chartIds) => {
              console.log('Exporting charts:', chartIds, 'with config:', config);
              // 这里可以集成实际的导出逻辑
            }}
            className="mr-3"
          />
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            <Activity className={clsx("h-4 w-4 mr-2", loading && "animate-spin")} />
            刷新
          </button>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">数据获取失败</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* 关键指标卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* 设备总数 */}
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Monitor className="h-6 w-6 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    设备总数
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {overview.devices.total}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-5 py-3">
            <div className="text-sm">
              <span className="text-green-600 font-medium">{overview.devices.online}</span>
              <span className="text-gray-500"> 在线 • </span>
              <span className="text-red-600 font-medium">{overview.devices.offline}</span>
              <span className="text-gray-500"> 离线</span>
            </div>
          </div>
        </div>

        {/* 活跃会话 */}
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Users className="h-6 w-6 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    活跃会话
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {overview.sessions.active}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-5 py-3">
            <div className="text-sm">
              <span className="text-gray-500">总计 </span>
              <span className="text-gray-900 font-medium">{overview.sessions.total}</span>
              <span className="text-gray-500"> 个会话</span>
            </div>
          </div>
        </div>

        {/* 系统健康状态 */}
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                {React.createElement(getHealthStatusIcon(overview.health?.status), {
                  className: clsx("h-6 w-6", getHealthStatusColor(overview.health?.status).split(' ')[0])
                })}
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    系统健康
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {overview.health?.status === 'healthy' ? '正常' :
                     overview.health?.status === 'degraded' ? '降级' :
                     overview.health?.status === 'unhealthy' ? '异常' : '未知'}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-5 py-3">
            <div className="text-sm">
              <span className="text-gray-500">响应时间 </span>
              <span className="text-gray-900 font-medium">
                {overview.metrics?.averageResponseTime ? 
                  `${Math.round(overview.metrics.averageResponseTime * 1000)}ms` : 
                  'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* 审计活动 */}
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <FileText className="h-6 w-6 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    今日活动
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {overview.auditActivity.today}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-5 py-3">
            <div className="text-sm">
              <span className="text-gray-500">本周 </span>
              <span className="text-gray-900 font-medium">{overview.auditActivity.thisWeek}</span>
              <span className="text-gray-500"> 次操作</span>
            </div>
          </div>
        </div>
      </div>

      {/* 图表区域 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 设备状态分布饼图 */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">设备状态分布</h3>
            <div className="flex items-center space-x-2">
              <Wifi className="h-4 w-4 text-green-500" />
              <span className="text-sm text-gray-500">实时数据</span>
            </div>
          </div>
          
          {overview.devices.total > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={devicePieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {devicePieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <WifiOff className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                <p>暂无设备数据</p>
              </div>
            </div>
          )}
        </div>

        {/* 设备状态柱状图 */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">设备状态统计</h3>
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-gray-500">统计图表</span>
            </div>
          </div>
          
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deviceBarData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="status" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill={COLORS.primary}>
                  {deviceBarData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 历史趋势图表 */}
      <HistoryTrendChart
        timeRange="24h"
        showDeviceTrend={true}
        showSessionTrend={true}
        showAuditTrend={false}
        height={400}
        refreshInterval={refreshInterval}
        onDataPointClick={(dataPoint) => {
          console.log('Trend data point clicked:', dataPoint);
        }}
      />

      {/* 审计统计可视化 */}
      <AuditStatsChart
        timeRange={7 * 24 * 60 * 60 * 1000} // 7天
        refreshInterval={refreshInterval}
        showActionTypes={true}
        showTimeDistribution={true}
        showDeviceActivity={true}
        showSeverityStats={true}
        showDailyTrend={true}
        onStatsClick={(type, data) => {
          console.log('Audit stats clicked:', type, data);
        }}
      />

      {/* 系统指标详情 */}
      {showMetrics && overview.metrics && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-4">系统性能指标</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {Math.floor(overview.metrics.uptime / 3600)}h
              </div>
              <div className="text-sm text-gray-500">运行时间</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {overview.metrics.requestCount.toLocaleString()}
              </div>
              <div className="text-sm text-gray-500">请求总数</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {(overview.metrics.errorRate * 100).toFixed(1)}%
              </div>
              <div className="text-sm text-gray-500">错误率</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {Math.round(overview.metrics.averageResponseTime * 1000)}ms
              </div>
              <div className="text-sm text-gray-500">平均响应时间</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {overview.metrics.activeConnections}
              </div>
              <div className="text-sm text-gray-500">活跃连接</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}