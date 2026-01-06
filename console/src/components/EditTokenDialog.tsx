import { useState } from 'react';
import { X, Calendar, Type, AlertTriangle } from 'lucide-react';
import { EnrollmentToken } from '../types/api';

interface EditTokenDialogProps {
  token: EnrollmentToken;
  onClose: () => void;
  onConfirm: (id: number, updates: Partial<EnrollmentToken>) => void;
  isUpdating: boolean;
}

export function EditTokenDialog({
  token,
  onClose,
  onConfirm,
  isUpdating
}: EditTokenDialogProps) {
  const [formData, setFormData] = useState({
    description: token.description || '',
    maxUsage: token.maxUsage.toString(),
    expiresInDays: token.expiresAt 
      ? Math.ceil((token.expiresAt - Date.now()) / (24 * 60 * 60 * 1000)).toString() 
      : '7',
    isPermanent: token.isPermanent
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const days = parseInt(formData.expiresInDays);
    // If extending, calculate new date from NOW, not old expiry
    const newExpiresAt = formData.isPermanent ? undefined : Date.now() + (days * 24 * 60 * 60 * 1000);
    
    onConfirm(token.id, {
      description: formData.description,
      maxUsage: parseInt(formData.maxUsage),
      expiresAt: newExpiresAt,
      isPermanent: formData.isPermanent
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full shadow-2xl overflow-hidden ring-1 ring-white/10">
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <div>
            <h2 className="text-xl font-semibold text-slate-100">编辑令牌</h2>
            <div className="flex items-center gap-2 mt-1">
               <span className="font-mono text-xs bg-slate-950 px-2 py-0.5 rounded text-cyan-500 border border-cyan-900/30">
                  {token.token.substring(0, 8)}...
               </span>
               <span className="text-sm text-slate-400">配置</span>
            </div>
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
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
               {/* Max Usage */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">最大使用次数</label>
                <div className="relative">
                   <input
                     type="number"
                     min={token.usageCount} // Cannot set lower than current usage
                     required
                     className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                     value={formData.maxUsage}
                     onChange={(e) => setFormData({...formData, maxUsage: e.target.value})}
                   />
                   <div className="absolute right-3 top-2 text-xs text-slate-500 pointer-events-none">
                      当前: {token.usageCount}
                   </div>
                </div>
              </div>

               {/* Expiry Days */}
              <div className="space-y-2">
                 <div className="flex justify-between items-center">
                    <label className={`text-sm font-medium ${formData.isPermanent ? 'text-slate-600' : 'text-slate-300'} transition-colors`}>延长 (天)</label>
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
            
            {!formData.isPermanent && (
               <div className="bg-amber-900/10 border border-amber-900/30 rounded-lg p-3 flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-400/80 leading-relaxed">
                     更改过期时长将从此起重新计时。之前的剩余时间将丢失。
                  </div>
               </div>
            )}

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
              disabled={isUpdating}
              className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg text-sm font-medium shadow-lg shadow-cyan-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isUpdating ? '保存中...' : '保存更改'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
