import { useState } from 'react';
import { X, Copy, Check, Clock, Key } from 'lucide-react';
import { useGenerateEnrollmentToken } from '../hooks/useApi';
import { formatTimestamp } from '../lib/utils';
import { Card } from './ui/Card';

interface EnrollmentTokenDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function EnrollmentTokenDialog({ isOpen, onClose }: EnrollmentTokenDialogProps) {
  const [expiresIn, setExpiresIn] = useState(3600); // 1 hour default
  const [copied, setCopied] = useState(false);
  const generateToken = useGenerateEnrollmentToken();

  const handleGenerate = () => {
    generateToken.mutate({ expiresIn: expiresIn });
  };

  const handleCopy = async () => {
    if (generateToken.data?.token) {
      await navigator.clipboard.writeText(generateToken.data.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = () => {
    generateToken.reset();
    setCopied(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity" 
        onClick={handleClose}
      />
      
      {/* Modal */}
      <Card variant="glass" className="relative w-full max-w-md mx-4 overflow-hidden z-10 shadow-2xl p-0">
        <div className="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between bg-slate-900/40">
          <div className="flex items-center gap-3">
             <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                <Key className="w-5 h-5" />
             </div>
             <h3 className="text-lg font-semibold text-slate-100">
               生成注册令牌
             </h3>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-white transition-colors p-1 hover:bg-slate-800 rounded-md"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {!generateToken.data ? (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  过期时间
                </label>
                <div className="relative">
                    <select
                        value={expiresIn}
                        onChange={(e) => setExpiresIn(Number(e.target.value))}
                        className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 appearance-none"
                    >
                        <option value={300} className="bg-slate-900 text-slate-200">5 分钟</option>
                        <option value={1800} className="bg-slate-900 text-slate-200">30 分钟</option>
                        <option value={3600} className="bg-slate-900 text-slate-200">1 小时</option>
                        <option value={7200} className="bg-slate-900 text-slate-200">2 小时</option>
                        <option value={86400} className="bg-slate-900 text-slate-200">24 小时</option>
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-500">
                        <Clock className="w-4 h-4" />
                    </div>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                    令牌将在此时间段后失效
                </p>
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-800/50 border border-slate-700 rounded-lg hover:bg-slate-800 hover:text-white transition-all"
                >
                  取消
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={generateToken.isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-500 hover:shadow-[0_0_15px_-3px_rgba(6,182,212,0.4)] transition-all disabled:opacity-50 disabled:shadow-none"
                >
                  {generateToken.isPending ? '生成中...' : '生成令牌'}
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
              <div>
                <label className="block text-sm font-medium text-emerald-400 mb-2 flex items-center gap-2">
                  <Check className="w-4 h-4" /> 令牌已生成
                </label>
                <div className="flex items-center space-x-2">
                  <div className="relative flex-1 group">
                      <input
                        type="text"
                        value={generateToken.data.token}
                        readOnly
                        className="w-full px-4 py-3 bg-slate-950/80 border border-slate-700 rounded-lg text-cyan-300 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
                      />
                      <div className="absolute inset-0 rounded-lg ring-1 ring-cyan-500/20 group-hover:ring-cyan-500/40 pointer-events-none transition-all" />
                  </div>
                  
                  <button
                    onClick={handleCopy}
                    className="p-3 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 hover:text-white transition-colors text-slate-400 group relative"
                    title="Copy to clipboard"
                  >
                    {copied ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-800">
                  <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">过期时间:</span>
                      <span className="text-slate-300 font-mono">
                          {formatTimestamp(generateToken.data.expiresAt || 0)}
                      </span>
                  </div>
              </div>

              <div className="flex justify-end pt-2">
                 <button
                  onClick={handleClose}
                  className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
                >
                  关闭
                </button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
