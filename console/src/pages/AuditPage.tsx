import { useState, useCallback, useMemo } from 'react';
import { Search, Filter, RefreshCw, Download, ChevronDown, ArrowUpDown, History } from 'lucide-react';
import { useAuditLogs } from '../hooks/useApi';
import { AuditLog, AuditFilters } from '../types/api';
import { AuditLogCard } from '../components/AuditLogCard';
import { AuditLogDetailsModal } from '../components/AuditLogDetailsModal';
import { AuditStatsChart } from '../components/AuditStatsChart';
import { Card } from '../components/ui/Card';
import { cn } from '../lib/utils';
import { AuditExport, ExportFormat, ExportOptions } from '../components/AuditExport';

export function AuditPage() {
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showExportDialog, setShowExportDialog] = useState(false);
  
  const [filters, setFilters] = useState<AuditFilters>({
    limit: 50,
    offset: 0,
  });
  
  // Sorting state - mostly client-side simulation for now unless API supports it
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const completeFilters: AuditFilters = useMemo(() => ({
    ...filters,
    ...(searchTerm && { search: searchTerm }),
    limit: pageSize,
    offset: (currentPage - 1) * pageSize,
  }), [filters, searchTerm, currentPage, pageSize]);

  const { data: auditData, isLoading, refetch } = useAuditLogs(completeFilters);
  const logs = auditData?.logs || [];
  const totalLogs = auditData?.total || 0;
  const totalPages = Math.ceil(totalLogs / pageSize);

  const sortedLogs = useMemo(() => {
    return [...logs].sort((a, b) => { 
        return sortOrder === 'desc' 
            ? b.timestamp - a.timestamp 
            : a.timestamp - b.timestamp;
    });
  }, [logs, sortOrder]);

  const updateFilter = useCallback((key: keyof AuditFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value || undefined }));
    setCurrentPage(1);
  }, []);

  const handleExport = async (format: ExportFormat, options: ExportOptions) => {
      // Simulation of export - in a real app this would call an API endpoint
      // that streams the file based on filters
      console.log('Exporting with options:', { format, options, filters: completeFilters });
      
      return new Promise<void>((resolve) => {
          setTimeout(() => {
              // Creating a fake download for demonstration if we have logs locally
              if (logs.length > 0) {
                  const dataToExport = logs;
                  let content = '';
                  let mimeType = '';

                  if (format === 'json') {
                      content = JSON.stringify(dataToExport, null, 2);
                      mimeType = 'application/json';
                  } else if (format === 'csv') {
                      const headers = Object.keys(dataToExport[0]).join(',');
                      const rows = dataToExport.map(log => Object.values(log).join(','));
                      content = [headers, ...rows].join('\n');
                      mimeType = 'text/csv';
                  }

                  if (content) {
                      const blob = new Blob([content], { type: mimeType });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${options.filename || 'export'}.${format}`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                  }
              }
              resolve();
          }, 1500);
      });
  };

  return (
    <div className="space-y-6 flex flex-col h-[calc(100vh-100px)]">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">审计日志</h1>
          <p className="text-sm text-slate-400 mt-1">系统活动和安全事件</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => refetch()}
            className="inline-flex items-center px-3 py-2 rounded-lg border border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800 hover:text-white transition-all shadow-sm group"
          >
            <RefreshCw className={cn("h-4 w-4 mr-2 group-hover:rotate-180 transition-transform duration-500", isLoading && "animate-spin")} />
            刷新
          </button>

          <button
            onClick={() => setShowExportDialog(true)}
            className="inline-flex items-center px-3 py-2 rounded-lg bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all font-medium text-sm"
          >
            <Download className="h-4 w-4 mr-2" />
            导出数据
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 min-h-0">
          
          {/* Charts or Stats Sidebar */}
          <div className="lg:col-span-1 flex flex-col gap-6">
               <div className="h-64 flex-shrink-0">
                  <AuditStatsChart />
               </div>
               
               <Card variant="glass" className="flex-1 p-4 space-y-4 overflow-y-auto min-h-[300px]">
                    <div className="flex items-center gap-2 text-slate-200 border-b border-slate-700/50 pb-2">
                         <Filter className="w-4 h-4 text-cyan-400" />
                         <span className="font-semibold text-sm">筛选器</span>
                    </div>

                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                        <input
                            type="text"
                            placeholder="搜索日志..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 placeholder:text-slate-600"
                        />
                    </div>

                    <div className="space-y-4 pt-2">
                         <div>
                             <label className="text-xs font-semibold text-slate-500 uppercase mb-2 block">操作类型</label>
                             <select
                                onChange={(e) => updateFilter('actionType', e.target.value)}
                                className="w-full bg-slate-900/50 border border-slate-700 text-slate-300 text-sm rounded-lg p-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
                             >
                                 <option value="" className="bg-slate-900 text-slate-400">所有操作</option>
                                 <option value="login" className="bg-slate-900">登录</option>
                                 <option value="logout" className="bg-slate-900">登出</option>
                                 <option value="command_execution" className="bg-slate-900">命令执行</option>
                                 <option value="file_operation" className="bg-slate-900">文件操作</option>
                                 <option value="security_event" className="bg-slate-900">安全事件</option>
                             </select>
                         </div>
                         <div>
                             <label className="text-xs font-semibold text-slate-500 uppercase mb-2 block">结果</label>
                              <div className="flex gap-2">
                                  {[
                                    { value: 'success', label: '成功' },
                                    { value: 'failed', label: '失败' }
                                  ].map(({ value, label }) => (
                                      <button
                                        key={value}
                                        onClick={() => updateFilter('result', filters.result === value ? undefined : value)}
                                        className={cn(
                                            "flex-1 py-1.5 px-3 rounded-md text-xs font-medium border transition-all uppercase",
                                            filters.result === value
                                                ? (value === 'success' ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-red-500/20 text-red-300 border-red-500/30")
                                                : "bg-slate-800/50 border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                                        )}
                                      >
                                          {label}
                                      </button>
                                  ))}
                              </div>
                         </div>
                    </div>

                    <div className="pt-4 mt-auto">
                        <button
                            onClick={() => {
                                setFilters({ limit: pageSize, offset: 0 });
                                setSearchTerm('');
                            }}
                            className="w-full py-2 text-xs text-slate-400 hover:text-white border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors"
                        >
                            重置筛选器
                        </button>
                    </div>
               </Card>
          </div>

          {/* Logs List */}
          <div className="lg:col-span-3 flex flex-col min-h-0 gap-4">
              <Card variant="glass" className="flex-1 overflow-hidden flex flex-col p-0 border-slate-800/60 shadow-xl">
                   {/* Table Header like bar */}
                   <div className="flex items-center justify-between p-3 bg-slate-900/80 border-b border-slate-800 backdrop-blur-md">
                        <div className="flex items-center gap-4 text-xs font-medium text-slate-500 px-2">
                            <span className="flex items-center gap-1 cursor-pointer hover:text-cyan-400 transition-colors" onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}>
                                时间戳
                                <ArrowUpDown className="w-3 h-3" />
                            </span>
                            <span className="bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700 text-slate-400">{totalLogs} 个事件</span>
                        </div>
                        <div className="flex items-center gap-2">
                             {/* Pagination Info */}
                             <span className="text-xs text-slate-500 mr-2">
                                 第 {currentPage} 页，共 {Math.max(1, totalPages)} 页
                             </span>
                             <div className="flex gap-1">
                                 <button 
                                    className="p-1 rounded hover:bg-slate-700 text-slate-400 disabled:opacity-30 transition-colors"
                                    disabled={currentPage === 1}
                                    onClick={() => setCurrentPage(p => p - 1)}
                                 >
                                     <ChevronDown className="w-4 h-4 rotate-90" />
                                 </button>
                                 <button 
                                    className="p-1 rounded hover:bg-slate-700 text-slate-400 disabled:opacity-30 transition-colors"
                                    disabled={currentPage >= totalPages}
                                    onClick={() => setCurrentPage(p => p + 1)}
                                 >
                                     <ChevronDown className="w-4 h-4 -rotate-90" />
                                 </button>
                             </div>
                        </div>
                   </div>

                   <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-950/30 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                       {isLoading ? (
                           <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
                               <div className="w-8 h-8 border-4 border-slate-800 border-t-cyan-500 rounded-full animate-spin" />
                               <span className="text-sm">加载日志中...</span>
                           </div>
                       ) : sortedLogs.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3 opacity-60">
                               <History className="w-12 h-12 mb-2 stroke-1" />
                               <span className="text-sm">未找到符合条件的事件</span>
                           </div>
                       ) : (
                           sortedLogs.map((log) => (
                               <AuditLogCard 
                                    key={log.id} 
                                    log={log} 
                                    onSelect={(l) => setSelectedLog(l)} 
                               />
                           ))
                       )}
                   </div>
              </Card>
          </div>
      </div>

      <AuditLogDetailsModal
        log={selectedLog}
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
      />

      <AuditExport
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        onExport={handleExport}
        filters={completeFilters}
        logs={logs}
        totalCount={totalLogs}
      />
    </div>
  );
}
