import { useState, useEffect, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Brush
} from 'recharts';
import { 
  TrendingUp, 
  RotateCcw
} from 'lucide-react';
import { apiClient } from '../lib/api-client';
import { clsx } from 'clsx';

// 时间范围选项
type TimeRange = '1h' | '6h' | '24h' | '7d' | '30d' | '90d';

// 趋势数据点接口
interface TrendDataPoint {
  timestamp: number;
  time: string;
  deviceCount: number;
  onlineDevices: number;
  offlineDevices: number;
  activeSessions: number;
  auditActivity: number;
}

// 组件属性接口
interface HistoryTrendChartProps {
  timeRange?: TimeRange;
  showDeviceTrend?: boolean;
  showSessionTrend?: boolean;
  showAuditTrend?: boolean;
  height?: number;
  refreshInterval?: number;
  onDataPointClick?: (dataPoint: TrendDataPoint) => void;
}

// 时间范围配置
const TIME_RANGE_CONFIG = {
  '1h': { label: '1小时', duration: 60 * 60 * 1000, interval: 5 * 60 * 1000 }, // 5分钟间隔
  '6h': { label: '6小时', duration: 6 * 60 * 60 * 1000, interval: 30 * 60 * 1000 }, // 30分钟间隔
  '24h': { label: '24小时', duration: 24 * 60 * 60 * 1000, interval: 60 * 60 * 1000 }, // 1小时间隔
  '7d': { label: '7天', duration: 7 * 24 * 60 * 60 * 1000, interval: 6 * 60 * 60 * 1000 }, // 6小时间隔
  '30d': { label: '30天', duration: 30 * 24 * 60 * 60 * 1000, interval: 24 * 60 * 60 * 1000 }, // 1天间隔
  '90d': { label: '90天', duration: 90 * 24 * 60 * 60 * 1000, interval: 3 * 24 * 60 * 60 * 1000 } // 3天间隔
};

// 图表颜色配置
const CHART_COLORS = {
  deviceCount: '#3B82F6',    // blue-500
  onlineDevices: '#10B981',  // green-500
  offlineDevices: '#EF4444', // red-500
  activeSessions: '#8B5CF6', // violet-500
  auditActivity: '#F59E0B'   // amber-500
};

export function HistoryTrendChart({
  timeRange = '24h',
  showDeviceTrend = true,
  showSessionTrend = true,
  showAuditTrend = false,
  height = 400,
  refreshInterval = 60000, // 1分钟
  onDataPointClick
}: HistoryTrendChartProps) {
  const [selectedTimeRange, setSelectedTimeRange] = useState<TimeRange>(timeRange);
  const [trendData, setTrendData] = useState<TrendDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoomDomain, setZoomDomain] = useState<[number, number] | null>(null);

  // 生成时间序列数据点
  const generateTimePoints = (range: TimeRange): number[] => {
    const config = TIME_RANGE_CONFIG[range];
    const now = Date.now();
    const start = now - config.duration;
    const points: number[] = [];
    
    for (let time = start; time <= now; time += config.interval) {
      points.push(time);
    }
    
    return points;
  };

  // 获取历史趋势数据
  const fetchTrendData = async () => {
    try {
      setError(null);
      
      const timePoints = generateTimePoints(selectedTimeRange);
      const trendPoints: TrendDataPoint[] = [];
      
      // 获取当前数据作为基准
      const [currentDevices, currentSessions] = await Promise.allSettled([
        apiClient.getDevices(),
        apiClient.getSessions()
      ]);
      
      const devices = currentDevices.status === 'fulfilled' ? currentDevices.value : [];
      const sessions = currentSessions.status === 'fulfilled' ? currentSessions.value : [];
      
      // 为每个时间点生成趋势数据
      // 注意：这里是模拟数据，实际应该从后端API获取历史数据
      for (const timestamp of timePoints) {
        const timeAgo = Date.now() - timestamp;
        const hoursAgo = timeAgo / (60 * 60 * 1000);
        
        // 模拟设备数量变化（实际应该从历史数据获取）
        const deviceVariation = Math.sin(hoursAgo / 12) * 0.1 + Math.random() * 0.05;
        const baseDeviceCount = devices.length;
        const deviceCount = Math.max(0, Math.round(baseDeviceCount * (1 + deviceVariation)));
        
        // 模拟在线设备比例变化
        const onlineRatio = Math.max(0.3, Math.min(0.95, 0.7 + Math.sin(hoursAgo / 6) * 0.2 + Math.random() * 0.1));
        const onlineDevices = Math.round(deviceCount * onlineRatio);
        const offlineDevices = deviceCount - onlineDevices;
        
        // 模拟活跃会话变化
        const sessionVariation = Math.sin(hoursAgo / 8) * 0.3 + Math.random() * 0.1;
        const baseSessionCount = sessions.filter(s => s.status === 'active' || s.status === 'connected').length;
        const activeSessions = Math.max(0, Math.round(baseSessionCount * (1 + sessionVariation)));
        
        // 模拟审计活动
        const auditVariation = Math.sin(hoursAgo / 4) * 0.5 + Math.random() * 0.2;
        const auditActivity = Math.max(0, Math.round(10 * (1 + auditVariation)));
        
        trendPoints.push({
          timestamp,
          time: formatTimeLabel(timestamp, selectedTimeRange),
          deviceCount,
          onlineDevices,
          offlineDevices,
          activeSessions,
          auditActivity
        });
      }
      
      setTrendData(trendPoints);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取趋势数据失败');
    } finally {
      setLoading(false);
    }
  };

  // 格式化时间标签
  const formatTimeLabel = (timestamp: number, range: TimeRange): string => {
    const date = new Date(timestamp);
    
    switch (range) {
      case '1h':
      case '6h':
        return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      case '24h':
        return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      case '7d':
        return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit' });
      case '30d':
      case '90d':
        return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
      default:
        return date.toLocaleString('zh-CN');
    }
  };

  // 初始化和定时刷新
  useEffect(() => {
    fetchTrendData();
    
    const interval = setInterval(fetchTrendData, refreshInterval);
    return () => clearInterval(interval);
  }, [selectedTimeRange, refreshInterval]);

  // 处理时间范围变更
  const handleTimeRangeChange = (range: TimeRange) => {
    setSelectedTimeRange(range);
    setZoomDomain(null); // 重置缩放
    setLoading(true);
  };

  // 处理图表点击
  const handleDataPointClick = (data: any) => {
    if (onDataPointClick && data.activePayload?.[0]?.payload) {
      onDataPointClick(data.activePayload[0].payload);
    }
  };

  // 重置缩放
  const handleResetZoom = () => {
    setZoomDomain(null);
  };

  // 自定义工具提示
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="text-sm font-medium text-gray-900 mb-2">{label}</p>
          {showDeviceTrend && (
            <>
              <p className="text-sm text-blue-600">
                设备总数: <span className="font-medium">{data.deviceCount}</span>
              </p>
              <p className="text-sm text-green-600">
                在线设备: <span className="font-medium">{data.onlineDevices}</span>
              </p>
              <p className="text-sm text-red-600">
                离线设备: <span className="font-medium">{data.offlineDevices}</span>
              </p>
            </>
          )}
          {showSessionTrend && (
            <p className="text-sm text-violet-600">
              活跃会话: <span className="font-medium">{data.activeSessions}</span>
            </p>
          )}
          {showAuditTrend && (
            <p className="text-sm text-amber-600">
              审计活动: <span className="font-medium">{data.auditActivity}</span>
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  // 计算统计信息
  const stats = useMemo(() => {
    if (trendData.length === 0) return null;
    
    const latest = trendData[trendData.length - 1];
    const previous = trendData[trendData.length - 2];
    
    if (!previous) return { latest };
    
    return {
      latest,
      changes: {
        deviceCount: latest.deviceCount - previous.deviceCount,
        onlineDevices: latest.onlineDevices - previous.onlineDevices,
        activeSessions: latest.activeSessions - previous.activeSessions,
        auditActivity: latest.auditActivity - previous.auditActivity
      }
    };
  }, [trendData]);

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">历史趋势</h3>
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
        </div>
        <div className="h-96 flex items-center justify-center">
          <div className="text-gray-500">加载趋势数据中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      {/* 标题和控制区域 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <TrendingUp className="h-5 w-5 text-blue-500" />
          <h3 className="text-lg font-medium text-gray-900">历史趋势</h3>
        </div>
        
        <div className="flex items-center space-x-3">
          {/* 时间范围选择器 */}
          <div className="flex items-center space-x-1 bg-gray-100 rounded-lg p-1">
            {Object.entries(TIME_RANGE_CONFIG).map(([key, config]) => (
              <button
                key={key}
                onClick={() => handleTimeRangeChange(key as TimeRange)}
                className={clsx(
                  "px-3 py-1 text-sm font-medium rounded-md transition-colors",
                  selectedTimeRange === key
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                )}
              >
                {config.label}
              </button>
            ))}
          </div>
          
          {/* 缩放控制 */}
          {zoomDomain && (
            <button
              onClick={handleResetZoom}
              className="inline-flex items-center px-2 py-1 text-sm text-gray-600 hover:text-gray-900"
              title="重置缩放"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* 统计信息 */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {showDeviceTrend && (
            <>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {stats.latest.deviceCount}
                </div>
                <div className="text-sm text-gray-500">设备总数</div>
                {stats.changes && (
                  <div className={clsx(
                    "text-xs font-medium",
                    stats.changes.deviceCount > 0 ? "text-green-600" : 
                    stats.changes.deviceCount < 0 ? "text-red-600" : "text-gray-500"
                  )}>
                    {stats.changes.deviceCount > 0 ? '+' : ''}{stats.changes.deviceCount}
                  </div>
                )}
              </div>
              
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {stats.latest.onlineDevices}
                </div>
                <div className="text-sm text-gray-500">在线设备</div>
                {stats.changes && (
                  <div className={clsx(
                    "text-xs font-medium",
                    stats.changes.onlineDevices > 0 ? "text-green-600" : 
                    stats.changes.onlineDevices < 0 ? "text-red-600" : "text-gray-500"
                  )}>
                    {stats.changes.onlineDevices > 0 ? '+' : ''}{stats.changes.onlineDevices}
                  </div>
                )}
              </div>
            </>
          )}
          
          {showSessionTrend && (
            <div className="text-center">
              <div className="text-2xl font-bold text-violet-600">
                {stats.latest.activeSessions}
              </div>
              <div className="text-sm text-gray-500">活跃会话</div>
              {stats.changes && (
                <div className={clsx(
                  "text-xs font-medium",
                  stats.changes.activeSessions > 0 ? "text-green-600" : 
                  stats.changes.activeSessions < 0 ? "text-red-600" : "text-gray-500"
                )}>
                  {stats.changes.activeSessions > 0 ? '+' : ''}{stats.changes.activeSessions}
                </div>
              )}
            </div>
          )}
          
          {showAuditTrend && (
            <div className="text-center">
              <div className="text-2xl font-bold text-amber-600">
                {stats.latest.auditActivity}
              </div>
              <div className="text-sm text-gray-500">审计活动</div>
              {stats.changes && (
                <div className={clsx(
                  "text-xs font-medium",
                  stats.changes.auditActivity > 0 ? "text-green-600" : 
                  stats.changes.auditActivity < 0 ? "text-red-600" : "text-gray-500"
                )}>
                  {stats.changes.auditActivity > 0 ? '+' : ''}{stats.changes.auditActivity}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 趋势图表 */}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={trendData}
            onClick={handleDataPointClick}
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis 
              dataKey="time" 
              stroke="#6b7280"
              fontSize={12}
              tick={{ fontSize: 12 }}
            />
            <YAxis 
              stroke="#6b7280"
              fontSize={12}
              tick={{ fontSize: 12 }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            
            {showDeviceTrend && (
              <>
                <Line
                  type="monotone"
                  dataKey="deviceCount"
                  stroke={CHART_COLORS.deviceCount}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  name="设备总数"
                />
                <Line
                  type="monotone"
                  dataKey="onlineDevices"
                  stroke={CHART_COLORS.onlineDevices}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  name="在线设备"
                />
              </>
            )}
            
            {showSessionTrend && (
              <Line
                type="monotone"
                dataKey="activeSessions"
                stroke={CHART_COLORS.activeSessions}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                name="活跃会话"
              />
            )}
            
            {showAuditTrend && (
              <Line
                type="monotone"
                dataKey="auditActivity"
                stroke={CHART_COLORS.auditActivity}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                name="审计活动"
              />
            )}
            
            {/* 数据钻取支持 */}
            <Brush 
              dataKey="time" 
              height={30}
              stroke={CHART_COLORS.deviceCount}
              onChange={(domain) => setZoomDomain(domain ? [domain.startIndex || 0, domain.endIndex || trendData.length - 1] : null)}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      
      {/* 图表说明 */}
      <div className="mt-4 text-xs text-gray-500 text-center">
        点击数据点查看详情 • 拖拽下方滑块进行数据钻取 • 数据每{Math.round(refreshInterval / 1000)}秒自动更新
      </div>
    </div>
  );
}