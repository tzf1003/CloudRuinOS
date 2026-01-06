import { useState, useCallback } from 'react';
import { Download, FileText, Database, Table, X, CheckCircle, AlertCircle } from 'lucide-react';
import { AuditFilters, AuditLog } from '../types/api';
import { cn } from '../lib/utils';
import { Card } from './ui/Card';

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
      description: '逗号分隔值，适用于 Excel',
      icon: Table,
      extension: '.csv'
    },
    {
      value: 'json' as ExportFormat,
      label: 'JSON 文件',
      description: '结构化数据格式，适用于程序处理',
      icon: Database,
      extension: '.json'
    },
    {
      value: 'xlsx' as ExportFormat,
      label: 'Excel 文件',
      description: 'Microsoft Excel 格式',
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
        message: '准备数据...'
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
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <Card variant="glass" className="w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col p-0 border-slate-700/50 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700/50 bg-slate-900/50">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                <Download className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">导出审计日志</h2>
              <p className="text-sm text-slate-400">
                共 {totalCount} 条记录，已选 {logs.length} 条
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
            disabled={exportProgress.status === 'exporting'}
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 bg-slate-950/30">
          {/* Export Format Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-3">
              导出格式
            </label>
            <div className="grid grid-cols-1 gap-3">
              {formatOptions.map((format) => {
                const Icon = format.icon;
                const isSelected = selectedFormat === format.value;
                return (
                  <div
                    key={format.value}
                    onClick={() => setSelectedFormat(format.value)}
                    className={cn(
                        "relative flex items-center p-4 border rounded-xl cursor-pointer transition-all duration-200",
                        isSelected 
                            ? "bg-cyan-500/10 border-cyan-500/50 shadow-[0_0_15px_-3px_rgba(6,182,212,0.15)]" 
                            : "bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40"
                    )}
                  >
                    <Icon className={cn("h-5 w-5 mr-3", isSelected ? "text-cyan-400" : "text-slate-500")} />
                    <div className="flex-1">
                      <div className={cn("text-sm font-medium", isSelected ? "text-cyan-100" : "text-slate-300")}>
                        {format.label}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {format.description}
                      </div>
                    </div>
                    {isSelected && (
                      <CheckCircle className="h-5 w-5 text-cyan-400" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Export Options */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-slate-300">Options</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Filename */}
                <div className="col-span-1 md:col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase">
                    Filename
                </label>
                <div className="relative">
                    <input
                        type="text"
                        value={exportOptions.filename || ''}
                        onChange={(e) => updateOption('filename', e.target.value)}
                        className="w-full bg-slate-900/50 border border-slate-700 text-slate-200 text-sm rounded-lg p-2.5 focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all placeholder:text-slate-600"
                        placeholder="audit-logs"
                    />
                    <div className="absolute right-3 top-2.5 text-xs text-slate-500 pointer-events-none">
                        {formatOptions.find(f => f.value === selectedFormat)?.extension}
                    </div>
                </div>
                </div>

                {/* Max Records */}
                <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase">
                    最大记录数
                </label>
                <input
                    type="number"
                    min="1"
                    max="50000"
                    value={exportOptions.maxRecords || ''}
                    onChange={(e) => updateOption('maxRecords', Number(e.target.value))}
                    className="w-full bg-slate-900/50 border border-slate-700 text-slate-200 text-sm rounded-lg p-2.5 focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                    预估大小: {formatFileSize(exportOptions.maxRecords || 0)}
                </p>
                </div>

                {/* Date Format */}
                <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase">
                    日期格式
                </label>
                <select
                    value={exportOptions.dateFormat}
                    onChange={(e) => updateOption('dateFormat', e.target.value as any)}
                    className="w-full bg-slate-900/50 border border-slate-700 text-slate-200 text-sm rounded-lg p-2.5 focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all"
                >
                    {dateFormatOptions.map((option) => (
                    <option key={option.value} value={option.value} className="bg-slate-900 text-slate-200">
                        {option.label}
                    </option>
                    ))}
                </select>
                </div>
            </div>

            {/* Checkboxes */}
            <div className="flex flex-col gap-3 pt-2">
              <label className="flex items-center cursor-pointer group">
                <input
                  type="checkbox"
                  checked={exportOptions.includeHeaders}
                  onChange={(e) => updateOption('includeHeaders', e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-offset-slate-900 focus:ring-cyan-500"
                />
                <span className="ml-2 text-sm text-slate-400 group-hover:text-slate-200 transition-colors">包含列标题</span>
              </label>

              <label className="flex items-center cursor-pointer group">
                <input
                  type="checkbox"
                  checked={exportOptions.includeFilters}
                  onChange={(e) => updateOption('includeFilters', e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-offset-slate-900 focus:ring-cyan-500"
                />
                <span className="ml-2 text-sm text-slate-400 group-hover:text-slate-200 transition-colors">
                  包含筛选条件元数据 ({getActiveFilterCount()} 个生效中)
                </span>
              </label>
            </div>
          </div>

          {/* Export Progress */}
          {exportProgress.status !== 'idle' && (
            <div className="bg-slate-900/80 border border-slate-700 rounded-lg p-4 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-center space-x-3">
                {exportProgress.status === 'success' ? (
                  <CheckCircle className="h-5 w-5 text-emerald-400" />
                ) : exportProgress.status === 'error' ? (
                  <AlertCircle className="h-5 w-5 text-red-400" />
                ) : (
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-slate-600 border-t-cyan-500" />
                )}
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-200">
                    {exportProgress.message}
                  </div>
                  {exportProgress.filename && (
                    <div className="text-xs text-slate-500">
                      文件: {exportProgress.filename}
                    </div>
                  )}
                </div>
              </div>
              
              {exportProgress.status === 'preparing' || exportProgress.status === 'exporting' ? (
                <div className="mt-3">
                  <div className="bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-cyan-500 h-full rounded-full transition-all duration-300 ease-out shadow-[0_0_10px_rgba(6,182,212,0.5)]"
                      style={{ width: `${exportProgress.progress}%` }}
                    />
                  </div>
                  <div className="text-xs text-cyan-400 mt-1 text-right">
                    {exportProgress.progress}%
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-slate-700/50 bg-slate-900/50 mt-auto">
          <div className="text-xs text-slate-500 hidden sm:block">
            将导出约 {Math.min(exportOptions.maxRecords || 0, logs.length)} 条记录
          </div>
          <div className="flex space-x-3 w-full sm:w-auto justify-end">
            <button
              onClick={onClose}
              disabled={exportProgress.status === 'exporting'}
              className="px-4 py-2 border border-slate-700 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-50 transition-colors"
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
              className="px-6 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg text-sm font-medium shadow-md shadow-cyan-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {exportProgress.status === 'exporting' ? '正在导出...' : '开始导出'}
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
