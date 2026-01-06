import { useState, useEffect } from 'react';
import { X, Radio, Terminal, FolderOpen, Send, Activity, Wifi, WifiOff, Clock, Monitor, AlertTriangle, CheckCircle } from 'lucide-react';
import { Session } from '../types/api';
import { formatTimestamp, formatRelativeTime, getSessionStatusColor, cn } from '../lib/utils';
import { useSession } from '../hooks/useApi';
import { Card } from './ui/Card';

interface SessionDetailsModalProps {
  session: Session | null;
  isOpen: boolean;
  onClose: () => void;
}

interface CommandResult {
  id: string;
  command: string;
  timestamp: number;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  status: 'pending' | 'completed' | 'error';
}

export function SessionDetailsModal({ session, isOpen, onClose }: SessionDetailsModalProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'commands' | 'files'>('overview');
  const [command, setCommand] = useState('');
  const [commandHistory, setCommandHistory] = useState<CommandResult[]>([]);
  
  // Real-time details
  const { data: sessionDetails, isLoading: isLoadingDetails } = useSession(
    session?.id || '', 
    { enabled: !!session?.id && isOpen }
  );

  const currentSession = sessionDetails || session;

  useEffect(() => {
    if (!isOpen) {
      setActiveTab('overview');
      setCommand('');
      setCommandHistory([]);
    }
  }, [isOpen]);

  if (!isOpen || !currentSession) return null;

  const statusColor = getSessionStatusColor(currentSession.status);
  
  // Fields
  const deviceId = currentSession.deviceId || '';
  const createdAt = currentSession.createdAt || 0;
  const expiresAt = currentSession.expiresAt || 0;
  const lastActivity = currentSession.lastActivity;

  // Stats
  const now = Date.now();
  const timeRemaining = (expiresAt * 1000) - now;
  const isExpired = timeRemaining <= 0;
  const isExpiringSoon = timeRemaining > 0 && timeRemaining < 300000;

  const handleSendCommand = () => {
    if (!command.trim()) return;

    const newCommand: CommandResult = {
      id: Date.now().toString(),
      command: command.trim(),
      timestamp: Date.now(),
      status: 'pending'
    };

    setCommandHistory(prev => [...prev, newCommand]);
    setCommand('');

    // Simulate command
    setTimeout(() => {
      setCommandHistory(prev => 
        prev.map(cmd => 
          cmd.id === newCommand.id 
            ? {
                ...cmd,
                status: 'completed' as const,
                exitCode: 0,
                stdout: `Mock Output: ${cmd.command} executed successfully\nTimestamp: ${new Date().toLocaleString()}`
              }
            : cmd
        )
      );
    }, 1000 + Math.random() * 2000);
  };

  const tabs = [
    { id: 'overview', name: '概览', icon: Radio },
    { id: 'commands', name: '终端', icon: Terminal },
    { id: 'files', name: '文件系统', icon: FolderOpen },
  ];

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <Card variant="glass" className="w-full max-w-5xl max-h-[90vh] flex flex-col p-0 border-slate-700/50 shadow-2xl zoom-in-95 animate-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700/50 bg-slate-900/50">
          <div className="flex items-center space-x-3">
             <div className="p-2 bg-slate-800 rounded-lg border border-slate-700">
               <Radio className="h-6 w-6 text-cyan-400" />
             </div>
            <div>
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                会话详情
                {isLoadingDetails && <span className="text-xs font-normal text-slate-500 animate-pulse">(更新中...)</span>}
              </h3>
              <p className="text-sm text-slate-400 font-mono">
                {currentSession.id} <span className="text-slate-600 mx-2">|</span> {deviceId}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <span className={cn(
              "inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border",
              currentSession.status === 'active' ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" :
              currentSession.status === 'connected' ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400" :
              currentSession.status === 'pending' ? "bg-amber-500/10 border-amber-500/30 text-amber-400" :
              "bg-red-500/10 border-red-500/30 text-red-400"
            )}>
              <span className={cn("w-2 h-2 rounded-full mr-2", 
                 currentSession.status === 'active' ? "bg-emerald-400" :
                 currentSession.status === 'connected' ? "bg-cyan-400" :
                 currentSession.status === 'pending' ? "bg-amber-400" : "bg-red-400"
              )}></span>
              {currentSession.status.toUpperCase()}
            </span>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors p-1 rounded-full hover:bg-slate-800"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-700/50 bg-slate-900/30">
          <nav className="flex px-6 space-x-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "flex items-center space-x-2 py-4 px-4 border-b-2 text-sm font-medium transition-colors",
                  activeTab === tab.id
                    ? "border-cyan-500 text-cyan-400 bg-cyan-950/20"
                    : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                )}
              >
                <tab.icon className="h-4 w-4" />
                <span>{tab.name}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden bg-slate-950/30 p-6">
          {activeTab === 'overview' && (
            <div className="h-full overflow-y-auto">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Basic Info */}
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">基本信息</h4>
                  <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-800 space-y-3">
                    {[
                      { l: '会话 ID', v: currentSession.id, mono: true },
                      { l: '设备 ID', v: deviceId, mono: true },
                      { l: '平台', v: currentSession.devicePlatform || '不可用' },
                      { l: '版本', v: currentSession.deviceVersion || '不可用' },
                    ].map((item, i) => (
                      <div key={i} className="flex justify-between items-center py-1 border-b border-slate-800/50 last:border-0 hover:bg-slate-800/30 transition-colors px-2 rounded">
                        <span className="text-sm text-slate-500">{item.l}</span>
                        <span className={cn("text-sm text-slate-200", item.mono && "font-mono text-cyan-300")}>{item.v}</span>
                      </div>
                    ))}
                  </div>

                   <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2 mt-6">遥测数据</h4>
                   <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-800 space-y-3">
                      <div className="flex justify-between items-center px-2 py-1">
                          <span className="text-sm text-slate-500">网络状态</span>
                          <div className="flex items-center gap-2">
                             {currentSession.status === 'connected' || currentSession.status === 'active' ? (
                                <>
                                  <Wifi className="h-4 w-4 text-emerald-500" />
                                  <span className="text-sm text-emerald-400 font-medium">在线</span>
                                </>
                              ) : (
                                <>
                                  <WifiOff className="h-4 w-4 text-slate-500" />
                                  <span className="text-sm text-slate-500">离线</span>
                                </>
                              )}
                          </div>
                      </div>
                       <div className="flex justify-between items-center px-2 py-1">
                          <span className="text-sm text-slate-500">健康检查</span>
                          <div className="flex items-center gap-2">
                             {isExpired ? (
                                  <>
                                    <AlertTriangle className="h-4 w-4 text-red-500" />
                                    <span className="text-sm text-red-500 font-medium">已过期</span>
                                  </>
                                ) : isExpiringSoon ? (
                                  <>
                                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                                    <span className="text-sm text-amber-500 font-medium">即将过期</span>
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                                    <span className="text-sm text-emerald-500 font-medium">健康</span>
                                  </>
                                )}
                          </div>
                      </div>
                   </div>
                </div>

                {/* Time Info */}
                 <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">时间线</h4>
                  <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-800 space-y-3">
                     {[
                      { l: '创建时间', v: formatTimestamp(createdAt) },
                      { l: '过期时间', v: formatTimestamp(expiresAt) },
                      { l: '最后活动', v: lastActivity ? formatRelativeTime(lastActivity) : '从未' },
                      { l: '会话时长', v: formatRelativeTime(createdAt) },
                    ].map((item, i) => (
                      <div key={i} className="flex justify-between items-center py-1 border-b border-slate-800/50 last:border-0 hover:bg-slate-800/30 transition-colors px-2 rounded">
                        <span className="text-sm text-slate-500">{item.l}</span>
                        <span className="text-sm text-slate-200">{item.v}</span>
                      </div>
                    ))}
                  </div>

                   <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2 mt-6">统计数据</h4>
                   <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-800">
                     <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-950 p-3 rounded border border-slate-800 text-center">
                            <div className="text-2xl font-bold text-cyan-400">{commandHistory.length}</div>
                            <div className="text-xs text-slate-500 uppercase">已执行命令</div>
                        </div>
                        <div className="bg-slate-950 p-3 rounded border border-slate-800 text-center">
                             <div className={cn("text-2xl font-bold", isExpired ? "text-red-400" : "text-emerald-400")}>
                                {isExpired ? '0分' : Math.ceil(timeRemaining / 60000) + '分'}
                             </div>
                            <div className="text-xs text-slate-500 uppercase">剩余时间</div>
                        </div>
                     </div>
                   </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'commands' && (
            <div className="h-full flex flex-col">
              <div className="flex-1 bg-slate-950 font-mono text-sm p-4 rounded-lg border border-slate-800 overflow-y-auto mb-4 custom-scrollbar">
                <div className="text-slate-500 mb-2"># 会话开始于 {new Date(createdAt * 1000).toLocaleString()}</div>
                 {commandHistory.map((cmd) => (
                  <div key={cmd.id} className="mb-4 animate-in fade-in slide-in-from-left-2">
                    <div className="flex items-center text-slate-400 mb-1">
                      <span className="text-green-500 mr-2">root@device:~#</span>
                      <span className="text-slate-200">{cmd.command}</span>
                      <span className="text-xs text-slate-600 ml-auto">{new Date(cmd.timestamp).toLocaleTimeString()}</span>
                    </div>
                    {cmd.status === 'completed' && (
                        <div className="text-slate-300 ml-4 whitespace-pre-wrap border-l-2 border-slate-800 pl-2">
                            {cmd.stdout}
                        </div>
                    )}
                     {cmd.status === 'pending' && (
                        <div className="text-cyan-500 ml-4 animate-pulse">运行中...</div>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-green-500 font-mono text-sm">&gt;</div>
                    <input
                      type="text"
                      value={command}
                      onChange={(e) => setCommand(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendCommand()}
                      className="w-full bg-slate-900 border border-slate-700 text-slate-200 font-mono text-sm rounded-lg pl-8 pr-4 py-3 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500"
                      placeholder="输入命令..."
                    />
                </div>
                <button
                  onClick={handleSendCommand}
                  className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                  <Send className="h-4 w-4" />
                  运行
                </button>
              </div>
            </div>
          )}

           {activeTab === 'files' && (
             <div className="h-full flex items-center justify-center text-slate-500 bg-slate-900/20 rounded-lg border border-slate-800 border-dashed">
                <div className="text-center">
                    <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-20" />
                    <p>文件系统浏览器功能待实现...</p>
                </div>
             </div>
           )}
        </div>
      </Card>
    </div>
  );
}
