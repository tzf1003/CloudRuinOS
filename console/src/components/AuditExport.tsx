import React, { useState, useCallback } from 'react';
import { Download, FileText, Database, Table, X, CheckCircle, AlertCircle } from 'lucide-react';
import { AuditFilters, AuditLog } from '../types/api';

interface AuditExportProps {
  filters: AuditFilters;
  logs: AuditLog[];
  totalCount: number;
  onExport: (format: ExportFormat, options: ExportOptions) => Promise<void>;
  isOpen: boolean;
  onClose: () => void;
}

export type ExportFormat = 'csv' | 'json' | 'xlsx';

export interface ExportOptions {
  includeHeaders: boolean;
  dateFormat: 'iso' | 'readable' | 'timestamp';
  includeFilters: boolean;
  maxRecords?: number;
  filename?: string;
}

interface ExportProgress {
  status: 'idle' | 'preparing' | 'exporting' | 'success' | 'error';
  progress: number;
  message: string;
  filename?: string;
}

export function AuditExport({
  filters,
  logs,
  totalCount,
  onExport,
  isOpen,
  onClose
}: AuditExportProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('csv');
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    includeHeaders: true,
    dateFormat: 'readable',
    includeFilters: true,
    maxRecords: Math.min(totalCount, 10000),
    filename: `audit-logs-${new Date().toISOString().split('T')[0]}`
  });
  const [exportProgress, setExportProgress] = useState<ExportProgress>({
    status: 'idle',
    progress: 0,
    message: ''
  });

  const formatOptions = [
    {
      value: 'csv' as ExportFormat,
      label: 'CSV 文件',
      description: '逗号分隔值，适合在 Excel 中打开',
      icon: Table,
      extension: '.csv'
    },
    {
      value: 'json' as ExportFormat,
      label: 'JSON 文件',
      description: '结构化数据格式，适合程序处理',
      icon: Database,
      extension: '.json'
    },
    {
      value: 'xlsx' as ExportFormat,
      label: 'Excel 文件',
      description: 'Microsoft Excel 格式，支持格式化',
      icon: FileText,
      extension: '.xlsx'
    }
  ];

  const dateFormatOptions = [
    { value: 'readable' as const, label: '可读格式 (2024-01-15 14:30:25)' },
    { value: 'iso' as const, label: 'ISO 格式 (2024-01-15T14:30:25.000Z)' },
    { value: 'timestamp' as const, label: '时间戳 (1705327825)' }
  ];

  const handleExport = useCallback(async () => {
    try {
      setExportProgress({
        status: 'preparing',
        progress: 0,
        message: '准备导出数据...'
      });

      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setExportProgress(prev => ({
          ...prev,
          progress: Math.min(prev.progress + 10, 90)
        }));
      }, 200);

      await onExport(selectedFormat, exportOptions);

      clearInterval(progressInterval);
      
      const filename = `${exportOptions.filename}${formatOptions.find(f => f.value === selectedFormat)?.extension}`;
      
      setExportProgress({
        status: 'success',
        progress: 100,
        message: '导出完成！',
        filename
      });

      // Auto close after success
      setTimeout(() => {
        onClose();
        setExportProgress({
          status: 'idle',
          progress: 0,
          message: ''
        });
      }, 2000);

    } catch (error) {
      setExportProgress({
        status: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : '导出失败'
      });
    }
  }, [selectedFormat, exportOptions, onExport, onClose]);

  const updateOption = useCallback(<K extends keyof ExportOptions>(
    key: K,
    value: ExportOptions[K]
  ) => {
    setExportOptions(prev => ({
      ...prev,
      [key]: value
    }));
  }, []);

  const getActiveFilterCount = () => {
    return Object.keys(filters).filter(key => 
      key !== 'limit' && key !== 'offset' && filters[key as keyof AuditFilters]
    ).length;
  };

  const formatFileSize = (records: number) => {
    // Rough estimation: CSV ~200 bytes per record, JSON ~400 bytes, XLSX ~300 bytes
    const bytesPerRecord = selectedFormat === 'csv' ? 200 : selectedFormat === 'json' ? 400 : 300;
    const totalBytes = records * bytesPerRecord;
    
    if (totalBytes < 1024) return `${totalBytes} B`;
    if (totalBytes < 1024 * 1024) return `${(totalBytes / 1024).toFixed(1)} KB`;
    return `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <Download className="h-6 w-6 text-blue-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">导出审计日志</h2>
              <p className="text-sm text-gray-500">
                共 {totalCount} 条记录，当前筛选 {logs.length} 条
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={exportProgress.status === 'exporting'}
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Export Format Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              选择导出格式
            </label>
            <div className="grid grid-cols-1 gap-3">
              {formatOptions.map((format) => {
                const Icon = format.icon;
                return (
                  <label
                    key={format.value}
                    className={`relative flex items-center p-4 border rounded-lg cursor-pointer hover:bg-gray-50 ${
                      selectedFormat === format.value
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="format"
                      value={format.value}
                      checked={selectedFormat === format.value}
                      onChange={(e) => setSelectedFormat(e.target.value as ExportFormat)}
                      className="sr-only"
                    />
                    <Icon className={`h-5 w-5 mr-3 ${
                      selectedFormat === format.value ? 'text-blue-600' : 'text-gray-400'
                    }`} />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">
                        {format.label}
                      </div>
                      <div className="text-xs text-gray-500">
                        {format.description}
                      </div>
                    </div>
                    {selectedFormat === format.value && (
                      <CheckCircle className="h-5 w-5 text-blue-600" />
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Export Options */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-700">导出选项</h3>
            
            {/* Filename */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                文件名
              </label>
              <input
                type="text"
                value={exportOptions.filename || ''}
                onChange={(e) => updateOption('filename', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                placeholder="audit-logs"
              />
              <p className="text-xs text-gray-500 mt-1">
                文件扩展名将自动添加
              </p>
            </div>

            {/* Max Records */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                最大记录数
              </label>
              <input
                type="number"
                min="1"
                max="50000"
                value={exportOptions.maxRecords || ''}
                onChange={(e) => updateOption('maxRecords', Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                预计文件大小: {formatFileSize(exportOptions.maxRecords || 0)}
              </p>
            </div>

            {/* Date Format */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                日期格式
              </label>
              <select
                value={exportOptions.dateFormat}
                onChange={(e) => updateOption('dateFormat', e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                {dateFormatOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Checkboxes */}
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={exportOptions.includeHeaders}
                  onChange={(e) => updateOption('includeHeaders', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">包含列标题</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={exportOptions.includeFilters}
                  onChange={(e) => updateOption('includeFilters', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">
                  包含筛选条件信息 ({getActiveFilterCount()} 个筛选条件)
                </span>
              </label>
            </div>
          </div>

          {/* Export Progress */}
          {exportProgress.status !== 'idle' && (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center space-x-3">
                {exportProgress.status === 'success' ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : exportProgress.status === 'error' ? (
                  <AlertCircle className="h-5 w-5 text-red-600" />
                ) : (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
                )}
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">
                    {exportProgress.message}
                  </div>
                  {exportProgress.filename && (
                    <div className="text-xs text-gray-500">
                      文件: {exportProgress.filename}
                    </div>
                  )}
                </div>
              </div>
              
              {exportProgress.status === 'preparing' || exportProgress.status === 'exporting' ? (
                <div className="mt-3">
                  <div className="bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${exportProgress.progress}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {exportProgress.progress}% 完成
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-500">
            将导出 {Math.min(exportOptions.maxRecords || 0, logs.length)} 条记录
          </div>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              disabled={exportProgress.status === 'exporting'}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              取消
            </button>
            <button
              onClick={handleExport}
              disabled={
                exportProgress.status === 'exporting' ||
                !exportOptions.filename?.trim() ||
                !exportOptions.maxRecords ||
                exportOptions.maxRecords <= 0
              }
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exportProgress.status === 'exporting' ? '导出中...' : '开始导出'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}