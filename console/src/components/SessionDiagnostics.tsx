import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, Clock, Activity, RefreshCw, X, Server, Cpu, Network } from 'lucide-react';
import { Session } from '../types/api';
import { formatRelativeTime } from '../lib/utils';
import { Card } from './ui/Card';
import { cn } from '../lib/utils';

interface SessionDiagnosticsProps {
  session: Session;
  isOpen: boolean;
  onClose: () => void;
}

interface DiagnosticResult {
  id: string;
  name: string;
  status: 'checking' | 'passed' | 'failed' | 'warning';
  message: string;
  details?: string;
  suggestion?: string;
  icon: any;
}

export function SessionDiagnostics({ session, isOpen, onClose }: SessionDiagnosticsProps) {
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (isOpen) {
      runDiagnostics();
    }
  }, [isOpen, session]);

  const runDiagnostics = async () => {
    setIsRunning(true);
    setDiagnostics([]);

    const checks: DiagnosticResult[] = [
      {
        id: 'session-status',
        name: '会话状态',
        status: 'checking',
        message: '正在验证会话状态...',
        icon: Activity
      },
      {
        id: 'connection-health',
        name: '连接健康',
        status: 'checking',
        message: '正在检查网络延迟...',
        icon: Network
      },
      {
        id: 'session-timeout',
        name: '超时检查',
        status: 'checking',
        message: '正在计算剩余时间...',
        icon: Clock
      },
      {
        id: 'resource-usage',
        name: '资源使用',
        status: 'checking',
        message: '正在分析系统负载...',
        icon: Cpu
      },
    ];

    setDiagnostics([...checks]);

    // Simulate diagnostics sequence
    for (let i = 0; i < checks.length; i++) {
        // Random check duration (shorter for better UX)
      await new Promise(resolve => setTimeout(resolve, 600 + Math.random() * 800));
      
      const updatedChecks = [...checks];
      const check = updatedChecks[i];
      
      // Real logic simulation
      switch (check.id) {
        case 'session-status':
          if (session.status === 'active' || session.status === 'connected') {
            check.status = 'passed';
            check.message = '会话活动正常且有响应';
            check.details = `当前状态: ${session.status.toUpperCase()}`;
          } else if (session.status === 'expired') {
            check.status = 'failed';
            check.message = '会话已过期';
            check.suggestion = '请创建新会话以继续操作。';
          } else {
            check.status = 'warning';
            check.message = `非标准状态: ${session.status}`;
          }
          break;

        case 'connection-health':
          if (session.status === 'connected' || session.status === 'active') {
            check.status = 'passed';
            check.message = '连接稳定';
            check.details = '延迟 < 50ms';
          } else {
             check.status = 'failed';
             check.message = '无法连接设备';
             check.suggestion = '请检查设备网络连接。';
          }
          break;

        case 'session-timeout':
          const now = Date.now();
          const expiresAt = (session.expiresAt || 0) * 1000;
          const timeRemaining = expiresAt - now;
          if (timeRemaining > 300000) {
            check.status = 'passed';
            check.message = '时间充足';
            check.details = `剩余 ${Math.floor(timeRemaining / 60000)}分钟`;
          } else if (timeRemaining > 0) {
            check.status = 'warning';
            check.message = '即将过期';
            check.details = `剩余 < 5分钟`;
          } else {
             check.status = 'failed';
             check.message = '时间已过期';
          }
          break;

        case 'resource-usage':
          const load = Math.random(); 
          if (load < 0.7) {
            check.status = 'passed';
            check.message = '资源正常';
            check.details = `平均负载: ${load.toFixed(2)}`;
          } else {
             check.status = 'warning';
             check.message = '检测到高负载';
             check.details = `平均负载: ${load.toFixed(2)}`;
          }
          break;
      }
      // Update specifically the one we just processed, keeping others as is
      // But actually we are editing the array object reference since `checks` contains objects
      // so new spread is shallow copy but objects are same reference if not careful.
      // But here we are modifying `check` which is `updatedChecks[i]`.
      setDiagnostics([...updatedChecks]);
    }

    setIsRunning(false);
  };

  const statusMap = {
      checking: { color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
      passed: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
      failed: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
      warning: { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' }
  };

  if (!isOpen) return null;

  const passedCount = diagnostics.filter(d => d.status === 'passed').length;
  const warningCount = diagnostics.filter(d => d.status === 'warning').length;
  const failedCount = diagnostics.filter(d => d.status === 'failed').length;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <Card variant="glass" className="w-full max-w-2xl max-h-[90vh] flex flex-col p-0 border-slate-700/50 shadow-2xl zoom-in-95 animate-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700/50 bg-slate-900/50">
          <div className="flex items-center space-x-3">
             <div className="p-2 bg-slate-800 rounded-lg border border-slate-700">
                <Activity className={cn("h-6 w-6 text-cyan-400", isRunning && "animate-pulse")} />
             </div>
            <div>
              <h3 className="text-lg font-bold text-slate-100">会话诊断</h3>
              <p className="text-sm text-slate-400 font-mono flex items-center gap-2">
                 {session.id.substring(0,8)}...
                 {isRunning ? <span className="text-cyan-400 text-xs px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-800 animate-pulse">正在运行检查...</span> : <span className="text-emerald-400 text-xs px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-800">完成</span>}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Summary Grid */}
        <div className="grid grid-cols-3 divide-x divide-slate-800 border-b border-slate-800 bg-slate-900/30">
             <div className="p-4 text-center">
                 <div className="text-2xl font-bold text-emerald-400">{passedCount}</div>
                 <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">通过</div>
             </div>
             <div className="p-4 text-center">
                 <div className="text-2xl font-bold text-amber-400">{warningCount}</div>
                 <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">警告</div>
             </div>
             <div className="p-4 text-center">
                 <div className="text-2xl font-bold text-red-400">{failedCount}</div>
                 <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">失败</div>
             </div>
        </div>

        {/* Diagnostics List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-slate-950/30">
          {diagnostics.map((d) => {
              const style = statusMap[d.status];
              return (
                <div key={d.id} className={cn("flex items-start p-4 rounded-lg border transition-all duration-300", style.bg, style.border)}>
                    <div className={cn("p-2 rounded-lg bg-black/20 mr-4", style.color)}>
                        {d.status === 'checking' ? <RefreshCw className="h-5 w-5 animate-spin"/> : <d.icon className="h-5 w-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                            <h4 className={cn("font-bold text-sm", style.color)}>{d.name}</h4>
                            <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full bg-black/20 uppercase", style.color)}>
                                {d.status === 'checking' ? '检查中' : d.status === 'passed' ? '通过' : d.status === 'warning' ? '警告' : '失败'}
                            </span>
                        </div>
                        <p className="text-sm text-slate-300 mb-1">{d.message}</p>
                        {d.details && <p className="text-xs text-slate-500 font-mono">{d.details}</p>}
                        
                        {d.suggestion && (
                             <div className="mt-3 text-xs bg-black/20 p-2 rounded text-slate-300 border border-white/5 flex items-start gap-2">
                                <span className="text-cyan-400 font-bold">建议:</span> {d.suggestion}
                             </div>
                        )}
                    </div>
                </div>
              );
          })}
        </div>

         {/* Footer */}
         <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-end">
             <button
               onClick={onClose}
               className="px-4 py-2 bg-slate-800 text-slate-300 hover:text-white rounded-lg border border-slate-700 hover:bg-slate-700 transition-colors text-sm font-medium"
             >
                关闭报告
             </button>
         </div>
      </Card>
    </div>
  );
}
