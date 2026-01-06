import { Edit, Trash2, Copy, Clock, User, Calendar, Hash, CheckCircle, Smartphone } from 'lucide-react';
import { EnrollmentToken } from '../types/api';
import { Card } from './ui/Card';
import { cn } from '../lib/utils';

interface TokenCardProps {
  token: EnrollmentToken;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: (text: string) => void;
  getStatusIcon: (status: string) => React.ReactNode;
  getStatusText: (status: string) => string;
  getStatusColor: (status: string) => string;
}

export function TokenCard({
  token,
  onEdit,
  onDelete,
  onCopy,
  getStatusIcon,
  getStatusText,
  getStatusColor,
}: TokenCardProps) {
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN');
  };

  const formatRelativeTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `${days}天前`;
    if (hours > 0) return `${hours}小时前`;
    if (minutes > 0) return `${minutes}分钟前`;
    return '刚刚';
  };

  const getExpiryInfo = () => {
    if (token.isPermanent) {
      return { text: '永不过期', color: 'text-blue-400' };
    }

    if (!token.expiresAt) {
      return { text: '无过期时间', color: 'text-slate-500' };
    }

    const now = Date.now();
    if (now > token.expiresAt) {
      return { text: `已过期 ${formatDate(token.expiresAt)}`, color: 'text-red-400' };
    }

    const timeLeft = token.expiresAt - now;
    const hoursLeft = Math.floor(timeLeft / 3600000);
    const daysLeft = Math.floor(timeLeft / 86400000);

    if (daysLeft > 0) {
      return { text: `${daysLeft} 天后过期`, color: 'text-emerald-400' };
    } else if (hoursLeft > 0) {
      return { text: `${hoursLeft} 小时后过期`, color: 'text-orange-400' };
    } else {
      const minutesLeft = Math.floor(timeLeft / 60000);
      return { text: `${minutesLeft} 分钟后过期`, color: 'text-red-400' };
    }
  };

  const expiryInfo = getExpiryInfo();
  const statusColor = getStatusColor(token.status);

  return (
    <Card variant="glass" className="group hover:border-slate-600 transition-all p-0 overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-4">
            <div className={cn("p-2 rounded-lg mt-1", statusColor.split(' ')[0])}>
              {getStatusIcon(token.status)}
            </div>

            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-bold text-slate-200 truncate">
                  {token.description || '无描述'}
                </span>
                <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase border", getStatusColor(token.status))}>
                   {getStatusText(token.status)}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-500">
                <div className="flex items-center group/copy relative cursor-pointer" onClick={() => onCopy(token.token)}>
                  <Hash className="h-3.5 w-3.5 mr-1.5 text-slate-600" />
                  <span className="font-mono text-slate-400 group-hover/copy:text-cyan-400 transition-colors">{token.token.substring(0, 16)}...</span>
                  <Copy className="h-3 w-3 ml-2 opacity-0 group-hover/copy:opacity-100 transition-all text-cyan-400" />
                </div>

                <div className="flex items-center">
                  <User className="h-3.5 w-3.5 mr-1.5 text-slate-600" />
                  <span>{token.createdBy}</span>
                </div>

                <div className="flex items-center">
                  <Calendar className="h-3.5 w-3.5 mr-1.5 text-slate-600" />
                  <span>{formatRelativeTime(token.createdAt)}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <div className={cn("flex items-center font-medium", expiryInfo.color)}>
                  <Clock className="h-3.5 w-3.5 mr-1.5" />
                  <span>{expiryInfo.text}</span>
                </div>

                <div className="flex items-center text-slate-400">
                   <div className="h-1.5 w-24 bg-slate-800 rounded-full mr-2 overflow-hidden">
                      <div className="h-full bg-cyan-500" style={{ width: `${Math.min((token.usageCount / token.maxUsage) * 100, 100)}%` }} />
                   </div>
                   <span>{token.usageCount} / {token.maxUsage} 次使用</span>
                </div>
              </div>

              {token.usedAt && token.usedByDevice && (
                <div className="flex items-center text-xs text-blue-400 mt-1 bg-blue-900/20 px-2 py-1 rounded w-fit border border-blue-900/50">
                  <Smartphone className="h-3 w-3 mr-2" />
                  <span>上次使用: <span className="font-mono text-blue-300">{token.usedByDevice}</span> 于 {formatDate(token.usedAt)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t sm:border-t-0 p-2 sm:p-0 border-slate-800 justify-end">
          <button
            onClick={onEdit}
            className="p-2 text-slate-400 hover:text-cyan-400 hover:bg-cyan-950/30 rounded-lg transition-colors"
            title="编辑令牌"
          >
            <Edit className="h-4 w-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-950/30 rounded-lg transition-colors"
            title="删除令牌"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Card>
  );
}
