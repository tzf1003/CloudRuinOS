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
  ResponsiveContainer,
  Area,
  AreaChart
} from 'recharts';
import { 
  PieChart as PieChartIcon, 
  BarChart3,
  TrendingUp,
  Shield,
  Activity
} from 'lucide-react';
import { apiClient } from '../lib/api-client';
import { Card } from './ui/Card';

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
    severity: string;
    count: number;
    color: string;
  }>;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

// Simplified mock data generation for demo purposes if API fails or is empty
const generateMockStats = (): AuditStats => {
    return {
        actionTypes: [
            { name: '登录', count: 450, percentage: 45, color: '#3B82F6' },
            { name: '文件访问', count: 300, percentage: 30, color: '#10B981' },
            { name: '命令执行', count: 150, percentage: 15, color: '#F59E0B' },
            { name: '配置变更', count: 100, percentage: 10, color: '#8B5CF6' }
        ],
        timeDistribution: Array.from({ length: 24 }, (_, i) => ({
            hour: i,
            count: Math.floor(Math.random() * 50) + 10,
            label: `${i}:00`
        })),
        deviceActivity: [],
        severityDistribution: [
             { severity: '信息', count: 800, color: '#3B82F6' },
             { severity: '警告', count: 150, color: '#F59E0B' },
             { severity: '错误', count: 50, color: '#EF4444' }
        ]
    };
};

export const AuditStatsChart = () => {
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'pie' | 'bar' | 'trend'>('pie');

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      // specific implementation would call actual API
      // const data = await apiClient.getAuditStats();
      // For now, simulate API call
      await new Promise(resolve => setTimeout(resolve, 800));
      setStats(generateMockStats());
    } catch (error) {
      console.error('Failed to fetch audit stats:', error);
      // Fallback
      setStats(generateMockStats());
    } finally {
      setLoading(false);
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex h-64 items-center justify-center">
            <div className="flex flex-col items-center gap-2">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-cyan-500/20 border-t-cyan-500" />
                <span className="text-sm text-slate-400">正在加载分析...</span>
            </div>
        </div>
      );
    }

    if (!stats) return <div className="text-slate-400 text-center py-10">无可用数据</div>;

    switch (viewMode) {
      case 'pie':
        return (
          <div className="h-64 w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.actionTypes}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="count"
                >
                  {stats.actionTypes.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="rgba(0,0,0,0.2)" />
                  ))}
                </Pie>
                <Tooltip 
                    contentStyle={{ 
                        backgroundColor: 'rgba(15, 23, 42, 0.9)', 
                        borderColor: 'rgba(148, 163, 184, 0.1)',
                        color: '#f8fafc',
                        borderRadius: '0.5rem',
                        backdropFilter: 'blur(12px)'
                    }}
                    itemStyle={{ color: '#e2e8f0' }}
                />
              </PieChart>
            </ResponsiveContainer>
             {/* Simple Legend Overlay */}
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                <div className="text-2xl font-bold text-slate-100">{stats.actionTypes.reduce((acc, curr) => acc + curr.count, 0)}</div>
                <div className="text-xs text-slate-400">总操作数</div>
            </div>
          </div>
        );
      case 'bar':
        return (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.actionTypes} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" horizontal={false} />
                <XAxis type="number" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} width={100} />
                <Tooltip 
                    cursor={{ fill: 'rgba(148, 163, 184, 0.05)' }}
                    contentStyle={{ 
                        backgroundColor: 'rgba(15, 23, 42, 0.9)', 
                        borderColor: 'rgba(148, 163, 184, 0.1)',
                        color: '#f8fafc',
                        borderRadius: '0.5rem'
                    }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
                  {stats.actionTypes.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      case 'trend':
        return (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.timeDistribution}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" vertical={false} />
                <XAxis dataKey="label" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickMargin={10} minTickGap={30} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickMargin={10} />
                <Tooltip 
                     contentStyle={{ 
                        backgroundColor: 'rgba(15, 23, 42, 0.9)', 
                        borderColor: 'rgba(148, 163, 184, 0.1)',
                        color: '#f8fafc',
                        borderRadius: '0.5rem'
                    }}
                />
                <Area 
                    type="monotone" 
                    dataKey="count" 
                    stroke="#8B5CF6" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorCount)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        );
    }
  };

  return (
    <Card variant="glass" className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-100">审计分析</h3>
            <p className="text-xs text-slate-400">安全事件和用户操作</p>
          </div>
        </div>
        
        <div className="flex bg-slate-900/50 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setViewMode('pie')}
            className={`p-1.5 rounded-md transition-all ${
              viewMode === 'pie' 
                ? 'bg-violet-500/20 text-violet-300 shadow-sm' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="分布"
          >
            <PieChartIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('bar')}
            className={`p-1.5 rounded-md transition-all ${
              viewMode === 'bar' 
                ? 'bg-violet-500/20 text-violet-300 shadow-sm' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="对比"
          >
            <BarChart3 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('trend')}
            className={`p-1.5 rounded-md transition-all ${
              viewMode === 'trend' 
                ? 'bg-violet-500/20 text-violet-300 shadow-sm' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="时间线"
          >
            <Activity className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 w-full min-h-0">
        {renderContent()}
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-slate-800/50">
            <div className="text-center">
                <div className="text-xs text-slate-500 mb-1">最频繁</div>
                <div className="text-sm font-medium text-slate-200 truncate">
                    {stats.actionTypes[0]?.name || '-'}
                </div>
            </div>
            <div className="text-center border-l border-slate-800/50">
                <div className="text-xs text-slate-500 mb-1">错误</div>
                <div className="text-sm font-medium text-red-400">
                    {stats.severityDistribution.find(s => s.severity === '错误')?.count || 0}
                </div>
            </div>
            <div className="text-center border-l border-slate-800/50">
                <div className="text-xs text-slate-500 mb-1">活动</div>
                <div className="text-sm font-medium text-emerald-400">
                    {stats.timeDistribution.reduce((acc, curr) => acc + curr.count, 0) > 0 ? '高' : '低'}
                </div>
            </div>
        </div>
      )}
    </Card>
  );
};
