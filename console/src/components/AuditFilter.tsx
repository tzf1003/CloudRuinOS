import React, { useState, useCallback, useEffect } from 'react';
import { Search, Filter, Calendar, X, Save, RotateCcw, ChevronDown } from 'lucide-react';
import { AuditFilters } from '../types/api';

interface AuditFilterProps {
  filters: AuditFilters;
  onFiltersChange: (filters: AuditFilters) => void;
  onSaveFilters?: (name: string, filters: AuditFilters) => void;
  onLoadFilters?: (filters: AuditFilters) => void;
  savedFilters?: Array<{ name: string; filters: AuditFilters }>;
  className?: string;
}

interface SavedFilterSet {
  name: string;
  filters: AuditFilters;
  createdAt: number;
}

export function AuditFilter({
  filters,
  onFiltersChange,
  onSaveFilters,
  onLoadFilters,
  savedFilters = [],
  className = ''
}: AuditFilterProps) {
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveFilterName, setSaveFilterName] = useState('');
  const [showSavedFilters, setShowSavedFilters] = useState(false);
  const [localSavedFilters, setLocalSavedFilters] = useState<SavedFilterSet[]>([]);

  // Load saved filters from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('audit-saved-filters');
      if (saved) {
        setLocalSavedFilters(JSON.parse(saved));
      }
    } catch (error) {
      console.warn('Failed to load saved filters:', error);
    }
  }, []);

  // Save filters to localStorage
  const saveToLocalStorage = useCallback((filters: SavedFilterSet[]) => {
    try {
      localStorage.setItem('audit-saved-filters', JSON.stringify(filters));
    } catch (error) {
      console.warn('Failed to save filters:', error);
    }
  }, []);

  const actionTypes = [
    { value: '', label: '所有操作' },
    { value: 'device_enrollment', label: '设备注册' },
    { value: 'device_heartbeat', label: '设备心跳' },
    { value: 'command_execution', label: '命令执行' },
    { value: 'file_operation', label: '文件操作' },
    { value: 'session_created', label: '会话创建' },
    { value: 'session_closed', label: '会话关闭' },
    { value: 'security_event', label: '安全事件' },
  ];

  const severityOptions = [
    { value: '', label: '所有级别' },
    { value: 'info', label: '信息' },
    { value: 'warning', label: '警告' },
    { value: 'error', label: '错误' },
  ];

  const updateFilter = useCallback((key: keyof AuditFilters, value: any) => {
    const newFilters = {
      ...filters,
      [key]: value || undefined
    };
    
    // Remove undefined values to keep the object clean
    Object.keys(newFilters).forEach(k => {
      if (newFilters[k as keyof AuditFilters] === undefined) {
        delete newFilters[k as keyof AuditFilters];
      }
    });
    
    onFiltersChange(newFilters);
  }, [filters, onFiltersChange]);

  const clearAllFilters = useCallback(() => {
    onFiltersChange({});
  }, [onFiltersChange]);

  const resetToDefaults = useCallback(() => {
    onFiltersChange({
      limit: 50,
      offset: 0
    });
  }, [onFiltersChange]);

  const handleSaveFilters = useCallback(() => {
    if (!saveFilterName.trim()) return;

    const newFilterSet: SavedFilterSet = {
      name: saveFilterName.trim(),
      filters: { ...filters },
      createdAt: Date.now()
    };

    const updatedFilters = [...localSavedFilters.filter(f => f.name !== newFilterSet.name), newFilterSet];
    setLocalSavedFilters(updatedFilters);
    saveToLocalStorage(updatedFilters);

    if (onSaveFilters) {
      onSaveFilters(newFilterSet.name, newFilterSet.filters);
    }

    setSaveFilterName('');
    setShowSaveDialog(false);
  }, [saveFilterName, filters, localSavedFilters, saveToLocalStorage, onSaveFilters]);

  const handleLoadFilters = useCallback((filterSet: SavedFilterSet) => {
    onFiltersChange(filterSet.filters);
    if (onLoadFilters) {
      onLoadFilters(filterSet.filters);
    }
    setShowSavedFilters(false);
  }, [onFiltersChange, onLoadFilters]);

  const handleDeleteSavedFilter = useCallback((name: string) => {
    const updatedFilters = localSavedFilters.filter(f => f.name !== name);
    setLocalSavedFilters(updatedFilters);
    saveToLocalStorage(updatedFilters);
  }, [localSavedFilters, saveToLocalStorage]);

  // Get active filter count for display
  const activeFilterCount = Object.keys(filters).filter(key => 
    key !== 'limit' && key !== 'offset' && filters[key as keyof AuditFilters]
  ).length;

  const hasActiveFilters = activeFilterCount > 0;

  return (
    <div className={`bg-white rounded-lg shadow ${className}`}>
      {/* Filter Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Filter className="h-5 w-5 text-gray-400" />
          <h3 className="text-sm font-medium text-gray-900">审计日志筛选</h3>
          {hasActiveFilters && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {activeFilterCount} 个筛选条件
            </span>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          {/* Saved Filters Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowSavedFilters(!showSavedFilters)}
              className="inline-flex items-center px-3 py-1 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              已保存筛选
              <ChevronDown className="ml-1 h-3 w-3" />
            </button>
            
            {showSavedFilters && (
              <div className="absolute right-0 mt-1 w-64 bg-white rounded-md shadow-lg border border-gray-200 z-10">
                <div className="py-1">
                  {localSavedFilters.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-500">
                      暂无已保存的筛选条件
                    </div>
                  ) : (
                    localSavedFilters.map((filterSet) => (
                      <div key={filterSet.name} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50">
                        <button
                          onClick={() => handleLoadFilters(filterSet)}
                          className="flex-1 text-left text-sm text-gray-700 hover:text-gray-900"
                        >
                          {filterSet.name}
                        </button>
                        <button
                          onClick={() => handleDeleteSavedFilter(filterSet.name)}
                          className="ml-2 text-gray-400 hover:text-red-500"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Save Current Filters */}
          <button
            onClick={() => setShowSaveDialog(true)}
            disabled={!hasActiveFilters}
            className="inline-flex items-center px-3 py-1 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="h-3 w-3 mr-1" />
            保存
          </button>

          {/* Reset Filters */}
          <button
            onClick={resetToDefaults}
            className="inline-flex items-center px-3 py-1 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            重置
          </button>

          {/* Clear All Filters */}
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="inline-flex items-center px-3 py-1 border border-gray-300 text-xs font-medium rounded-md text-red-700 bg-white hover:bg-red-50"
            >
              <X className="h-3 w-3 mr-1" />
              清除
            </button>
          )}
        </div>
      </div>

      {/* Filter Controls */}
      <div className="p-4">
        {/* Search */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-700 mb-2">全文搜索</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索设备ID、操作类型、会话ID或操作数据..."
              value={filters.search || ''}
              onChange={(e) => updateFilter('search', e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
        </div>

        {/* Filter Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {/* Device ID */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">设备 ID</label>
            <input
              type="text"
              placeholder="过滤设备..."
              value={filters.device_id || ''}
              onChange={(e) => updateFilter('device_id', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          {/* Action Type */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">操作类型</label>
            <select
              value={filters.action_type || ''}
              onChange={(e) => updateFilter('action_type', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              {actionTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Severity */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">严重程度</label>
            <select
              value={filters.severity || ''}
              onChange={(e) => updateFilter('severity', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              {severityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Page Size */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">每页显示</label>
            <select
              value={filters.limit || 50}
              onChange={(e) => updateFilter('limit', Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value={25}>25 条</option>
              <option value={50}>50 条</option>
              <option value={100}>100 条</option>
              <option value={200}>200 条</option>
            </select>
          </div>
        </div>

        {/* Date Range */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">开始时间</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="datetime-local"
                value={filters.start_time ? new Date(filters.start_time * 1000).toISOString().slice(0, 16) : ''}
                onChange={(e) => updateFilter('start_time', e.target.value ? Math.floor(new Date(e.target.value).getTime() / 1000) : null)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">结束时间</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="datetime-local"
                value={filters.end_time ? new Date(filters.end_time * 1000).toISOString().slice(0, 16) : ''}
                onChange={(e) => updateFilter('end_time', e.target.value ? Math.floor(new Date(e.target.value).getTime() / 1000) : null)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Save Filter Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-medium text-gray-900 mb-4">保存筛选条件</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                筛选条件名称
              </label>
              <input
                type="text"
                value={saveFilterName}
                onChange={(e) => setSaveFilterName(e.target.value)}
                placeholder="输入筛选条件名称..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowSaveDialog(false);
                  setSaveFilterName('');
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleSaveFilters}
                disabled={!saveFilterName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close dropdowns */}
      {(showSavedFilters || showSaveDialog) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setShowSavedFilters(false);
            setShowSaveDialog(false);
          }}
        />
      )}
    </div>
  );
}