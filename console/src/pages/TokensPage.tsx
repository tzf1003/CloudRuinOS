import { useState } from 'react';
import { Plus, Search, RefreshCw, AlertCircle, Key, Filter, CheckCircle, XCircle, Clock } from 'lucide-react';
import { useEnrollmentTokens, useDeleteEnrollmentToken, useGenerateEnrollmentToken, useUpdateEnrollmentToken } from '../hooks/useApi';
import { EnrollmentToken } from '../types/api';
import { CreateTokenDialog } from '../components/CreateTokenDialog';
import { EditTokenDialog } from '../components/EditTokenDialog';
import { TokenCard } from '../components/TokenCard';
import { Card } from '../components/ui/Card';
import { cn } from '../lib/utils';
import clsx from 'clsx';

export function TokensPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingToken, setEditingToken] = useState<EnrollmentToken | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: tokensData, isLoading, isError, refetch } = useEnrollmentTokens({
    status: statusFilter === 'all' ? undefined : statusFilter as any,
    search: searchTerm || undefined,
  });

  const generateTokenMutation = useGenerateEnrollmentToken();
  const updateTokenMutation = useUpdateEnrollmentToken();
  const deleteTokenMutation = useDeleteEnrollmentToken();

  const handleCreateToken = async (data: Partial<EnrollmentToken> & { isPermanent?: boolean }) => {
    try {
      const expiresIn = data.isPermanent ? 'never' : 
                        data.expiresAt ? Math.ceil((data.expiresAt - Date.now()) / 1000) : undefined;
      
      await generateTokenMutation.mutateAsync({
        description: data.description,
        maxUsage: data.maxUsage,
        expiresIn
      });
      setShowCreateDialog(false);
      refetch();
    } catch (err) {
      console.error('Failed to create token:', err);
    }
  };

  const handleUpdateToken = async (id: number, updates: Partial<EnrollmentToken>) => {
    try {
      await updateTokenMutation.mutateAsync({ id, data: updates });
      setEditingToken(null);
      refetch();
    } catch (err) {
      console.error('Failed to update token:', err);
    }
  };

  const tokens = tokensData?.tokens || [];

  // Filter tokens based on search and status
  const filteredTokens = tokens.filter(token => {
    const matchesSearch = !searchTerm || 
      token.token.toLowerCase().includes(searchTerm.toLowerCase()) ||
      token.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      token.createdBy.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  // Calculate statistics
  const stats = {
    total: tokens.length,
    active: tokens.filter(t => t.status === 'active').length,
    expired: tokens.filter(t => t.status === 'expired').length,
    used: tokens.filter(t => t.status === 'used').length,
    disabled: tokens.filter(t => t.status === 'disabled').length,
  };

  const handleDeleteToken = async (token: EnrollmentToken) => {
    if (window.confirm(`确定要删除令牌 "${token.description || token.token.substring(0, 8)}..." 吗？`)) {
      try {
        await deleteTokenMutation.mutateAsync(token.id);
      } catch (error) {
        console.error('Failed to delete token:', error);
      }
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
       // Ideally trigger a toast notification here
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-4 w-4 text-emerald-500" />;
      case 'expired':
        return <Clock className="h-4 w-4 text-orange-500" />;
      case 'used':
        return <CheckCircle className="h-4 w-4 text-blue-500" />;
      case 'disabled':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-slate-500" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return '活动';
      case 'expired': return '已过期';
      case 'used': return '已使用';
      case 'disabled': return '已禁用';
      default: return '未知';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'expired': return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
      case 'used': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'disabled': return 'bg-red-500/10 text-red-400 border-red-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  return (
    <div className="space-y-6">
       {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-cyan-500 bg-clip-text text-transparent flex items-center gap-3">
            <Key className="h-8 w-8 text-purple-500" />
            令牌管理
          </h1>
           <p className="text-slate-400 mt-1 flex items-center gap-2 text-sm">
            设备配置的安全注册令牌
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
             <button
              onClick={() => refetch()}
              disabled={isLoading}
               className="p-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 hover:text-cyan-400 hover:border-cyan-500/50 transition-all disabled:opacity-50"
            >
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            </button>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="flex-1 md:flex-none px-4 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-lg font-medium shadow-lg shadow-purple-900/20 transition-all flex items-center justify-center gap-2"
            >
              <Plus className="h-4 w-4" />
              生成令牌
            </button>
        </div>
      </div>

       {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
           {[
            { label: '总计', val: stats.total, color: 'text-slate-200' },
            { label: '活动', val: stats.active, color: 'text-emerald-400' },
            { label: '已使用', val: stats.used, color: 'text-blue-400' },
            { label: '已过期', val: stats.expired, color: 'text-orange-400' },
            { label: '已禁用', val: stats.disabled, color: 'text-red-400' },
           ].map((stat, i) => (
               <Card key={i} variant="glass" className="p-4 flex flex-col items-center justify-center bg-slate-900/40 border-slate-800">
                   <div className={cn("text-2xl font-bold mb-1", stat.color)}>{stat.val}</div>
                   <div className="text-xs uppercase font-semibold text-slate-500">{stat.label}</div>
               </Card>
           ))}
      </div>

       {/* Toolbar */}
      <Card variant="glass" className="p-4">
        <div className="flex flex-col md:flex-row gap-4 items-center">
             <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="搜索令牌、描述..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-950/50 border border-slate-700/50 text-slate-200 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
                <Filter className="h-4 w-4 text-slate-500" />
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="flex-1 bg-slate-950/50 border border-slate-700/50 text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                    <option value="all">所有状态</option>
                    <option value="active">活动</option>
                    <option value="used">已使用</option>
                    <option value="expired">已过期</option>
                    <option value="disabled">已禁用</option>
                </select>
            </div>
        </div>
      </Card>

      {/* Main Content */}
      <div className="space-y-4">
        {isError && (
            <div className="p-4 bg-red-950/20 border border-red-500/30 rounded-lg flex gap-3 text-red-200">
                 <AlertCircle className="h-5 w-5 text-red-500" />
                 <div>
                     <p className="font-bold">加载令牌失败</p>
                     <p className="text-sm opacity-80">请检查您的连接并重试。</p>
                 </div>
            </div>
        )}

        {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <RefreshCw className="h-10 w-10 text-purple-500 animate-spin mb-4" />
              <p className="text-slate-400">加载令牌中...</p>
            </div>
        ) : filteredTokens.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <Key className="h-16 w-16 mb-4 opacity-20" />
                <p className="text-lg font-medium">未找到令牌</p>
                <p className="text-sm opacity-60 mt-1">
                    {searchTerm || statusFilter !== 'all' ? '尝试更改您的筛选条件' : '生成您的首个注册令牌'}
                </p>
             </div>
        ) : (
            <div className="grid grid-cols-1 gap-4">
                {filteredTokens.map((token) => (
                    <TokenCard
                        key={token.id}
                        token={token}
                        onEdit={() => setEditingToken(token)}
                        onDelete={() => handleDeleteToken(token)}
                        onCopy={copyToClipboard}
                        getStatusIcon={getStatusIcon}
                        getStatusText={getStatusText}
                        getStatusColor={getStatusColor}
                    />
                ))}
            </div>
        )}
      </div>

      {showCreateDialog && (
        <CreateTokenDialog
          onClose={() => setShowCreateDialog(false)}
          onConfirm={handleCreateToken as any}
          isCreating={generateTokenMutation.isPending}
        />
      )}

      {editingToken && (
        <EditTokenDialog
          token={editingToken}
          onClose={() => setEditingToken(null)}
          onConfirm={handleUpdateToken}
          isUpdating={updateTokenMutation.isPending}
        />
      )}
    </div>
  );
}
