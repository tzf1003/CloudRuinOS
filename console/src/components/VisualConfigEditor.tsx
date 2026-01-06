import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Shield, 
  FileText, 
  Wifi, 
  Terminal
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Card } from './ui/Card';

// Types matching AgentConfig in Rust
export interface AgentConfig {
  heartbeat?: HeartbeatSection;
  security?: SecuritySection;
  logging?: LoggingSection;
  reconnect?: ReconnectSection;
  commands?: CommandsSection;
  file_operations?: FileOperationsSection;
  [key: string]: any;
}

interface HeartbeatSection {
  interval: number;
  retry_attempts: number;
  retry_delay: number;
}

interface SecuritySection {
  tls_verify: boolean;
  doh_enabled: boolean;
  ech_enabled: boolean;
  certificate_pinning: boolean;
}

interface LoggingSection {
  level: string;
  max_file_size: string;
  max_files: number;
}

interface ReconnectSection {
  initial_delay: number;
  max_delay: number;
  backoff_factor: number;
  max_attempts: number;
  jitter: boolean;
}

interface CommandsSection {
  default_timeout: number;
  max_concurrent: number;
}

interface FileOperationsSection {
  max_file_size: string;
  allow_hidden_files: boolean;
}

interface VisualConfigEditorProps {
  initialConfig: AgentConfig;
  onChange: (config: AgentConfig) => void;
}

export const VisualConfigEditor: React.FC<VisualConfigEditorProps> = ({ 
  initialConfig, 
  onChange 
}) => {
  const [config, setConfig] = useState<AgentConfig>(initialConfig);
  const [activeTab, setActiveTab] = useState<'heartbeat' | 'security' | 'logging' | 'reconnect' | 'advanced'>('heartbeat');

  useEffect(() => {
    setConfig(initialConfig);
  }, [initialConfig]);

  const updateSection = (section: string, field: string, value: any) => {
    const newConfig = { ...config };
    if (!newConfig[section]) newConfig[section] = {};
    newConfig[section][field] = value;
    setConfig(newConfig);
    onChange(newConfig);
  };

  const tabs = [
    { id: 'heartbeat', label: '心跳', icon: Activity },
    { id: 'security', label: '安全', icon: Shield },
    { id: 'logging', label: '日志', icon: FileText },
    { id: 'reconnect', label: '重连', icon: Wifi },
    { id: 'advanced', label: '高级', icon: Terminal },
  ];

  return (
    <div className="flex flex-col h-full rounded-md">
      {/* Tabs */}
      <div className="flex border-b border-slate-700/50 overflow-x-auto bg-slate-900/30 rounded-t-lg">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex items-center px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors",
                isActive
                  ? "border-cyan-500 text-cyan-400 bg-cyan-500/5"
                  : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"
              )}
            >
              <Icon className={cn("w-4 h-4 mr-2", isActive ? "text-cyan-400" : "text-slate-500")} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <Card variant="glass" className="flex-1 overflow-y-auto p-6 space-y-6 rounded-t-none border-t-0">
        
        {/* Heartbeat Section */}
        {activeTab === 'heartbeat' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h3 className="text-lg font-bold text-slate-100 border-b border-slate-700/50 pb-2">心跳设置</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">心跳间隔 (秒)</label>
                <input
                  type="number"
                  value={config.heartbeat?.interval ?? 60}
                  onChange={(e) => updateSection('heartbeat', 'interval', Number(e.target.value))}
                  className="w-full bg-slate-900/50 border border-slate-700 text-slate-200 text-sm rounded-lg p-2.5 focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
                />
                <p className="mt-1 text-xs text-slate-500">Agent 向服务器更新状态的频率</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">重试延迟 (秒)</label>
                <input
                  type="number"
                  value={config.heartbeat?.retry_delay ?? 5}
                  onChange={(e) => updateSection('heartbeat', 'retry_delay', Number(e.target.value))}
                  className="w-full bg-slate-900/50 border border-slate-700 text-slate-200 text-sm rounded-lg p-2.5 focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">重试次数</label>
                <input
                  type="number"
                  value={config.heartbeat?.retry_attempts ?? 3}
                  onChange={(e) => updateSection('heartbeat', 'retry_attempts', Number(e.target.value))}
                  className="w-full bg-slate-900/50 border border-slate-700 text-slate-200 text-sm rounded-lg p-2.5 focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* Security Section */}
        {activeTab === 'security' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h3 className="text-lg font-bold text-slate-100 border-b border-slate-700/50 pb-2">安全设置</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-800/30 border border-slate-700/50 rounded-lg hover:bg-slate-800/50 transition-colors">
                <div>
                  <label className="block text-sm font-medium text-slate-200">TLS 验证</label>
                  <p className="text-sm text-slate-500">验证服务器证书有效性 (生产环境推荐)</p>
                </div>
                <input
                  type="checkbox"
                  checked={config.security?.tls_verify ?? true}
                  onChange={(e) => updateSection('security', 'tls_verify', e.target.checked)}
                  className="h-5 w-5 bg-slate-900 border-slate-600 rounded text-cyan-500 focus:ring-cyan-500 focus:ring-offset-slate-900"
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-800/30 border border-slate-700/50 rounded-lg hover:bg-slate-800/50 transition-colors">
                <div>
                  <label className="block text-sm font-medium text-slate-200">DoH (DNS over HTTPS)</label>
                  <p className="text-sm text-slate-500">使用加密 DNS 查询以防止劫持</p>
                </div>
                <input
                  type="checkbox"
                  checked={config.security?.doh_enabled ?? false}
                  onChange={(e) => updateSection('security', 'doh_enabled', e.target.checked)}
                  className="h-5 w-5 bg-slate-900 border-slate-600 rounded text-cyan-500 focus:ring-cyan-500 focus:ring-offset-slate-900"
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-800/30 border border-slate-700/50 rounded-lg hover:bg-slate-800/50 transition-colors">
                <div>
                  <label className="block text-sm font-medium text-slate-200">ECH (Encrypted Client Hello)</label>
                  <p className="text-sm text-slate-500">加密 Client Hello 以增强隐私</p>
                </div>
                <input
                  type="checkbox"
                  checked={config.security?.ech_enabled ?? false}
                  onChange={(e) => updateSection('security', 'ech_enabled', e.target.checked)}
                  className="h-5 w-5 bg-slate-900 border-slate-600 rounded text-cyan-500 focus:ring-cyan-500 focus:ring-offset-slate-900"
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-800/30 border border-slate-700/50 rounded-lg hover:bg-slate-800/50 transition-colors">
                <div>
                  <label className="block text-sm font-medium text-slate-200">证书固定</label>
                  <p className="text-sm text-slate-500">仅信任特定证书哈希</p>
                </div>
                <input
                  type="checkbox"
                  checked={config.security?.certificate_pinning ?? false}
                  onChange={(e) => updateSection('security', 'certificate_pinning', e.target.checked)}
                  className="h-5 w-5 bg-slate-900 border-slate-600 rounded text-cyan-500 focus:ring-cyan-500 focus:ring-offset-slate-900"
                />
              </div>
            </div>
          </div>
        )}

        {/* Logging Section */}
        {activeTab === 'logging' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h3 className="text-lg font-bold text-slate-100 border-b border-slate-700/50 pb-2">日志设置</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">日志级别</label>
                <select
                  value={config.logging?.level ?? 'info'}
                  onChange={(e) => updateSection('logging', 'level', e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-700 text-slate-200 text-sm rounded-lg p-2.5 focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
                >
                  <option value="trace">Trace (最详细)</option>
                  <option value="debug">Debug (调试)</option>
                  <option value="info">Info (标准)</option>
                  <option value="warn">Warn (警告)</option>
                  <option value="error">Error (仅错误)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">最大文件数</label>
                <input
                  type="number"
                  value={config.logging?.max_files ?? 5}
                  onChange={(e) => updateSection('logging', 'max_files', Number(e.target.value))}
                  className="w-full bg-slate-900/50 border border-slate-700 text-slate-200 text-sm rounded-lg p-2.5 focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">最大文件大小</label>
                <input
                  type="text"
                  value={config.logging?.max_file_size ?? '10MB'}
                  onChange={(e) => updateSection('logging', 'max_file_size', e.target.value)}
                  placeholder="例如: 10MB"
                  className="w-full bg-slate-900/50 border border-slate-700 text-slate-200 text-sm rounded-lg p-2.5 focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* Reconnect Section */}
        {activeTab === 'reconnect' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h3 className="text-lg font-bold text-slate-100 border-b border-slate-700/50 pb-2">重连策略</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">初始重试延迟 (秒)</label>
                <input
                  type="number"
                  value={config.reconnect?.initial_delay ?? 1}
                  onChange={(e) => updateSection('reconnect', 'initial_delay', Number(e.target.value))}
                  className="w-full bg-slate-900/50 border border-slate-700 text-slate-200 text-sm rounded-lg p-2.5 focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
                />
              </div>
               <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">最大延迟 (秒)</label>
                <input
                  type="number"
                  value={config.reconnect?.max_delay ?? 60}
                  onChange={(e) => updateSection('reconnect', 'max_delay', Number(e.target.value))}
                  className="w-full bg-slate-900/50 border border-slate-700 text-slate-200 text-sm rounded-lg p-2.5 focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
                />
              </div>
               <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">退避因子</label>
                <input
                  type="number"
                  step="0.1"
                  value={config.reconnect?.backoff_factor ?? 2.0}
                  onChange={(e) => updateSection('reconnect', 'backoff_factor', Number(e.target.value))}
                  className="w-full bg-slate-900/50 border border-slate-700 text-slate-200 text-sm rounded-lg p-2.5 focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
                />
              </div>
               <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">最大尝试次数 (0 = 无限)</label>
                <input
                  type="number"
                  value={config.reconnect?.max_attempts ?? 0}
                  onChange={(e) => updateSection('reconnect', 'max_attempts', Number(e.target.value))}
                  className="w-full bg-slate-900/50 border border-slate-700 text-slate-200 text-sm rounded-lg p-2.5 focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
                />
              </div>
              <div className="flex items-center pt-2 md:col-span-2">
                <input
                  id="jitter"
                  type="checkbox"
                  checked={config.reconnect?.jitter ?? true}
                  onChange={(e) => updateSection('reconnect', 'jitter', e.target.checked)}
                  className="h-5 w-5 bg-slate-900 border-slate-600 rounded text-cyan-500 focus:ring-cyan-500 focus:ring-offset-slate-900"
                />
                <label htmlFor="jitter" className="ml-2 block text-sm text-slate-200">
                  启用随机抖动
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Advanced Section */}
         {activeTab === 'advanced' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h3 className="text-lg font-bold text-slate-100 border-b border-slate-700/50 pb-2">文件与命令限制</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">最大并发命令数</label>
                <input
                  type="number"
                  value={config.commands?.max_concurrent ?? 5}
                  onChange={(e) => updateSection('commands', 'max_concurrent', Number(e.target.value))}
                  className="w-full bg-slate-900/50 border border-slate-700 text-slate-200 text-sm rounded-lg p-2.5 focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">默认命令超时 (秒)</label>
                <input
                  type="number"
                  value={config.commands?.default_timeout ?? 30}
                  onChange={(e) => updateSection('commands', 'default_timeout', Number(e.target.value))}
                  className="w-full bg-slate-900/50 border border-slate-700 text-slate-200 text-sm rounded-lg p-2.5 focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">最大文件操作大小</label>
                <input
                  type="text"
                  value={config.file_operations?.max_file_size ?? '100MB'}
                  onChange={(e) => updateSection('file_operations', 'max_file_size', e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-700 text-slate-200 text-sm rounded-lg p-2.5 focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
                />
              </div>
              <div className="flex items-center pt-2 md:col-span-2">
                 <input
                  id="hidden"
                  type="checkbox"
                  checked={config.file_operations?.allow_hidden_files ?? false}
                  onChange={(e) => updateSection('file_operations', 'allow_hidden_files', e.target.checked)}
                  className="h-5 w-5 bg-slate-900 border-slate-600 rounded text-cyan-500 focus:ring-cyan-500 focus:ring-offset-slate-900"
                />
                <label htmlFor="hidden" className="ml-2 block text-sm text-slate-200">
                  允许访问隐藏文件
                </label>
              </div>
            </div>
          </div>
        )}

      </Card>
    </div>
  );
};
