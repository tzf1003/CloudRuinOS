import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Save, 
  Trash2, 
  Plus, 
  Search,
  RefreshCw,
  AlertTriangle,
  FileJson,
  CheckCircle,
  X
} from 'lucide-react';
import { apiClient } from '../lib/api-client';
import { Configuration, ConfigurationScope } from '../types/api';
import { useGlobalLoading } from '../contexts/UIContext';

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
    <div className="flex flex-col h-full">
      <textarea
        className={`w-full h-96 font-mono text-sm p-4 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
          error ? 'border-red-500 bg-red-50' : 'border-gray-300'
        } ${readOnly ? 'bg-gray-100 text-gray-500' : ''}`}
        value={value}
        onChange={handleChange}
        readOnly={readOnly}
        spellCheck={false}
      />
      {error && (
        <div className="mt-2 text-xs text-red-600 flex items-center">
          <AlertTriangle className="w-3 h-3 mr-1" />
          JSON Error: {error}
        </div>
      )}
    </div>
  );
};

export function ConfigManagementPage() {
  const [configs, setConfigs] = useState<Configuration[]>([]);
  const { startLoading, stopLoading } = useGlobalLoading();
  const [selectedConfig, setSelectedConfig] = useState<Configuration | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  
  // Form State
  const [scope, setScope] = useState<ConfigurationScope>(ConfigurationScope.GLOBAL);
  const [target, setTarget] = useState('default');
  const [configContent, setConfigContent] = useState('{}');
  const [isValidJson, setIsValidJson] = useState(true);

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
    setSelectedConfig(null);
    setScope(ConfigurationScope.GLOBAL);
    setTarget('default');
    setConfigContent(JSON.stringify({
      heartbeat: {
        interval: 60
      }
    }, null, 2));
    setIsCreating(true);
    setIsEditing(true);
  };

  const handleEdit = (config: Configuration) => {
    setSelectedConfig(config);
    setScope(config.scope);
    setTarget(config.target);
    setConfigContent(JSON.stringify(config.config, null, 2));
    setIsCreating(false);
    setIsEditing(true);
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
      alert('Failed to save configuration: ' + (error as any).message);
    } finally {
      stopLoading();
    }
  };

  const handleDelete = async (config: Configuration) => {
    if (!confirm(`Are you sure you want to delete config for ${config.scope}:${config.target}?`)) return;

    startLoading();
    try {
      await apiClient.deleteConfiguration(config.scope, config.target);
      fetchConfigs();
      if (selectedConfig?.id === config.id) {
        setSelectedConfig(null);
        setIsEditing(false);
      }
    } catch (error) {
      console.error('Failed to delete configuration:', error);
    } finally {
      stopLoading();
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">配置管理</h1>
          <p className="mt-1 text-sm text-gray-500">
            管理全局、分组和设备级动态配置
          </p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={fetchConfigs}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            刷新
          </button>
          <button
            onClick={handleCreate}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            新建配置
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configuration List */}
        <div className="lg:col-span-1 bg-white shadow rounded-lg overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900 flex items-center">
              <Settings className="h-5 w-5 mr-2 text-gray-500" />
              配置列表
            </h2>
          </div>
          <ul className="divide-y divide-gray-200 max-h-[600px] overflow-y-auto">
            {configs.length === 0 && (
              <li className="p-4 text-center text-gray-500 italic">暂无配置</li>
            )}
            {configs.map((config) => (
              <li 
                key={config.id}
                className={`hover:bg-gray-50 cursor-pointer transition-colors ${selectedConfig?.id === config.id ? 'bg-blue-50' : ''}`}
                onClick={() => setSelectedConfig(config)}
              >
                <div className="p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        config.scope === ConfigurationScope.GLOBAL 
                          ? 'bg-purple-100 text-purple-800' 
                          : config.scope === ConfigurationScope.GROUP
                            ? 'bg-green-100 text-green-800'
                            : 'bg-blue-100 text-blue-800'
                      }`}>
                        {config.scope.toUpperCase()}
                      </span>
                      <h3 className="text-sm font-medium text-gray-900 mt-1">
                        {config.scope === ConfigurationScope.GLOBAL ? 'Global Default' : config.target}
                      </h3>
                      <p className="text-xs text-gray-500 mt-1">
                        Version {config.version} • Updated by {config.updatedBy}
                      </p>
                    </div>
                    <div className="flex space-x-2">
                       <button 
                        onClick={(e) => { e.stopPropagation(); handleEdit(config); }}
                        className="text-gray-400 hover:text-blue-600"
                       >
                         <Settings className="h-4 w-4" />
                       </button>
                       <button 
                        onClick={(e) => { e.stopPropagation(); handleDelete(config); }}
                        className="text-gray-400 hover:text-red-600"
                       >
                         <Trash2 className="h-4 w-4" />
                       </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Editor Area */}
        <div className="lg:col-span-2 bg-white shadow rounded-lg flex flex-col min-h-[500px]">
          {isEditing ? (
             <div className="p-6 flex flex-col h-full">
               <div className="flex justify-between items-center mb-6">
                 <h2 className="text-lg font-medium text-gray-900">
                   {isCreating ? '新建配置' : '编辑配置'}
                 </h2>
                 <button 
                   onClick={() => setIsEditing(false)}
                   className="text-gray-400 hover:text-gray-500"
                 >
                   <X className="h-5 w-5" />
                 </button>
               </div>

               <div className="flex space-x-4 mb-4">
                 <div className="w-1/3">
                   <label className="block text-sm font-medium text-gray-700 mb-1">Scope</label>
                   <select
                     value={scope}
                     onChange={(e) => setScope(e.target.value as ConfigurationScope)}
                     disabled={!isCreating}
                     className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                   >
                     <option value={ConfigurationScope.GLOBAL}>Global</option>
                     <option value={ConfigurationScope.GROUP}>Group (Token)</option>
                     <option value={ConfigurationScope.DEVICE}>Device</option>
                   </select>
                 </div>
                 <div className="w-2/3">
                   <label className="block text-sm font-medium text-gray-700 mb-1">Target</label>
                   <input
                     type="text"
                     value={scope === ConfigurationScope.GLOBAL ? 'default' : target}
                     onChange={(e) => setTarget(e.target.value)}
                     disabled={scope === ConfigurationScope.GLOBAL || !isCreating}
                     placeholder={scope === ConfigurationScope.GROUP ? "Enrollment Token" : "Device ID"}
                     className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm disabled:bg-gray-100 disabled:text-gray-500"
                   />
                 </div>
               </div>

               <div className="flex-1 mb-4">
                 <label className="block text-sm font-medium text-gray-700 mb-1">
                   JSON Configuration 
                   <span className="ml-2 text-xs text-gray-500 font-normal">
                     (Merged fields only, e.g., heartbeat.interval)
                   </span>
                 </label>
                 <JsonEditor 
                  initialValue={configContent}
                  onChange={(val, valid) => {
                    setConfigContent(val);
                    setIsValidJson(valid);
                  }}
                 />
               </div>

               <div className="flex justify-end space-x-3">
                 <button
                   onClick={() => setIsEditing(false)}
                   className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50"
                 >
                   取消
                 </button>
                 <button
                   onClick={handleSave}
                   disabled={!isValidJson}
                   className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                   <Save className="h-4 w-4 mr-2" />
                   保存配置
                 </button>
               </div>
             </div>
          ) : selectedConfig ? (
            <div className="p-6 h-full flex flex-col">
              <div className="flex justify-between items-start mb-6">
                <div>
                   <h2 className="text-xl font-bold text-gray-900">
                     {selectedConfig.scope === ConfigurationScope.GLOBAL ? 'Global Defaults' : selectedConfig.target}
                   </h2>
                   <div className="mt-2 text-sm text-gray-500">
                     Scope: <span className="font-semibold text-gray-700 uppercase">{selectedConfig.scope}</span>
                   </div>
                </div>
                <button
                  onClick={() => handleEdit(selectedConfig)}
                  className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Edit
                </button>
              </div>
              
              <div className="flex-1 border rounded-lg overflow-hidden bg-gray-50">
                <div className="bg-gray-100 px-4 py-2 border-b flex justify-between items-center">
                  <span className="text-xs font-mono text-gray-500">config.json</span>
                  <div className="flex items-center text-xs text-green-600">
                     <CheckCircle className="w-3 h-3 mr-1" />
                     Valid JSON
                  </div>
                </div>
                <pre className="p-4 text-sm font-mono overflow-auto h-[400px]">
                  {JSON.stringify(selectedConfig.config, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
             <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-8">
               <FileJson className="h-12 w-12 mb-4 text-gray-300" />
               <p className="text-lg font-medium">No Configuration Selected</p>
               <p className="text-sm mt-2">Select a configuration from the list or create a new one.</p>
               <button
                 onClick={handleCreate}
                 className="mt-6 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200"
               >
                 <Plus className="h-4 w-4 mr-2" />
                 Create New Config
               </button>
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
