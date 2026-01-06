import React, { useState } from 'react';
import { WebSocketTerminal } from '../components/WebSocketTerminal';
import { CommandExecution } from '../types/api';
import { Card } from '../components/ui/Card';
import { Terminal, Settings, RefreshCw, Cpu, Activity } from 'lucide-react';

export function TerminalTestPage() {
  const [deviceId, setDeviceId] = useState('test-device-123');
  const [sessionId, setSessionId] = useState(`test-session-${Date.now()}`);
  const [isConnected, setIsConnected] = useState(false);
  const [executedCommands, setExecutedCommands] = useState<any[]>([]);

  const handleConnectionChange = (connected: boolean) => {
    setIsConnected(connected);
  };

  const handleCommandExecuted = (execution: any) => {
    setExecutedCommands(prev => [...prev, execution]);
  };

  return (
    <div className="space-y-6 h-[calc(100vh-100px)] flex flex-col">
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">终端接口</h1>
          <p className="text-sm text-slate-400 mt-1">直接安全 Shell 访问</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 min-h-0">
        {/* Sidebar Configuration */}
        <div className="space-y-6 flex flex-col">
             <Card variant="glass" className="p-4 space-y-4">
                <div className="flex items-center gap-2 text-slate-200 border-b border-slate-700/50 pb-2">
                    <Settings className="w-4 h-4 text-cyan-400" />
                    <h3 className="font-semibold text-sm">会话配置</h3>
                </div>

                <div className="space-y-3">
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">设备 ID</label>
                        <input
                            type="text"
                            value={deviceId}
                            onChange={(e) => setDeviceId(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">会话 ID</label>
                         <div className="flex gap-2">
                            <input
                                type="text"
                                value={sessionId}
                                onChange={(e) => setSessionId(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
                            />
                            <button
                                onClick={() => setSessionId(`session-${Date.now().toString().slice(-6)}`)}
                                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg border border-slate-700 transition-colors"
                                title="生成新会话 ID"
                            >
                                <RefreshCw className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="pt-2 border-t border-slate-700/50">
                    <div className="flex items-center justify-between">
                         <span className="text-xs text-slate-500">状态</span>
                         <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                             isConnected 
                             ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                             : "bg-red-500/10 text-red-400 border border-red-500/20"
                         }`}>
                             {isConnected ? '已连接' : '未连接'}
                         </span>
                    </div>
                </div>
             </Card>

             <Card variant="default" className="flex-1 p-0 overflow-hidden bg-slate-900/30 border-slate-800">
                <div className="p-3 bg-slate-900/50 border-b border-slate-800 flex items-center gap-2">
                     <Activity className="w-4 h-4 text-violet-400" />
                     <h3 className="text-xs font-semibold text-slate-300">命令历史</h3>
                </div>
                <div className="p-2 overflow-y-auto max-h-[300px] space-y-1">
                    {executedCommands.length === 0 ? (
                        <div className="text-center py-8 text-slate-600 text-xs italic">
                            尚未执行命令
                        </div>
                    ) : (
                        executedCommands.map((cmd, idx) => (
                             <div key={idx} className="text-xs font-mono p-1.5 rounded hover:bg-slate-800/50 text-slate-400">
                                 <span className="text-cyan-500/70 mr-2">$</span>
                                 {cmd.command}
                             </div>
                        ))
                    )}
                </div>
             </Card>
        </div>

        {/* Main Terminal Area */}
        <div className="lg:col-span-3 h-full min-h-[500px]">
            <WebSocketTerminal
              deviceId={deviceId}
              sessionId={sessionId}
              autoConnect={false}
              theme="glass"
              fontSize={14}
              onConnectionChange={handleConnectionChange}
              onCommandExecuted={handleCommandExecuted}
              className="h-full shadow-2xl"
            />
        </div>
      </div>
    </div>
  );
}
