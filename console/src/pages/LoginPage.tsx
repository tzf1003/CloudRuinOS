import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Lock, AlertCircle, Loader2, Shield, Command } from 'lucide-react';
import { Card } from '../components/ui/Card';

export function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { login, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!password.trim()) {
      setError('密码不能为空');
      return;
    }

    const result = await login(password);

    if (result.success) {
      navigate(from, { replace: true });
    } else {
      setError(result.error || '认证失败');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-slate-950">
      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-500/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-violet-500/10 rounded-full blur-[100px]" />
        <div className="absolute top-[20%] left-[30%] w-[60%] h-[60%] bg-slate-900/50 rounded-full blur-[80px] mix-blend-overlay" />
      </div>

      <div className="w-full max-w-md relative z-10 animate-in fade-in zoom-in-95 duration-500">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-4 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700 shadow-xl mb-4 relative group">
             <div className="absolute inset-0 bg-cyan-500/10 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
            <Shield className="w-10 h-10 text-cyan-400 relative z-10" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">Cloud<span className="text-cyan-400">Ruin</span>OS</h1>
          <p className="text-slate-400 font-light">安全命令控制台</p>
        </div>

        <Card variant="glass" className="p-8 backdrop-blur-xl border-slate-800/60 shadow-2xl">
          <div className="flex items-center gap-2 mb-6 text-slate-200">
            <Command className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-medium">系统访问</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-300 text-sm animate-in slide-in-from-top-2">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 ml-1">
                管理员密码
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                     <Lock className="h-5 w-5 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
                </div>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入认证密钥..."
                  className="w-full pl-10 pr-4 py-3 bg-slate-900/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all font-mono tracking-wide"
                  disabled={isLoading}
                  autoFocus
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 disabled:from-slate-700 disabled:to-slate-800 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-cyan-500/25 flex items-center justify-center gap-2 group relative overflow-hidden"
            >
               {/* Shine effect */}
               <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 skew-x-12" />
               
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>认证中...</span>
                </>
              ) : (
                <>
                  <span>登录</span>
                  <div className="w-0 group-hover:w-2 transition-all" />
                  <Command className="w-4 h-4 opacity-50 group-hover:opacity-100 transition-opacity" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-800/50 text-center">
             <p className="text-xs text-slate-500">
                严禁未经授权的访问。<br/> 系统活动受到监控。
             </p>
          </div>
        </Card>
      </div>
      
      {/* Footer info */}
      <div className="absolute bottom-6 left-0 w-full text-center text-xs text-slate-600 font-mono pointer-events-none">
        CloudRuinOS v1.0.0 • 安全环境
      </div>
    </div>
  );
}
