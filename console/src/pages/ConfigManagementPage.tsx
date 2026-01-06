import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Save, 
  Trash2, 
  Plus, 
  RefreshCw,
  AlertTriangle,
  FileJson,
  CheckCircle,
  X,
  Code2
} from 'lucide-react';
import { apiClient } from '../lib/api-client';
import { Configuration, ConfigurationScope } from '../types/api';
import { useGlobalLoading } from '../contexts/UIContext';
import { VisualConfigEditor } from '../components/VisualConfigEditor';
import { Card } from '../components/ui/Card';
import { cn } from '../lib/utils';

// Simple JSON Editor Component
const JsonEditor = ({ 
  initialValue, 
  onChange, 
  readOnly = false 
}: { 
  initialValue: string | object, 
  onChange: (value: string, isValid: boolean) => void,
  readOnly?: boolean 
}) => {
  const [value, setValue] = useState(
    typeof initialValue === 'string' 
      ? initialValue 
      : JSON.stringify(initialValue, null, 2)
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(typeof initialValue === 'string' 
      ? initialValue 
      : JSON.stringify(initialValue, null, 2));
  }, [initialValue]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    
    try {
      JSON.parse(newValue);
      setError(null);
      onChange(newValue, true);
    } catch (err) {
      setError((err as Error).message);
      onChange(newValue, false);
    }
  };

  return (
    <div className="flex flex-col h-full relative">
      <textarea
        className={cn(
          "w-full h-full font-mono text-sm p-4 bg-slate-950/50 border rounded-lg focus:ring-1 focus:ring-cyan-500 outline-none resize-none transition-all scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent",
          error ? "border-red-500/50 focus:border-red-500" : "border-slate-800",
          readOnly ? "text-slate-500 cursor-not-allowed" : "text-slate-300"
        )}
        value={value}
        onChange={handleChange}
        readOnly={readOnly}
        spellCheck={false}
      />
      {error && (
        <div className="absolute bottom-4 right-4 bg-red-900/90 text-red-100 text-xs px-3 py-2 rounded-md shadow-lg flex items-center border border-red-500/30 backdrop-blur-md animate-in fade-in slide-in-from-bottom-2">
          <AlertTriangle className="w-3 h-3 mr-2" />
          JSON 错误: {error}
        </div>
      )}
    </div>
  );
};

export function ConfigManagementPage() {
  const [configs, setConfigs] = useState<Configuration[]>([]);
  const { setGlobalLoading } = useGlobalLoading();
  const startLoading = () => setGlobalLoading(true);
  const stopLoading = () => setGlobalLoading(false);
  const [selectedConfig, setSelectedConfig] = useState<Configuration | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  
  // Form State
  const [scope, setScope] = useState<ConfigurationScope>(ConfigurationScope.GLOBAL);
  const [target, setTarget] = useState('default');
  const [configContent, setConfigContent] = useState('{}');
  const [isValidJson, setIsValidJson] = useState(true);
  const [editMode, setEditMode] = useState<'visual' | 'json'>('visual');

  const fetchConfigs = async () => {
    startLoading();
    try {
      const data = await apiClient.getConfigurations();
      setConfigs(data);
    } catch (error) {
      console.error('Failed to fetch configurations:', error);
    } finally {
      stopLoading();
    }
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  const handleCreate = () => {
    // Check if global config already exists
    const hasGlobal = configs.some(c => c.scope === ConfigurationScope.GLOBAL);
    
    setSelectedConfig(null);
    // If global exists, default to GROUP, otherwise GLOBAL
    const defaultScope = hasGlobal ? ConfigurationScope.GROUP : ConfigurationScope.GLOBAL;
    setScope(defaultScope);
    setTarget(defaultScope === ConfigurationScope.GLOBAL ? 'default' : '');
    setConfigContent(JSON.stringify({
      heartbeat: {
        interval: 60
      }
    }, null, 2));
    setIsCreating(true);
    setIsEditing(true);
    setEditMode('visual');
  };

  const handleEdit = (config: Configuration) => {
    setSelectedConfig(config);
    setScope(config.scope);
    setTarget(config.target);
    setConfigContent(JSON.stringify(config.config, null, 2));
    setIsCreating(false);
    setIsEditing(true);
    setEditMode('visual');
  };

  const handleSave = async () => {
    if (!isValidJson) return;

    startLoading();
    try {
      const parsedConfig = JSON.parse(configContent);
      
      if (isCreating) {
        await apiClient.createConfiguration({
          scope,
          target: scope === ConfigurationScope.GLOBAL ? 'default' : target,
          config: parsedConfig
        });
      } else if (selectedConfig) {
        await apiClient.updateConfiguration(
          selectedConfig.scope,
          selectedConfig.target,
          parsedConfig
        );
      }
      
      setIsEditing(false);
      setIsCreating(false);
      fetchConfigs();
    } catch (error) {
      console.error('Failed to save configuration:', error);
      alert('保存配置失败: ' + (error as any).message);
    } finally {
      stopLoading();
    }
  };

  const handleDelete = async (config: Configuration) => {
    if (config.scope === ConfigurationScope.GLOBAL) {
        alert('全局配置禁止删除，请使用编辑功能修改。');
        return;
    }

    if (!confirm(`确定要删除 ${config.scope}:${config.target} 的配置吗？`)) return;

    startLoading();
    try {
      await apiClient.deleteConfiguration(config.id);
      fetchConfigs();
      if (selectedConfig?.id === config.id) {
        setSelectedConfig(null);
        setIsEditing(false);
      }
    } catch (error) {
      console.error('Failed to delete configuration:', error);
      alert('删除配置失败: ' + (error as any).message);
    } finally {
      stopLoading();
    }
  };

  return (
    <div className="space-y-6 flex flex-col h-[calc(100vh-100px)]">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">配置管理</h1>
          <p className="text-sm text-slate-400 mt-1">管理全局、组和设备级动态配置</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={fetchConfigs}
            className="inline-flex items-center px-3 py-2 rounded-lg border border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800 hover:text-white transition-all shadow-sm group"
          >
            <RefreshCw className="h-4 w-4 mr-2 group-hover:rotate-180 transition-transform duration-500" />
            刷新
          </button>
          <button
            onClick={handleCreate}
            className="inline-flex items-center px-3 py-2 rounded-lg bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all font-medium text-sm shadow-[0_0_15px_-3px_rgba(6,182,212,0.15)]"
          >
            <Plus className="h-4 w-4 mr-2" />
            新建配置
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        
        {/* Configuration List - Left Panel */}
        <Card variant="glass" className="lg:col-span-1 flex flex-col p-0 overflow-hidden border-slate-800/60 shadow-xl min-h-[400px]">
          <div className="p-4 border-b border-slate-800/50 bg-slate-900/50 backdrop-blur-sm">
            <h2 className="text-sm font-bold text-slate-200 flex items-center uppercase tracking-wider">
              <Settings className="h-4 w-4 mr-2 text-cyan-400" />
              配置列表
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {configs.length === 0 && (
              <div className="flex flex-col items-center justify-center h-40 text-slate-500 italic text-sm">
                <span>未找到配置</span>
              </div>
            )}
            {configs.map((config) => {
               const isSelected = selectedConfig?.id === config.id;
               return (
                <div 
                  key={config.id}
                  onClick={() => setSelectedConfig(config)}
                  className={cn(
                    "p-3 rounded-lg cursor-pointer transition-all duration-200 border",
                    isSelected 
                      ? "bg-cyan-500/10 border-cyan-500/30 shadow-md shadow-cyan-900/10" 
                      : "bg-slate-900/30 border-slate-800 hover:bg-slate-800/50 hover:border-slate-700"
                  )}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border",
                        config.scope === ConfigurationScope.GLOBAL 
                          ? "bg-purple-500/10 text-purple-300 border-purple-500/20" 
                          : config.scope === ConfigurationScope.GROUP
                            ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                            : "bg-blue-500/10 text-blue-300 border-blue-500/20"
                      )}>
                        {config.scope === ConfigurationScope.GLOBAL ? '全局' : config.scope === ConfigurationScope.GROUP ? '组' : '设备'}
                      </span>
                      <h3 className="text-sm font-semibold text-slate-200 mt-2">
                        {config.scope === ConfigurationScope.GLOBAL ? '全局默认' : config.target}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-slate-500 bg-slate-950/50 px-1.5 py-0.5 rounded">v{config.version}</span>
                          <span className="text-[10px] text-slate-500 truncate max-w-[120px]">
                             by {config.updatedBy}
                          </span>
                      </div>
                    </div>
                    {isSelected && (
                        <div className="flex flex-col gap-1 items-end animate-in fade-in slide-in-from-right-2">
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleEdit(config); }}
                                className="p-1.5 rounded-md hover:bg-blue-500/20 text-slate-400 hover:text-blue-400 transition-colors"
                                title="编辑"
                            >
                                <Settings className="h-3.5 w-3.5" />
                            </button>
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleDelete(config); }}
                                className="p-1.5 rounded-md hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
                                title="删除"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Editor Area - Right Panel */}
        <Card variant="glass" className="lg:col-span-2 flex flex-col p-0 overflow-hidden border-slate-800/60 shadow-xl min-h-[500px]">
          {isEditing ? (
             <div className="flex flex-col h-full bg-slate-900/50">
               {/* Editor Header */}
               <div className="flex justify-between items-center p-4 border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-md">
                 <h2 className="text-base font-bold text-slate-100 flex items-center">
                   {isCreating ? <Plus className="w-4 h-4 mr-2" /> : <Settings className="w-4 h-4 mr-2" />}
                   {isCreating ? '创建配置' : '编辑配置'}
                 </h2>
                 <button 
                   onClick={() => setIsEditing(false)}
                   className="text-slate-500 hover:text-slate-300 transition-colors"
                 >
                   <X className="h-5 w-5" />
                 </button>
               </div>
                
               {/* Editor Controls */}
               <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-slate-700/30">
                 <div className="md:col-span-1">
                   <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">作用域</label>
                   <select
                     value={scope}
                     onChange={(e) => setScope(e.target.value as ConfigurationScope)}
                     disabled={!isCreating}
                     className="w-full bg-slate-950/50 border border-slate-700 text-slate-200 text-sm rounded-lg p-2 focus:ring-1 focus:ring-cyan-500 outline-none disabled:opacity-50"
                   >
                     {/* Only allow selecting Global if it doesn't exist or we are creating it and want to enforce check (which we did in handleCreate default) */}
                     {/* But user can still switch back to Global in dropdown unless we disable it */}
                     <option value={ConfigurationScope.GLOBAL} disabled={isCreating && configs.some(c => c.scope === ConfigurationScope.GLOBAL)}>全局 {isCreating && configs.some(c => c.scope === ConfigurationScope.GLOBAL) ? '(已存在)' : ''}</option>
                     <option value={ConfigurationScope.GROUP}>组（令牌）</option>
                     <option value={ConfigurationScope.DEVICE}>设备</option>
                   </select>
                 </div>
                 <div className="md:col-span-2">
                   <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">目标标识符</label>
                   <input
                     type="text"
                     value={scope === ConfigurationScope.GLOBAL ? 'default' : target}
                     onChange={(e) => setTarget(e.target.value)}
                     disabled={scope === ConfigurationScope.GLOBAL || !isCreating}
                     placeholder={scope === ConfigurationScope.GROUP ? "输入注册令牌" : "输入设备 ID"}
                     className="w-full bg-slate-950/50 border border-slate-700 text-slate-200 text-sm rounded-lg p-2 focus:ring-1 focus:ring-cyan-500 outline-none placeholder:text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                   />
                 </div>
               </div>

               {/* Editor Content */}
               <div className="flex-1 flex flex-col min-h-0 bg-slate-950/20">
                 <div className="flex justify-between items-center px-4 py-2 border-b border-slate-700/30">
                   <label className="text-xs font-semibold text-slate-500 uppercase flex items-center">
                     配置内容
                   </label>
                   <div className="flex bg-slate-900 border border-slate-700 p-0.5 rounded-lg">
                      <button
                        onClick={() => setEditMode('visual')}
                        className={cn(
                          "px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5",
                          editMode === 'visual' 
                            ? "bg-slate-700 text-cyan-300 shadow-sm" 
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                        )}
                      >
                        <Settings className="w-3 h-3" /> 可视化
                      </button>
                      <button
                        onClick={() => setEditMode('json')}
                        className={cn(
                          "px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5",
                          editMode === 'json'
                            ? "bg-slate-700 text-cyan-300 shadow-sm"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                        )}
                      >
                        <Code2 className="w-3 h-3" /> JSON
                      </button>
                    </div>
                 </div>
                 
                 <div className="flex-1 min-h-0 relative">
                   {editMode === 'visual' ? (
                     <div className="absolute inset-0 overflow-hidden">
                       <VisualConfigEditor 
                         initialConfig={(() => {
                            try {
                              return JSON.parse(configContent);
                            } catch {
                              return {};
                            }
                         })()}
                         onChange={(newConfig) => {
                            setConfigContent(JSON.stringify(newConfig, null, 2));
                            setIsValidJson(true);
                         }}
                       />
                     </div>
                   ) : (
                    <div className="absolute inset-0 p-4">
                        <JsonEditor 
                        initialValue={configContent}
                        onChange={(val, valid) => {
                            setConfigContent(val);
                            setIsValidJson(valid);
                        }}
                        />
                    </div>
                   )}
                 </div>
               </div>

               {/* Footer Action Bar */}
               <div className="flex justify-end space-x-3 p-4 border-t border-slate-700/50 bg-slate-900/80 backdrop-blur-md">
                 <button
                   onClick={() => setIsEditing(false)}
                   className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-800/50 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors"
                 >
                   取消
                 </button>
                 <button
                   onClick={handleSave}
                   disabled={!isValidJson}
                   className="inline-flex items-center px-4 py-2 text-sm font-bold text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-lg shadow-lg shadow-cyan-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                 >
                   <Save className="h-4 w-4 mr-2" />
                   保存更改
                 </button>
               </div>
             </div>
          ) : selectedConfig ? (
            <div className="flex flex-col h-full">
              <div className="flex justify-between items-start p-6 border-b border-slate-700/50 bg-slate-900/30">
                <div>
                   <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                     {selectedConfig.scope === ConfigurationScope.GLOBAL ? '全局系统默认' : selectedConfig.target}
                     <span className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-wider",
                        selectedConfig.scope === ConfigurationScope.GLOBAL 
                          ? "bg-purple-900/30 text-purple-300 border-purple-500/30" 
                          : "bg-blue-900/30 text-blue-300 border-blue-500/30"
                      )}>
                        {selectedConfig.scope === ConfigurationScope.GLOBAL ? '全局' : selectedConfig.scope === ConfigurationScope.GROUP ? '组' : '设备'}
                      </span>
                   </h2>
                   <div className="mt-2 text-sm text-slate-400">
                     最新版本 <span className="text-cyan-400 font-mono">v{selectedConfig.version}</span> 由 <span className="text-slate-300">{selectedConfig.updatedBy}</span> 更新
                   </div>
                </div>
                <button
                  onClick={() => handleEdit(selectedConfig)}
                  className="inline-flex items-center px-3 py-1.5 border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 shadow-sm text-sm font-medium rounded-lg hover:bg-cyan-500/20 transition-all"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  编辑配置
                </button>
              </div>
              
              <div className="flex-1 bg-slate-950/40 p-0 overflow-hidden flex flex-col">
                <div className="bg-slate-900/80 px-4 py-2 border-b border-slate-800 flex justify-between items-center backdrop-blur-sm">
                  <div className="flex items-center gap-2">
                    <FileJson className="w-4 h-4 text-amber-500" />
                    <span className="text-xs font-mono text-slate-400">config.json</span>
                  </div>
                  <div className="flex items-center text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                     <CheckCircle className="w-3 h-3 mr-1" />
                     有效配置
                  </div>
                </div>
                <div className="flex-1 relative overflow-hidden">
                    <div className="absolute inset-0 p-4 overflow-auto scrollbar-thin scrollbar-thumb-slate-700">
                        <pre className="text-sm font-mono text-slate-300">
                        {JSON.stringify(selectedConfig.config, null, 2)}
                        </pre>
                    </div>
                </div>
              </div>
            </div>
          ) : (
             <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8">
               <div className="w-20 h-20 rounded-full bg-slate-900/50 flex items-center justify-center mb-4 border border-slate-800">
                    <FileJson className="h-10 w-10 text-slate-700" />
               </div>
               <p className="text-lg font-medium text-slate-300">未选择配置</p>
               <p className="text-sm mt-2 text-slate-500 max-w-sm text-center">从左侧列表中选择一个配置以查看详细信息，或创建新的覆盖。</p>
               <button
                 onClick={handleCreate}
                 className="mt-8 inline-flex items-center px-6 py-2.5 border border-cyan-500/30 text-sm font-bold rounded-lg text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 transition-all shadow-[0_0_15px_-3px_rgba(6,182,212,0.15)]"
               >
                 <Plus className="h-4 w-4 mr-2" />
                 创建新配置
               </button>
             </div>
          )}
        </Card>
      </div>
    </div>
  );
}
