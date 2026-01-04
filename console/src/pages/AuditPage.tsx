import { useState, useCallback, useMemo } from 'react';
import { Search, Filter, RefreshCw, Calendar, Download, ChevronDown, X, SlidersHorizontal, ArrowUpDown } from 'lucide-react';
import { useAuditLogs } from '../hooks/useApi';
import { AuditLog, AuditFilters } from '../types/api';
import { AuditLogCard } from '../components/AuditLogCard';
import { AuditLogDetailsModal } from '../components/AuditLogDetailsModal';
import { AuditExport, ExportFormat, ExportOptions } from '../components/AuditExport';
import { AuditLogFormatter } from '../lib/audit-formatter';

export function AuditPage() {
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  
  // Enhanced filter state
  const [filters, setFilters] = useState<AuditFilters>({
    limit: 50,
    offset: 0,
  });
  
  // Sorting state
  const [sortBy, setSortBy] = useState<'timestamp' | 'action_type' | 'device_id'>('timestamp');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Build complete filters with pagination and sorting
  const completeFilters: AuditFilters = useMemo(() => ({
    ...filters,
    ...(searchTerm && { search: searchTerm }),
    limit: pageSize,
    offset: (currentPage - 1) * pageSize,
  }), [filters, searchTerm, currentPage, pageSize]);

  const { data: auditData, isLoading, error, refetch } = useAuditLogs(completeFilters);
  const logs = auditData?.logs || [];
  const totalLogs = auditData?.total || 0;
  const totalPages = Math.ceil(totalLogs / pageSize);

  // Sort logs client-side (in addition to server-side filtering)
  const sortedLogs = useMemo(() => {
    const sorted = [...logs].sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (sortBy) {
        case 'timestamp':
          aValue = a.timestamp;
          bValue = b.timestamp;
          break;
        case 'action_type':
          aValue = a.action_type;
          bValue = b.action_type;
          break;
        case 'device_id':
          aValue = a.device_id;
          bValue = b.device_id;
          break;
        default:
          return 0;
      }
      
      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    
    return sorted;
  }, [logs, sortBy, sortOrder]);

  // Filter update handlers
  const updateFilter = useCallback((key: keyof AuditFilters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value || undefined
    }));
    setCurrentPage(1); // Reset to first page when filters change
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({ limit: pageSize, offset: 0 });
    setSearchTerm('');
    setCurrentPage(1);
  }, [pageSize]);

  const handleSort = useCallback((field: typeof sortBy) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  }, [sortBy]);

  // Pagination handlers
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  }, []);

  // Filter logs based on search term
  const filteredLogs = sortedLogs.filter(log => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      log.device_id.toLowerCase().includes(searchLower) ||
      log.action_type.toLowerCase().includes(searchLower) ||
      (log.session_id && log.session_id.toLowerCase().includes(searchLower)) ||
      (log.action_data && log.action_data.toLowerCase().includes(searchLower))
    );
  });

  // Calculate statistics
  const stats = {
    total: totalLogs,
    success: logs.filter(l => l.result === 'success' || (!l.result && l.action_type === 'device_heartbeat')).length,
    error: logs.filter(l => l.result === 'error' || l.result === 'failed').length,
    today: logs.filter(l => {
      const logDate = new Date(l.timestamp * 1000);
      const today = new Date();
      return logDate.toDateString() === today.toDateString();
    }).length,
  };

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

  const pageSizeOptions = [25, 50, 100, 200];

  const handleExport = useCallback(async (format: ExportFormat, options: ExportOptions) => {
    try {
      let content: string | Blob;
      const filename = AuditLogFormatter.generateFilename(
        options.filename || 'audit-logs',
        format
      );

      switch (format) {
        case 'csv':
          content = AuditLogFormatter.exportToCsv(sortedLogs, options);
          break;
        case 'json':
          content = AuditLogFormatter.exportToJson(sortedLogs, options, completeFilters);
          break;
        case 'xlsx':
          // For XLSX, we would need to use a library like xlsx or exceljs
          // For now, fall back to CSV
          content = AuditLogFormatter.exportToCsv(sortedLogs, options);
          break;
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }

      const mimeType = AuditLogFormatter.getMimeType(format);
      AuditLogFormatter.downloadFile(content, filename, mimeType);
      
    } catch (error) {
      console.error('Export failed:', error);
      throw error;
    }
  }, [sortedLogs, completeFilters]);

  // Get active filter count for display
  const activeFilterCount = Object.keys(filters).filter(key => 
    key !== 'limit' && key !== 'offset' && filters[key as keyof AuditFilters]
  ).length + (searchTerm ? 1 : 0);

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">审计日志</h1>
            <p className="mt-1 text-sm text-gray-600">
              查看系统操作记录和安全审计
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={`inline-flex items-center px-3 py-2 border text-sm leading-4 font-medium rounded-md ${
                showAdvancedFilters || activeFilterCount > 0
                  ? 'border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100'
                  : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
              }`}
            >
              <SlidersHorizontal className="h-4 w-4 mr-2" />
              高级筛选
              {activeFilterCount > 0 && (
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {activeFilterCount}
                </span>
              )}
            </button>
            <button
              onClick={() => refetch()}
              disabled={isLoading}
              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              刷新
            </button>
            <button
              onClick={() => setShowExportDialog(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
            >
              <Download className="h-4 w-4 mr-2" />
              导出日志
            </button>
          </div>
        </div>

        {/* Statistics */}
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-4">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                    <span className="text-sm font-medium text-gray-600">{stats.total}</span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      总日志数
                    </dt>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <span className="text-sm font-medium text-green-600">{stats.success}</span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      成功操作
                    </dt>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                    <span className="text-sm font-medium text-red-600">{stats.error}</span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      失败操作
                    </dt>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-sm font-medium text-blue-600">{stats.today}</span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      今日操作
                    </dt>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Filters */}
      <div className="mb-6 bg-white rounded-lg shadow">
        {/* Basic Search Bar */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center space-x-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="搜索设备ID、操作类型、会话ID或操作数据..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
            </div>
            {(activeFilterCount > 0 || searchTerm) && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                <X className="h-4 w-4 mr-1" />
                清除筛选
              </button>
            )}
          </div>
        </div>

        {/* Advanced Filters */}
        {showAdvancedFilters && (
          <div className="p-4 bg-gray-50 border-b border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">操作类型</label>
                <div className="relative">
                  <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <select
                    value={filters.action_type || ''}
                    onChange={(e) => updateFilter('action_type', e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  >
                    {actionTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

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

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">每页显示</label>
                <select
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  {pageSizeOptions.map((size) => (
                    <option key={size} value={size}>
                      {size} 条
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
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
        )}

        {/* Sort Controls */}
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-500">排序方式:</span>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleSort('timestamp')}
                className={`inline-flex items-center px-3 py-1 rounded-md text-sm font-medium ${
                  sortBy === 'timestamp'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                时间
                {sortBy === 'timestamp' && (
                  <ArrowUpDown className={`ml-1 h-3 w-3 ${sortOrder === 'desc' ? 'rotate-180' : ''}`} />
                )}
              </button>
              <button
                onClick={() => handleSort('action_type')}
                className={`inline-flex items-center px-3 py-1 rounded-md text-sm font-medium ${
                  sortBy === 'action_type'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                操作类型
                {sortBy === 'action_type' && (
                  <ArrowUpDown className={`ml-1 h-3 w-3 ${sortOrder === 'desc' ? 'rotate-180' : ''}`} />
                )}
              </button>
              <button
                onClick={() => handleSort('device_id')}
                className={`inline-flex items-center px-3 py-1 rounded-md text-sm font-medium ${
                  sortBy === 'device_id'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                设备
                {sortBy === 'device_id' && (
                  <ArrowUpDown className={`ml-1 h-3 w-3 ${sortOrder === 'desc' ? 'rotate-180' : ''}`} />
                )}
              </button>
            </div>
          </div>
          
          <div className="text-sm text-gray-500">
            显示 {Math.min((currentPage - 1) * pageSize + 1, totalLogs)} - {Math.min(currentPage * pageSize, totalLogs)} 条，共 {totalLogs} 条记录
          </div>
        </div>
      </div>

      {/* Audit Logs */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-sm text-gray-500">加载审计日志...</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-sm text-red-600">
              加载审计日志失败: {(error as any)?.message || '未知错误'}
            </p>
            <button
              onClick={() => refetch()}
              className="mt-2 text-sm text-blue-600 hover:text-blue-800"
            >
              重试
            </button>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-sm text-gray-500">
              {logs.length === 0 ? '暂无审计日志' : '没有找到匹配的日志'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredLogs.map((log) => (
              <AuditLogCard
                key={log.id}
                log={log}
                onSelect={setSelectedLog}
              />
            ))}
            
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6 rounded-lg shadow">
                <div className="flex-1 flex justify-between sm:hidden">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    上一页
                  </button>
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    下一页
                  </button>
                </div>
                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-gray-700">
                      显示第 <span className="font-medium">{(currentPage - 1) * pageSize + 1}</span> 到{' '}
                      <span className="font-medium">{Math.min(currentPage * pageSize, totalLogs)}</span> 条记录，
                      共 <span className="font-medium">{totalLogs}</span> 条
                    </p>
                  </div>
                  <div>
                    <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                      <button
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="sr-only">上一页</span>
                        <ChevronDown className="h-5 w-5 rotate-90" />
                      </button>
                      
                      {/* Page numbers */}
                      {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                        let pageNum;
                        if (totalPages <= 7) {
                          pageNum = i + 1;
                        } else if (currentPage <= 4) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 3) {
                          pageNum = totalPages - 6 + i;
                        } else {
                          pageNum = currentPage - 3 + i;
                        }
                        
                        return (
                          <button
                            key={pageNum}
                            onClick={() => handlePageChange(pageNum)}
                            className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                              currentPage === pageNum
                                ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                                : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                      
                      <button
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="sr-only">下一页</span>
                        <ChevronDown className="h-5 w-5 -rotate-90" />
                      </button>
                    </nav>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Details Modal */}
      <AuditLogDetailsModal
        log={selectedLog}
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
      />

      {/* Export Dialog */}
      <AuditExport
        filters={completeFilters}
        logs={sortedLogs}
        totalCount={totalLogs}
        onExport={handleExport}
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
      />
    </div>
  );
}