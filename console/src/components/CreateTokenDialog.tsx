import { useState } from 'react';
import { X, Calendar, Hash, Type, AlertCircle } from 'lucide-react';
import { EnrollmentToken } from '../types/api';

function generateNewTokenString() {
  // Simple random string generator for UI preview
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) result += '-';
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

interface CreateTokenDialogProps {
  onClose: () => void;
  onConfirm: (data: Partial<EnrollmentToken>) => void;
  isCreating: boolean;
}

export function CreateTokenDialog({
  onClose,
  onConfirm,
  isCreating
}: CreateTokenDialogProps) {
  const [formData, setFormData] = useState({
    description: '',
    maxUsage: '10',
    expiresInDays: '7',
    tokenString: generateNewTokenString(),
    isPermanent: false
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Calculate expiry based on days
    const days = parseInt(formData.expiresInDays);
    const expiresAt = formData.isPermanent ? undefined : Date.now() + (days * 24 * 60 * 60 * 1000);
    
    onConfirm({
      token: formData.tokenString,
      description: formData.description,
      maxUsage: parseInt(formData.maxUsage),
      expiresAt: expiresAt,
      isPermanent: formData.isPermanent
    });
  };

  const handleRegenerateToken = () => {
    setFormData({ ...formData, tokenString: generateNewTokenString() });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full shadow-2xl overflow-hidden ring-1 ring-white/10">
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <div>
            <h2 className="text-xl font-semibold text-slate-100">创建注册令牌</h2>
            <p className="text-sm text-slate-400 mt-1">生成新的设备注册令牌。</p>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded p-1 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-4">
            
            {/* Description Field */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300 flex items-center">
                <Type className="w-4 h-4 mr-2 text-cyan-500" />
                描述
              </label>
              <input
                type="text"
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all placeholder:text-slate-600"
                placeholder="例如: 销售部门笔记本电脑"
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
              />
            </div>

            {/* Token String Generator */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300 flex items-center">
                <Hash className="w-4 h-4 mr-2 text-purple-500" />
                令牌字符串
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  className="flex-1 font-mono text-sm bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-cyan-400 focus:outline-none cursor-default select-all"
                  value={formData.tokenString}
                />
                <button
                  type="button"
                  onClick={handleRegenerateToken}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-lg text-sm font-medium transition-colors border border-slate-700"
                >
                  重新生成
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
               {/* Max Usage */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">最大使用次数</label>
                <input
                  type="number"
                  min="1"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                  value={formData.maxUsage}
                  onChange={(e) => setFormData({...formData, maxUsage: e.target.value})}
                />
              </div>

               {/* Expiry Days */}
              <div className="space-y-2">
                 <div className="flex justify-between items-center">
                    <label className={`text-sm font-medium ${formData.isPermanent ? 'text-slate-600' : 'text-slate-300'} transition-colors`}>过期天数</label>
                    <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                           type="checkbox"
                           checked={formData.isPermanent}
                           onChange={(e) => setFormData({...formData, isPermanent: e.target.checked})}
                           className="form-checkbox h-4 w-4 text-cyan-500 rounded border-slate-700 bg-slate-900 focus:ring-cyan-500/50"
                        />
                        <span className="text-xs text-slate-400">永不</span>
                    </label>
                 </div>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    disabled={formData.isPermanent}
                    className={`w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all pl-10 disabled:opacity-50 disabled:cursor-not-allowed`}
                    value={formData.expiresInDays}
                    onChange={(e) => setFormData({...formData, expiresInDays: e.target.value})}
                  />
                  <Calendar className={`absolute left-3 top-2.5 h-4 w-4 ${formData.isPermanent ? 'text-slate-600' : 'text-slate-500'}`} />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-blue-900/10 border border-blue-900/30 rounded-lg p-3 flex gap-3">
             <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
             <div className="text-xs text-blue-300/80 leading-relaxed">
               新令牌立即生效。建议通过安全渠道分发，因为令牌提供直接的注册访问权限。
             </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg text-sm font-medium transition-colors border border-slate-800"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isCreating}
              className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg text-sm font-medium shadow-lg shadow-cyan-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isCreating ? '创建中...' : '创建令牌'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
