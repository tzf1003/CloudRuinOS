import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Shield, 
  FileText, 
  Wifi, 
  Terminal
} from 'lucide-react';

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
    { id: 'heartbeat', label: '心跳设置', icon: Activity },
    { id: 'security', label: '安全', icon: Shield },
    { id: 'logging', label: '日志', icon: FileText },
    { id: 'reconnect', label: '重连策略', icon: Wifi },
    { id: 'advanced', label: '高级设置', icon: Terminal },
  ];

  return (
    <div className="flex flex-col h-full bg-white rounded-md border border-gray-200">
      {/* Tabs */}
      <div className="flex border-b border-gray-200 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="w-4 h-4 mr-2" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        
        {/* Heartbeat Section */}
        {activeTab === 'heartbeat' && (
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-gray-900 border-b pb-2">心跳检测配置</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700">心跳间隔 (秒)</label>
                <input
                  type="number"
                  value={config.heartbeat?.interval ?? 60}
                  onChange={(e) => updateSection('heartbeat', 'interval', Number(e.target.value))}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                />
                <p className="mt-1 text-xs text-gray-500">Agent 向 Server 发送状态更新的频率</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">重试延迟 (秒)</label>
                <input
                  type="number"
                  value={config.heartbeat?.retry_delay ?? 5}
                  onChange={(e) => updateSection('heartbeat', 'retry_delay', Number(e.target.value))}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">重试次数</label>
                <input
                  type="number"
                  value={config.heartbeat?.retry_attempts ?? 3}
                  onChange={(e) => updateSection('heartbeat', 'retry_attempts', Number(e.target.value))}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                />
              </div>
            </div>
          </div>
        )}

        {/* Security Section */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-gray-900 border-b pb-2">安全设置</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <label className="block text-sm font-medium text-gray-900">TLS 验证</label>
                  <p className="text-sm text-gray-500">验证服务器证书的有效性 (生产环境建议开启)</p>
                </div>
                <input
                  type="checkbox"
                  checked={config.security?.tls_verify ?? true}
                  onChange={(e) => updateSection('security', 'tls_verify', e.target.checked)}
                  className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <label className="block text-sm font-medium text-gray-900">DoH (DNS over HTTPS)</label>
                  <p className="text-sm text-gray-500">使用加密的 DNS 查询防止劫持</p>
                </div>
                <input
                  type="checkbox"
                  checked={config.security?.doh_enabled ?? false}
                  onChange={(e) => updateSection('security', 'doh_enabled', e.target.checked)}
                  className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <label className="block text-sm font-medium text-gray-900">ECH (Encrypted Client Hello)</label>
                  <p className="text-sm text-gray-500">加密 Client Hello 增强隐私保护</p>
                </div>
                <input
                  type="checkbox"
                  checked={config.security?.ech_enabled ?? false}
                  onChange={(e) => updateSection('security', 'ech_enabled', e.target.checked)}
                  className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <label className="block text-sm font-medium text-gray-900">证书锁定 (Pinning)</label>
                  <p className="text-sm text-gray-500">只信任特定的证书哈希</p>
                </div>
                <input
                  type="checkbox"
                  checked={config.security?.certificate_pinning ?? false}
                  onChange={(e) => updateSection('security', 'certificate_pinning', e.target.checked)}
                  className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
              </div>
            </div>
          </div>
        )}

        {/* Logging Section */}
        {activeTab === 'logging' && (
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-gray-900 border-b pb-2">日志设置</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700">日志级别</label>
                <select
                  value={config.logging?.level ?? 'info'}
                  onChange={(e) => updateSection('logging', 'level', e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                >
                  <option value="trace">Trace (最详细)</option>
                  <option value="debug">Debug (调试)</option>
                  <option value="info">Info (标准)</option>
                  <option value="warn">Warn (警告)</option>
                  <option value="error">Error (仅错误)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">最大文件数量</label>
                <input
                  type="number"
                  value={config.logging?.max_files ?? 5}
                  onChange={(e) => updateSection('logging', 'max_files', Number(e.target.value))}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">单个文件大小上限</label>
                <input
                  type="text"
                  value={config.logging?.max_file_size ?? '10MB'}
                  onChange={(e) => updateSection('logging', 'max_file_size', e.target.value)}
                  placeholder="e.g. 10MB"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                />
              </div>
            </div>
          </div>
        )}

        {/* Reconnect Section */}
        {activeTab === 'reconnect' && (
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-gray-900 border-b pb-2">重连策略</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <div>
                <label className="block text-sm font-medium text-gray-700">初始重连延迟 (秒)</label>
                <input
                  type="number"
                  value={config.reconnect?.initial_delay ?? 1}
                  onChange={(e) => updateSection('reconnect', 'initial_delay', Number(e.target.value))}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                />
              </div>
               <div>
                <label className="block text-sm font-medium text-gray-700">最大延迟 (秒)</label>
                <input
                  type="number"
                  value={config.reconnect?.max_delay ?? 60}
                  onChange={(e) => updateSection('reconnect', 'max_delay', Number(e.target.value))}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                />
              </div>
               <div>
                <label className="block text-sm font-medium text-gray-700">退避因子 (Backoff Factor)</label>
                <input
                  type="number"
                  step="0.1"
                  value={config.reconnect?.backoff_factor ?? 2.0}
                  onChange={(e) => updateSection('reconnect', 'backoff_factor', Number(e.target.value))}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                />
              </div>
               <div>
                <label className="block text-sm font-medium text-gray-700">最大尝试次数 (0为无限)</label>
                <input
                  type="number"
                  value={config.reconnect?.max_attempts ?? 0}
                  onChange={(e) => updateSection('reconnect', 'max_attempts', Number(e.target.value))}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                />
              </div>
              <div className="flex items-center pt-6">
                <input
                  id="jitter"
                  type="checkbox"
                  checked={config.reconnect?.jitter ?? true}
                  onChange={(e) => updateSection('reconnect', 'jitter', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="jitter" className="ml-2 block text-sm text-gray-900">
                  启用随机抖动 (Jitter)
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Advanced Section */}
         {activeTab === 'advanced' && (
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-gray-900 border-b pb-2">文件与命令限制</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700">命令并发上限</label>
                <input
                  type="number"
                  value={config.commands?.max_concurrent ?? 5}
                  onChange={(e) => updateSection('commands', 'max_concurrent', Number(e.target.value))}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">命令默认超时 (秒)</label>
                <input
                  type="number"
                  value={config.commands?.default_timeout ?? 30}
                  onChange={(e) => updateSection('commands', 'default_timeout', Number(e.target.value))}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">最大文件操作大小</label>
                <input
                  type="text"
                  value={config.file_operations?.max_file_size ?? '100MB'}
                  onChange={(e) => updateSection('file_operations', 'max_file_size', e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                />
              </div>
              <div className="flex items-center pt-6">
                 <input
                  id="hidden"
                  type="checkbox"
                  checked={config.file_operations?.allow_hidden_files ?? false}
                  onChange={(e) => updateSection('file_operations', 'allow_hidden_files', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="hidden" className="ml-2 block text-sm text-gray-900">
                  允许访问隐藏文件
                </label>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
