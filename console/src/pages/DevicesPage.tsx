import { useState } from 'react';
import { Plus, Search, RefreshCw, Server, Wifi, WifiOff, Activity } from 'lucide-react';
import { useDevices } from '../hooks/useApi';
import { Device } from '../types/api';
import { DeviceCard } from '../components/DeviceCard';
import { EnrollmentTokenDialog } from '../components/EnrollmentTokenDialog';
import { Card } from '../components/ui/Card';

export function DevicesPage() {
  const [showTokenDialog, setShowTokenDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: devices = [], isLoading, refetch } = useDevices();

  // Filter devices based on search and status
  const filteredDevices = devices.filter(device => {
    const matchesSearch = device.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         device.platform.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || device.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Calculate statistics
  const stats = {
    total: devices.length,
    online: devices.filter(d => d.status === 'online').length,
    offline: devices.filter(d => d.status === 'offline').length,
    busy: devices.filter(d => d.status === 'busy').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">设备管理</h1>
          <p className="mt-1 text-sm text-slate-400">
            监控和管理您的设备群
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="inline-flex items-center px-4 py-2 rounded-lg border border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800 hover:text-white hover:border-slate-600 transition-all shadow-sm backdrop-blur-sm disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            刷新
          </button>
          <button
            onClick={() => setShowTokenDialog(true)}
            className="inline-flex items-center px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-white font-medium shadow-[0_0_15px_-3px_rgba(6,182,212,0.4)] transition-all hover:shadow-[0_0_20px_-3px_rgba(6,182,212,0.6)]"
          >
            <Plus className="h-4 w-4 mr-2" />
            注册设备
          </button>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card variant="glass" className="p-4 flex items-center space-x-4">
          <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-200">
            <Server className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-400">设备总数</p>
            <p className="text-2xl font-bold text-slate-100">{stats.total}</p>
          </div>
        </Card>

        <Card variant="glass" className="p-4 flex items-center space-x-4">
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Wifi className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-400">在线</p>
            <p className="text-2xl font-bold text-slate-100">{stats.online}</p>
          </div>
        </Card>

        <Card variant="glass" className="p-4 flex items-center space-x-4">
           <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
            <WifiOff className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-400">离线</p>
            <p className="text-2xl font-bold text-slate-100">{stats.offline}</p>
          </div>
        </Card>

        <Card variant="glass" className="p-4 flex items-center space-x-4">
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-400">忙碌</p>
            <p className="text-2xl font-bold text-slate-100">{stats.busy}</p>
          </div>
        </Card>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-500" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-slate-700 rounded-lg leading-5 bg-slate-900/50 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm transition-colors"
            placeholder="按 ID、IP 或平台搜索..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
            {[
              { value: 'all', label: '全部' },
              { value: 'online', label: '在线' },
              { value: 'offline', label: '离线' },
              { value: 'busy', label: '忙碌' }
            ].map(({ value, label }) => (
                <button
                    key={value}
                    onClick={() => setStatusFilter(value)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        statusFilter === value
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        : 'bg-slate-800/50 text-slate-400 border border-slate-700 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                >
                    {label}
                </button>
            ))}
        </div>
      </div>

      {/* Device Grid */}
      {filteredDevices.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredDevices.map((device) => (
            <DeviceCard key={device.id} device={device} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-slate-900/30 rounded-lg border border-slate-800 border-dashed">
          <Server className="mx-auto h-12 w-12 text-slate-600" />
          <h3 className="mt-2 text-sm font-medium text-slate-300">未找到设备</h3>
          <p className="mt-1 text-sm text-slate-500">
             {searchTerm || statusFilter !== 'all' ? '尝试调整搜索条件或筛选器' : '开始注册新设备'}
          </p>
          {(!searchTerm && statusFilter === 'all') && (
            <div className="mt-6">
                <button
                    onClick={() => setShowTokenDialog(true)}
                    className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500"
                >
                    <Plus className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
                    注册设备
                </button>
            </div>
          )}
        </div>
      )}

      {showTokenDialog && (
        <EnrollmentTokenDialog
          isOpen={showTokenDialog}
          onClose={() => setShowTokenDialog(false)}
        />
      )}
    </div>
  );
}
