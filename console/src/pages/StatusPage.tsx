import React, { useState, useEffect } from 'react';
import { RefreshCw, Activity, AlertTriangle, CheckCircle, XCircle, Clock } from 'lucide-react';
import { useHealthMonitor } from '../hooks/useHealthMonitor';
import { apiClient } from '../lib/api-client';
import { Device, Session } from '../types/api';

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
        return 'text-green-600';
      case 'degraded':
        return 'text-yellow-600';
      case 'unhealthy':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'degraded':
        return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
      case 'unhealthy':
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return <Clock className="w-5 h-5 text-gray-600" />;
    }
  };

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

  const formatLastUpdate = (timestamp: number | null) => {
    if (!timestamp) return '从未更新';
    const now = Date.now();
    const diff = Math.floor((now - timestamp) / 1000);
    
    if (diff < 60) return `${diff}秒前`;
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
    return `${Math.floor(diff / 3600)}小时前`;
  };

  const onlineDevices = devices.filter(d => d.status === 'online').length;
  const activeSessions = sessions.filter(s => s.status === 'active' || s.status === 'connected').length;

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">系统状态</h1>
            <p className="mt-1 text-sm text-gray-600">
              监控系统健康状态和性能指标
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <label className="text-sm text-gray-600">自动刷新</label>
              <button
                onClick={() => {
                  setAutoRefresh(!autoRefresh);
                  toggleAutoRefresh();
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  autoRefresh ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    autoRefresh ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              className="text-sm border border-gray-300 rounded-md px-3 py-1"
            >
              <option value={10000}>10秒</option>
              <option value={30000}>30秒</option>
              <option value={60000}>1分钟</option>
              <option value={300000}>5分钟</option>
            </select>
            <button
              onClick={refresh}
              disabled={loading}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>刷新</span>
            </button>
          </div>
        </div>
        {lastUpdate && (
          <p className="mt-2 text-xs text-gray-500">
            最后更新: {formatLastUpdate(lastUpdate)}
            {!isConnected && <span className="text-red-500 ml-2">● 连接断开</span>}
          </p>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <XCircle className="w-5 h-5 text-red-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">健康检查失败</h3>
              <p className="mt-1 text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Main Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              {getStatusIcon(health?.status || 'unknown')}
            </div>
            <div className="ml-3">
              <div className={`text-lg font-semibold ${getStatusColor(health?.status || 'unknown')}`}>
                {health?.status === 'healthy' ? '正常' : 
                 health?.status === 'degraded' ? '降级' : 
                 health?.status === 'unhealthy' ? '异常' : '未知'}
              </div>
              <div className="text-sm text-gray-500">系统状态</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Activity className="w-5 h-5 text-blue-600" />
            </div>
            <div className="ml-3">
              <div className="text-lg font-semibold text-blue-600">{onlineDevices}</div>
              <div className="text-sm text-gray-500">在线设备</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Activity className="w-5 h-5 text-purple-600" />
            </div>
            <div className="ml-3">
              <div className="text-lg font-semibold text-purple-600">{activeSessions}</div>
              <div className="text-sm text-gray-500">活跃会话</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Clock className="w-5 h-5 text-green-600" />
            </div>
            <div className="ml-3">
              <div className="text-lg font-semibold text-green-600">
                {metrics?.uptime ? formatUptime(metrics.uptime) : '未知'}
              </div>
              <div className="text-sm text-gray-500">系统运行时间</div>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Health Information */}
      {health && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* System Components Health */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">系统组件状态</h3>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {Object.entries(health.checks).map(([component, status]) => (
                  <div key={component} className="flex items-center justify-between">
                    <div className="flex items-center">
                      {getStatusIcon(status.status)}
                      <span className="ml-3 text-sm font-medium text-gray-900 capitalize">
                        {component === 'database' ? '数据库' :
                         component === 'kv' ? 'KV存储' :
                         component === 'r2' ? 'R2存储' :
                         component === 'durableObjects' ? '持久对象' :
                         component === 'secrets' ? '密钥管理' : component}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-medium ${getStatusColor(status.status)}`}>
                        {status.status === 'healthy' ? '正常' : 
                         status.status === 'degraded' ? '降级' : '异常'}
                      </div>
                      {status.responseTime && (
                        <div className="text-xs text-gray-500">
                          {status.responseTime}ms
                        </div>
                      )}
                      {status.error && (
                        <div className="text-xs text-red-500 max-w-xs truncate">
                          {status.error}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* System Metrics */}
          {metrics && (
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">性能指标</h3>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">请求总数</span>
                    <span className="text-sm font-medium">{metrics.requestCount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">错误率</span>
                    <span className="text-sm font-medium">
                      {(metrics.errorRate * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">平均响应时间</span>
                    <span className="text-sm font-medium">
                      {metrics.averageResponseTime.toFixed(0)}ms
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">活跃连接</span>
                    <span className="text-sm font-medium">{metrics.activeConnections}</span>
                  </div>
                  {metrics.memoryUsage && (
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">内存使用</span>
                      <span className="text-sm font-medium">
                        {(metrics.memoryUsage / 1024 / 1024).toFixed(1)} MB
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Readiness and Liveness Status */}
      {(readiness || liveness) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {readiness && (
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  {getStatusIcon(readiness.status === 'ready' ? 'healthy' : 'unhealthy')}
                </div>
                <div className="ml-3">
                  <div className="text-lg font-medium text-gray-900">就绪检查</div>
                  <div className={`text-sm ${readiness.status === 'ready' ? 'text-green-600' : 'text-red-600'}`}>
                    {readiness.status === 'ready' ? '服务就绪' : '服务未就绪'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {liveness && (
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  {getStatusIcon(liveness.status === 'alive' ? 'healthy' : 'unhealthy')}
                </div>
                <div className="ml-3">
                  <div className="text-lg font-medium text-gray-900">存活检查</div>
                  <div className={`text-sm ${liveness.status === 'alive' ? 'text-green-600' : 'text-red-600'}`}>
                    {liveness.status === 'alive' ? '服务存活' : '服务异常'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}