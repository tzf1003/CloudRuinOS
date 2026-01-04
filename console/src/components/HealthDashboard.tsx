import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Database, 
  HardDrive, 
  Key, 
  Layers,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus
} from 'lucide-react';
import { HealthData, SystemMetrics, HealthStatus } from '../types/api';

interface HealthDashboardProps {
  refreshInterval?: number; // 默认 30 秒
  showMetrics?: boolean;
  compactMode?: boolean;
  health: HealthData | null;
  metrics: SystemMetrics | null;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}

interface ComponentStatusProps {
  name: string;
  status: HealthStatus;
  icon: React.ComponentType<{ className?: string }>;
  displayName: string;
}

function ComponentStatus({ name, status, icon: Icon, displayName }: ComponentStatusProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'degraded':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'unhealthy':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-4 h-4" />;
      case 'degraded':
        return <AlertTriangle className="w-4 h-4" />;
      case 'unhealthy':
        return <XCircle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'healthy':
        return '正常';
      case 'degraded':
        return '降级';
      case 'unhealthy':
        return '异常';
      default:
        return '未知';
    }
  };

  return (
    <div className={`border rounded-lg p-4 ${getStatusColor(status.status)}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <Icon className="w-5 h-5" />
          <span className="font-medium text-sm">{displayName}</span>
        </div>
        <div className="flex items-center space-x-1">
          {getStatusIcon(status.status)}
          <span className="text-xs font-medium">{getStatusText(status.status)}</span>
        </div>
      </div>
      
      <div className="space-y-1">
        {status.responseTime && (
          <div className="flex justify-between text-xs">
            <span>响应时间</span>
            <span className="font-mono">{status.responseTime}ms</span>
          </div>
        )}
        
        <div className="flex justify-between text-xs">
          <span>最后检查</span>
          <span className="font-mono">
            {new Date(status.lastCheck).toLocaleTimeString()}
          </span>
        </div>
        
        {status.error && (
          <div className="mt-2 p-2 bg-white bg-opacity-50 rounded text-xs">
            <span className="font-medium">错误:</span>
            <div className="mt-1 break-words">{status.error}</div>
          </div>
        )}
      </div>
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: string | number;
  unit?: string;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: string;
  icon: React.ComponentType<{ className?: string }>;
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple';
}

function MetricCard({ title, value, unit, trend, trendValue, icon: Icon, color = 'blue' }: MetricCardProps) {
  const getColorClasses = (color: string) => {
    switch (color) {
      case 'green':
        return 'text-green-600 bg-green-50';
      case 'yellow':
        return 'text-yellow-600 bg-yellow-50';
      case 'red':
        return 'text-red-600 bg-red-50';
      case 'purple':
        return 'text-purple-600 bg-purple-50';
      default:
        return 'text-blue-600 bg-blue-50';
    }
  };

  const getTrendIcon = () => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="w-3 h-3 text-green-500" />;
      case 'down':
        return <TrendingDown className="w-3 h-3 text-red-500" />;
      default:
        return <Minus className="w-3 h-3 text-gray-400" />;
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className={`p-2 rounded-lg ${getColorClasses(color)}`}>
          <Icon className="w-4 h-4" />
        </div>
        {trend && trendValue && (
          <div className="flex items-center space-x-1">
            {getTrendIcon()}
            <span className="text-xs text-gray-600">{trendValue}</span>
          </div>
        )}
      </div>
      
      <div className="space-y-1">
        <div className="text-2xl font-bold text-gray-900">
          {typeof value === 'number' ? value.toLocaleString() : value}
          {unit && <span className="text-sm text-gray-500 ml-1">{unit}</span>}
        </div>
        <div className="text-sm text-gray-600">{title}</div>
      </div>
    </div>
  );
}

export function HealthDashboard({
  refreshInterval = 30000,
  showMetrics = true,
  compactMode = false,
  health,
  metrics,
  loading = false,
  error = null,
  onRefresh
}: HealthDashboardProps) {
  const [lastRefresh, setLastRefresh] = useState<number>(Date.now());

  useEffect(() => {
    if (health) {
      setLastRefresh(Date.now());
    }
  }, [health]);

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return `${days}天 ${hours}小时`;
    } else if (hours > 0) {
      return `${hours}小时 ${minutes}分钟`;
    } else {
      return `${minutes}分钟`;
    }
  };

  const getOverallStatusColor = () => {
    if (!health) return 'text-gray-600';
    
    switch (health.status) {
      case 'healthy':
        return 'text-green-600';
      case 'degraded':
        return 'text-yellow-600';
      case 'unhealthy':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const getOverallStatusText = () => {
    if (!health) return '未知';
    
    switch (health.status) {
      case 'healthy':
        return '系统正常';
      case 'degraded':
        return '系统降级';
      case 'unhealthy':
        return '系统异常';
      default:
        return '状态未知';
    }
  };

  const componentConfigs = [
    { key: 'database', icon: Database, displayName: '数据库' },
    { key: 'kv', icon: HardDrive, displayName: 'KV存储' },
    { key: 'r2', icon: HardDrive, displayName: 'R2存储' },
    { key: 'durableObjects', icon: Layers, displayName: '持久对象' },
    { key: 'secrets', icon: Key, displayName: '密钥管理' }
  ];

  if (compactMode) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Activity className={`w-6 h-6 ${getOverallStatusColor()}`} />
            <div>
              <div className={`font-semibold ${getOverallStatusColor()}`}>
                {getOverallStatusText()}
              </div>
              <div className="text-sm text-gray-500">
                {health?.version && `v${health.version}`}
                {health?.environment && ` • ${health.environment}`}
              </div>
            </div>
          </div>
          
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>

        {health && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {componentConfigs.map(({ key, icon: Icon, displayName }) => {
              const status = health.checks[key as keyof typeof health.checks];
              return (
                <div key={key} className="flex items-center space-x-2 p-2 rounded border">
                  <Icon className="w-4 h-4 text-gray-600" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{displayName}</div>
                    <div className={`text-xs ${
                      status.status === 'healthy' ? 'text-green-600' :
                      status.status === 'degraded' ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {status.status === 'healthy' ? '正常' : 
                       status.status === 'degraded' ? '降级' : '异常'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">系统健康监控</h2>
          <p className="text-sm text-gray-600 mt-1">
            实时监控系统组件状态和性能指标
          </p>
        </div>
        
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>刷新</span>
          </button>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">健康检查失败</h3>
              <p className="mt-1 text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Overall Status */}
      {health && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-4">
              <Activity className={`w-8 h-8 ${getOverallStatusColor()}`} />
              <div>
                <div className={`text-xl font-semibold ${getOverallStatusColor()}`}>
                  {getOverallStatusText()}
                </div>
                <div className="text-sm text-gray-500">
                  {health.version && `版本 ${health.version}`}
                  {health.environment && ` • 环境: ${health.environment}`}
                </div>
              </div>
            </div>
            
            <div className="text-right">
              <div className="text-sm text-gray-500">最后更新</div>
              <div className="text-sm font-mono">
                {new Date(lastRefresh).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* System Components */}
      {health && (
        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-4">系统组件状态</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {componentConfigs.map(({ key, icon, displayName }) => {
              const status = health.checks[key as keyof typeof health.checks];
              return (
                <ComponentStatus
                  key={key}
                  name={key}
                  status={status}
                  icon={icon}
                  displayName={displayName}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Performance Metrics */}
      {showMetrics && metrics && (
        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-4">性能指标</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="系统运行时间"
              value={formatUptime(metrics.uptime)}
              icon={Clock}
              color="green"
            />
            
            <MetricCard
              title="请求总数"
              value={metrics.requestCount}
              icon={Activity}
              color="blue"
            />
            
            <MetricCard
              title="错误率"
              value={`${(metrics.errorRate * 100).toFixed(2)}%`}
              icon={AlertTriangle}
              color={metrics.errorRate > 0.05 ? 'red' : metrics.errorRate > 0.01 ? 'yellow' : 'green'}
            />
            
            <MetricCard
              title="平均响应时间"
              value={`${metrics.averageResponseTime.toFixed(0)}ms`}
              icon={TrendingUp}
              color={metrics.averageResponseTime > 1000 ? 'red' : metrics.averageResponseTime > 500 ? 'yellow' : 'green'}
            />
            
            <MetricCard
              title="活跃连接"
              value={metrics.activeConnections}
              icon={Activity}
              color="purple"
            />
            
            {metrics.memoryUsage && (
              <MetricCard
                title="内存使用"
                value={`${(metrics.memoryUsage / 1024 / 1024).toFixed(1)} MB`}
                icon={HardDrive}
                color="blue"
              />
            )}
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && !health && (
        <div className="bg-white rounded-lg border border-gray-200 p-8">
          <div className="flex items-center justify-center">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-600 mr-3" />
            <span className="text-gray-600">正在加载健康状态...</span>
          </div>
        </div>
      )}

      {/* No Data State */}
      {!loading && !health && !error && (
        <div className="bg-white rounded-lg border border-gray-200 p-8">
          <div className="text-center">
            <Activity className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">暂无健康数据</h3>
            <p className="text-gray-600 mb-4">点击刷新按钮获取最新的系统健康状态</p>
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                立即刷新
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default HealthDashboard;