import { useState, useEffect, useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  Area,
  AreaChart
} from 'recharts';
import { 
  BarChart3, 
  PieChart as PieChartIcon, 
  TrendingUp,
  Users,
  Shield,
  AlertTriangle,
  Clock
} from 'lucide-react';
import { apiClient } from '../lib/api-client';
import { AuditFilters } from '../types/api';
import { clsx } from 'clsx';

// 审计统计数据接口
interface AuditStats {
  actionTypes: Array<{
    name: string;
    count: number;
    percentage: number;
    color: string;
  }>;
  timeDistribution: Array<{
    hour: number;
    count: number;
    label: string;
  }>;
  deviceActivity: Array<{
    deviceId: string;
    count: number;
    lastActivity: number;
  }>;
  severityDistribution: Array<{
    severity: 'info' | 'warning' | 'error';
    count: number;
    color: string;
  }>;
  dailyTrend: Array<{
    date: string;
    count: number;
    timestamp: number;
  }>;
}

// 组件属性接口
interface AuditStatsChartProps {
  timeRange?: number; // 时间范围（毫秒）
  deviceId?: string; // 特定设备筛选
  actionType?: string; // 特定操作类型筛选
  refreshInterval?: number;
  showActionTypes?: boolean;
  showTimeDistribution?: boolean;
  showDeviceActivity?: boolean;
  showSeverityStats?: boolean;
  showDailyTrend?: boolean;
  onStatsClick?: (type: string, data: any) => void;
}

// 颜色配置
const COLORS = {
  primary: '#3B82F6',    // blue-500
  success: '#10B981',    // green-500
  warning: '#F59E0B',    // amber-500
  error: '#EF4444',      // red-500
  info: '#06B6D4',       // cyan-500
  secondary: '#8B5CF6',  // violet-500
  accent: '#EC4899',     // pink-500
  neutral: '#6B7280'     // gray-500
};

// 操作类型颜色映射
const ACTION_TYPE_COLORS: Record<string, string> = {
  'login': COLORS.success,
  'logout': COLORS.info,
  'file_upload': COLORS.primary,
  'file_download': COLORS.secondary,
  'command_execution': COLORS.warning,
  'session_create': COLORS.accent,
  'session_terminate': COLORS.error,
  'device_enrollment': COLORS.success,
  'configuration_change': COLORS.warning,
  'system_access': COLORS.info
};

// 严重程度颜色映射
const SEVERITY_COLORS = {
  info: COLORS.info,
  warning: COLORS.warning,
  error: COLORS.error
};

export function AuditStatsChart({
  timeRange = 7 * 24 * 60 * 60 * 1000, // 默认7天
  deviceId,
  actionType,
  refreshInterval = 300000, // 5分钟
  showActionTypes = true,
  showTimeDistribution = true,
  showDeviceActivity = true,
  showSeverityStats = true,
  showDailyTrend = true,
  onStatsClick
}: AuditStatsChartProps) {
  const [stats, setStats] = useState<AuditStats>({
    actionTypes: [],
    timeDistribution: [],
    deviceActivity: [],
    severityDistribution: [],
    dailyTrend: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedChart, setSelectedChart] = useState<'pie' | 'bar'>('pie');

  // 获取审计统计数据
  const fetchAuditStats = async () => {
    try {
      setError(null);
      
      const endTime = Date.now();
      const startTime = endTime - timeRange;
      
      const filters: AuditFilters = {
        startTime: startTime,
        endTime: endTime,
        limit: 10000 // 获取足够多的数据进行统计
      };
      
      if (deviceId) filters.deviceId = deviceId;
      if (actionType) filters.actionType = actionType;
      
      const response = await apiClient.getAuditLogs(filters);
      const logs = response.logs;
      
      // 统计操作类型分布
      const actionTypeMap = new Map<string, number>();
      logs.forEach(log => {
        const count = actionTypeMap.get(log.actionType) || 0;
        actionTypeMap.set(log.actionType, count + 1);
      });
      
      const totalActions = logs.length;
      const actionTypes = Array.from(actionTypeMap.entries())
        .map(([name, count]) => ({
          name,
          count,
          percentage: totalActions > 0 ? (count / totalActions) * 100 : 0,
          color: ACTION_TYPE_COLORS[name] || COLORS.neutral
        }))
        .sort((a, b) => b.count - a.count);
      
      // 统计时间分布（按小时）
      const hourMap = new Map<number, number>();
      for (let i = 0; i < 24; i++) {
        hourMap.set(i, 0);
      }
      
      logs.forEach(log => {
        const hour = new Date(log.timestamp).getHours();
        const count = hourMap.get(hour) || 0;
        hourMap.set(hour, count + 1);
      });
      
      const timeDistribution = Array.from(hourMap.entries())
        .map(([hour, count]) => ({
          hour,
          count,
          label: `${hour.toString().padStart(2, '0')}:00`
        }));
      
      // 统计设备活动
      const deviceMap = new Map<string, { count: number; lastActivity: number }>();
      logs.forEach(log => {
        const existing = deviceMap.get(log.deviceId) || { count: 0, lastActivity: 0 };
        deviceMap.set(log.deviceId, {
          count: existing.count + 1,
          lastActivity: Math.max(existing.lastActivity, log.timestamp)
        });
      });
      
      const deviceActivity = Array.from(deviceMap.entries())
        .map(([deviceId, data]) => ({
          deviceId,
          count: data.count,
          lastActivity: data.lastActivity
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10); // 取前10个最活跃的设备
      
      // 统计严重程度分布（模拟数据，实际应该从日志中获取）
      const severityMap = new Map<'info' | 'warning' | 'error', number>();
      logs.forEach(log => {
        // 根据操作类型推断严重程度
        let severity: 'info' | 'warning' | 'error' = 'info';
        if (log.actionType.includes('error') || log.actionType === 'session_terminate') {
          severity = 'error';
        } else if (log.actionType.includes('configuration') || log.actionType === 'command_execution') {
          severity = 'warning';
        }
        
        const count = severityMap.get(severity) || 0;
        severityMap.set(severity, count + 1);
      });
      
      const severityDistribution = Array.from(severityMap.entries())
        .map(([severity, count]) => ({
          severity,
          count,
          color: SEVERITY_COLORS[severity]
        }));
      
      // 统计每日趋势
      const dayMap = new Map<string, number>();
      const days = Math.ceil(timeRange / (24 * 60 * 60 * 1000));
      
      for (let i = 0; i < days; i++) {
        const date = new Date(startTime + i * 24 * 60 * 60 * 1000);
        const dateStr = date.toISOString().split('T')[0];
        dayMap.set(dateStr, 0);
      }
      
      logs.forEach(log => {
        const date = new Date(log.timestamp).toISOString().split('T')[0];
        const count = dayMap.get(date) || 0;
        dayMap.set(date, count + 1);
      });
      
      const dailyTrend = Array.from(dayMap.entries())
        .map(([date, count]) => ({
          date: new Date(date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }),
          count,
          timestamp: new Date(date).getTime()
        }))
        .sort((a, b) => a.timestamp - b.timestamp);
      
      setStats({
        actionTypes,
        timeDistribution,
        deviceActivity,
        severityDistribution,
        dailyTrend
      });
      
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取审计统计失败');
    } finally {
      setLoading(false);
    }
  };

  // 初始化和定时刷新
  useEffect(() => {
    fetchAuditStats();
    
    const interval = setInterval(fetchAuditStats, refreshInterval);
    return () => clearInterval(interval);
  }, [timeRange, deviceId, actionType, refreshInterval]);

  // 处理图表点击
  const handleChartClick = (type: string, data: any) => {
    if (onStatsClick) {
      onStatsClick(type, data);
    }
  };

  // 自定义工具提示
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="text-sm font-medium text-gray-900 mb-1">{label}</p>
          <p className="text-sm text-blue-600">
            数量: <span className="font-medium">{data.count || data.value}</span>
          </p>
          {data.percentage && (
            <p className="text-sm text-gray-600">
              占比: <span className="font-medium">{data.percentage.toFixed(1)}%</span>
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  // 计算总体统计
  const totalStats = useMemo(() => {
    const totalActions = stats.actionTypes.reduce((sum, item) => sum + item.count, 0);
    const totalDevices = stats.deviceActivity.length;
    const mostActiveAction = stats.actionTypes[0];
    const peakHour = stats.timeDistribution.reduce((max, item) => 
      item.count > max.count ? item : max, { hour: 0, count: 0, label: '' });
    
    return {
      totalActions,
      totalDevices,
      mostActiveAction,
      peakHour
    };
  }, [stats]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">审计统计</h2>
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white p-6 rounded-lg shadow animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
              <div className="h-64 bg-gray-200 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 标题和总体统计 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">审计统计可视化</h2>
          <p className="text-sm text-gray-500 mt-1">
            过去 {Math.ceil(timeRange / (24 * 60 * 60 * 1000))} 天的审计活动分析
          </p>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{totalStats.totalActions}</div>
            <div className="text-xs text-gray-500">总操作数</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{totalStats.totalDevices}</div>
            <div className="text-xs text-gray-500">活跃设备</div>
          </div>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">数据获取失败</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 操作类型分布 */}
        {showActionTypes && stats.actionTypes.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">操作类型分布</h3>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setSelectedChart('pie')}
                  className={clsx(
                    "p-1 rounded",
                    selectedChart === 'pie' ? "bg-blue-100 text-blue-600" : "text-gray-400"
                  )}
                >
                  <PieChartIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setSelectedChart('bar')}
                  className={clsx(
                    "p-1 rounded",
                    selectedChart === 'bar' ? "bg-blue-100 text-blue-600" : "text-gray-400"
                  )}
                >
                  <BarChart3 className="h-4 w-4" />
                </button>
              </div>
            </div>
            
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                {selectedChart === 'pie' ? (
                  <PieChart>
                    <Pie
                      data={stats.actionTypes}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value, percent }) => `${name} ${((percent || 0) * 100).toFixed(1)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="count"
                      onClick={(data) => handleChartClick('actionType', data)}
                    >
                      {stats.actionTypes.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                ) : (
                  <BarChart data={stats.actionTypes}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                    <YAxis />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar 
                      dataKey="count" 
                      onClick={(data) => handleChartClick('actionType', data)}
                    >
                      {stats.actionTypes.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* 时间分布热力图 */}
        {showTimeDistribution && stats.timeDistribution.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">24小时活动分布</h3>
              <Clock className="h-5 w-5 text-gray-400" />
            </div>
            
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.timeDistribution}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <Tooltip content={<CustomTooltip />} />
                  <Area 
                    type="monotone" 
                    dataKey="count" 
                    stroke={COLORS.primary} 
                    fill={COLORS.primary}
                    fillOpacity={0.3}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            
            {totalStats.peakHour.count > 0 && (
              <div className="mt-4 text-sm text-gray-600">
                活动高峰: {totalStats.peakHour.label} ({totalStats.peakHour.count} 次操作)
              </div>
            )}
          </div>
        )}

        {/* 设备活动排行 */}
        {showDeviceActivity && stats.deviceActivity.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">设备活动排行</h3>
              <Users className="h-5 w-5 text-gray-400" />
            </div>
            
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.deviceActivity} layout="horizontal">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="deviceId" type="category" width={80} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar 
                    dataKey="count" 
                    fill={COLORS.secondary}
                    onClick={(data) => handleChartClick('deviceActivity', data)}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* 严重程度分布 */}
        {showSeverityStats && stats.severityDistribution.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">严重程度分布</h3>
              <Shield className="h-5 w-5 text-gray-400" />
            </div>
            
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.severityDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="count"
                    onClick={(data) => handleChartClick('severity', data)}
                  >
                    {stats.severityDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* 每日趋势 */}
      {showDailyTrend && stats.dailyTrend.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">每日活动趋势</h3>
            <TrendingUp className="h-5 w-5 text-gray-400" />
          </div>
          
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip content={<CustomTooltip />} />
                <Line 
                  type="monotone" 
                  dataKey="count" 
                  stroke={COLORS.primary} 
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}