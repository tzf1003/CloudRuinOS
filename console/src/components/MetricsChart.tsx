import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Brush
} from 'recharts';
import { 
  TrendingUp, 
  BarChart3, 
  Activity, 
  Clock, 
  Zap, 
  Users,
  Download,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { SystemMetrics } from '../types/api';

interface MetricsChartProps {
  metrics: SystemMetrics[];
  timeRange: '1h' | '6h' | '24h' | '7d';
  chartType: 'line' | 'area' | 'bar';
  showLegend?: boolean;
  height?: number;
  onTimeRangeChange?: (range: '1h' | '6h' | '24h' | '7d') => void;
  onChartTypeChange?: (type: 'line' | 'area' | 'bar') => void;
}

interface ChartDataPoint {
  timestamp: number;
  time: string;
  responseTime: number;
  errorRate: number;
  activeConnections: number;
  requestCount: number;
  memoryUsage?: number;
}

interface MetricConfig {
  key: keyof ChartDataPoint;
  name: string;
  color: string;
  unit: string;
  icon: React.ComponentType<{ className?: string }>;
  formatter: (value: number) => string;
}

const metricConfigs: MetricConfig[] = [
  {
    key: 'responseTime',
    name: '响应时间',
    color: '#3B82F6',
    unit: 'ms',
    icon: Clock,
    formatter: (value) => `${value.toFixed(0)}ms`
  },
  {
    key: 'errorRate',
    name: '错误率',
    color: '#EF4444',
    unit: '%',
    icon: TrendingUp,
    formatter: (value) => `${(value * 100).toFixed(2)}%`
  },
  {
    key: 'activeConnections',
    name: '活跃连接',
    color: '#10B981',
    unit: '',
    icon: Users,
    formatter: (value) => value.toString()
  },
  {
    key: 'requestCount',
    name: '请求数',
    color: '#8B5CF6',
    unit: '',
    icon: Activity,
    formatter: (value) => value.toLocaleString()
  }
];

const timeRangeOptions = [
  { value: '1h', label: '1小时' },
  { value: '6h', label: '6小时' },
  { value: '24h', label: '24小时' },
  { value: '7d', label: '7天' }
] as const;

const chartTypeOptions = [
  { value: 'line', label: '折线图', icon: TrendingUp },
  { value: 'area', label: '面积图', icon: BarChart3 },
  { value: 'bar', label: '柱状图', icon: BarChart3 }
] as const;

export function MetricsChart({
  metrics,
  timeRange,
  chartType,
  showLegend = true,
  height = 400,
  onTimeRangeChange,
  onChartTypeChange
}: MetricsChartProps) {
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['responseTime', 'errorRate']);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [brushDomain, setBrushDomain] = useState<[number, number] | null>(null);

  // Transform metrics data for chart
  const chartData = useMemo(() => {
    return metrics.map((metric, index) => ({
      timestamp: Date.now() - (metrics.length - index - 1) * 30000, // 假设30秒间隔
      time: new Date(Date.now() - (metrics.length - index - 1) * 30000).toLocaleTimeString(),
      responseTime: metric.averageResponseTime,
      errorRate: metric.errorRate,
      activeConnections: metric.activeConnections,
      requestCount: metric.requestCount,
      memoryUsage: metric.memoryUsage ? metric.memoryUsage / 1024 / 1024 : undefined // Convert to MB
    }));
  }, [metrics]);

  // Calculate statistics
  const statistics = useMemo(() => {
    if (chartData.length === 0) return null;

    const stats: Record<string, { current: number; avg: number; min: number; max: number; trend: 'up' | 'down' | 'stable' }> = {};

    selectedMetrics.forEach(metricKey => {
      const values = chartData.map(d => d[metricKey as keyof ChartDataPoint]).filter(v => typeof v === 'number') as number[];
      
      if (values.length > 0) {
        const current = values[values.length - 1];
        const previous = values.length > 1 ? values[values.length - 2] : current;
        const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
        const min = Math.min(...values);
        const max = Math.max(...values);
        
        let trend: 'up' | 'down' | 'stable' = 'stable';
        if (current > previous * 1.05) trend = 'up';
        else if (current < previous * 0.95) trend = 'down';

        stats[metricKey] = { current, avg, min, max, trend };
      }
    });

    return stats;
  }, [chartData, selectedMetrics]);

  const toggleMetric = (metricKey: string) => {
    setSelectedMetrics(prev => 
      prev.includes(metricKey) 
        ? prev.filter(k => k !== metricKey)
        : [...prev, metricKey]
    );
  };

  const handleBrushChange = (domain: any) => {
    if (domain && domain.startIndex !== undefined && domain.endIndex !== undefined) {
      setBrushDomain([domain.startIndex, domain.endIndex]);
    } else {
      setBrushDomain(null);
    }
  };

  const exportChart = () => {
    // 简单的导出功能 - 在实际应用中可以使用更复杂的导出库
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // 这里可以实现图表导出逻辑
      console.log('Export chart functionality would be implemented here');
    }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="text-sm font-medium text-gray-900 mb-2">{label}</p>
          {payload.map((entry: any, index: number) => {
            const config = metricConfigs.find(c => c.key === entry.dataKey);
            return (
              <div key={index} className="flex items-center justify-between space-x-4">
                <div className="flex items-center space-x-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-sm text-gray-600">{config?.name || entry.dataKey}</span>
                </div>
                <span className="text-sm font-medium">
                  {config?.formatter(entry.value) || entry.value}
                </span>
              </div>
            );
          })}
        </div>
      );
    }
    return null;
  };

  const renderChart = () => {
    const commonProps = {
      data: chartData,
      margin: { top: 5, right: 30, left: 20, bottom: 5 }
    };

    const xAxisProps = {
      dataKey: 'time',
      tick: { fontSize: 12 },
      tickLine: false,
      axisLine: false
    };

    const yAxisProps = {
      tick: { fontSize: 12 },
      tickLine: false,
      axisLine: false
    };

    switch (chartType) {
      case 'area':
        return (
          <AreaChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip content={<CustomTooltip />} />
            {showLegend && <Legend />}
            {selectedMetrics.map(metricKey => {
              const config = metricConfigs.find(c => c.key === metricKey);
              return config ? (
                <Area
                  key={metricKey}
                  type="monotone"
                  dataKey={metricKey}
                  stroke={config.color}
                  fill={config.color}
                  fillOpacity={0.3}
                  strokeWidth={2}
                  name={config.name}
                />
              ) : null;
            })}
            {brushDomain && <Brush dataKey="time" height={30} onChange={handleBrushChange} />}
          </AreaChart>
        );

      case 'bar':
        return (
          <BarChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip content={<CustomTooltip />} />
            {showLegend && <Legend />}
            {selectedMetrics.map(metricKey => {
              const config = metricConfigs.find(c => c.key === metricKey);
              return config ? (
                <Bar
                  key={metricKey}
                  dataKey={metricKey}
                  fill={config.color}
                  name={config.name}
                />
              ) : null;
            })}
          </BarChart>
        );

      default: // line
        return (
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip content={<CustomTooltip />} />
            {showLegend && <Legend />}
            {selectedMetrics.map(metricKey => {
              const config = metricConfigs.find(c => c.key === metricKey);
              return config ? (
                <Line
                  key={metricKey}
                  type="monotone"
                  dataKey={metricKey}
                  stroke={config.color}
                  strokeWidth={2}
                  dot={false}
                  name={config.name}
                />
              ) : null;
            })}
            {brushDomain && <Brush dataKey="time" height={30} onChange={handleBrushChange} />}
          </LineChart>
        );
    }
  };

  if (metrics.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <div className="text-center">
          <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">暂无指标数据</h3>
          <p className="text-gray-600">等待系统收集性能指标数据...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg border border-gray-200 ${isFullscreen ? 'fixed inset-4 z-50' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div>
          <h3 className="text-lg font-medium text-gray-900">性能指标图表</h3>
          <p className="text-sm text-gray-600">实时系统性能监控</p>
        </div>
        
        <div className="flex items-center space-x-4">
          {/* Time Range Selector */}
          {onTimeRangeChange && (
            <select
              value={timeRange}
              onChange={(e) => onTimeRangeChange(e.target.value as any)}
              className="text-sm border border-gray-300 rounded-md px-3 py-1"
            >
              {timeRangeOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}

          {/* Chart Type Selector */}
          {onChartTypeChange && (
            <div className="flex border border-gray-300 rounded-md">
              {chartTypeOptions.map(option => (
                <button
                  key={option.value}
                  onClick={() => onChartTypeChange(option.value)}
                  className={`px-3 py-1 text-sm flex items-center space-x-1 ${
                    chartType === option.value
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-50'
                  } ${option.value === 'line' ? 'rounded-l-md' : option.value === 'bar' ? 'rounded-r-md' : ''}`}
                >
                  <option.icon className="w-4 h-4" />
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Export Button */}
          <button
            onClick={exportChart}
            className="p-2 text-gray-400 hover:text-gray-600"
            title="导出图表"
          >
            <Download className="w-4 h-4" />
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 text-gray-400 hover:text-gray-600"
            title={isFullscreen ? "退出全屏" : "全屏显示"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Metrics Selector */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex flex-wrap gap-2">
          {metricConfigs.map(config => (
            <button
              key={config.key}
              onClick={() => toggleMetric(config.key)}
              className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm transition-colors ${
                selectedMetrics.includes(config.key)
                  ? 'bg-blue-100 text-blue-700 border border-blue-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <config.icon className="w-4 h-4" />
              <span>{config.name}</span>
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: config.color }}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Statistics */}
      {statistics && (
        <div className="p-4 border-b border-gray-200">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {selectedMetrics.map(metricKey => {
              const config = metricConfigs.find(c => c.key === metricKey);
              const stat = statistics[metricKey];
              
              if (!config || !stat) return null;

              return (
                <div key={metricKey} className="text-center">
                  <div className="flex items-center justify-center space-x-1 mb-1">
                    <config.icon className="w-4 h-4 text-gray-600" />
                    <span className="text-sm font-medium text-gray-900">{config.name}</span>
                  </div>
                  <div className="text-lg font-bold" style={{ color: config.color }}>
                    {config.formatter(stat.current)}
                  </div>
                  <div className="text-xs text-gray-500">
                    平均: {config.formatter(stat.avg)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="p-4">
        <ResponsiveContainer width="100%" height={isFullscreen ? height * 1.5 : height}>
          {renderChart()}
        </ResponsiveContainer>
      </div>

      {/* Chart Controls */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between text-sm text-gray-600">
          <div className="flex items-center space-x-4">
            <span>数据点: {chartData.length}</span>
            <span>时间范围: {timeRangeOptions.find(o => o.value === timeRange)?.label}</span>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setBrushDomain(null)}
              className="px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50"
            >
              重置缩放
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MetricsChart;