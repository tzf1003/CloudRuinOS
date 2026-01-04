import { Edit, Trash2, Copy, Clock, User, Calendar, Hash } from 'lucide-react';
import { EnrollmentToken } from '../types/api';

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
      return { text: '永不过期', color: 'text-blue-600' };
    }
    
    if (!token.expiresAt) {
      return { text: '无过期时间', color: 'text-gray-500' };
    }

    const now = Date.now();
    if (now > token.expiresAt) {
      return { text: `已过期 (${formatDate(token.expiresAt)})`, color: 'text-red-600' };
    }

    const timeLeft = token.expiresAt - now;
    const hoursLeft = Math.floor(timeLeft / 3600000);
    const daysLeft = Math.floor(timeLeft / 86400000);

    if (daysLeft > 0) {
      return { text: `${daysLeft}天后过期`, color: 'text-green-600' };
    } else if (hoursLeft > 0) {
      return { text: `${hoursLeft}小时后过期`, color: 'text-orange-600' };
    } else {
      const minutesLeft = Math.floor(timeLeft / 60000);
      return { text: `${minutesLeft}分钟后过期`, color: 'text-red-600' };
    }
  };

  const expiryInfo = getExpiryInfo();

  return (
    <div className="px-4 py-4 hover:bg-gray-50">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              {getStatusIcon(token.status)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {token.description || '无描述'}
                </p>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(token.status)}`}>
                  {getStatusText(token.status)}
                </span>
              </div>
              
              <div className="mt-1 flex items-center space-x-4 text-sm text-gray-500">
                <div className="flex items-center">
                  <Hash className="h-4 w-4 mr-1" />
                  <span className="font-mono">{token.token.substring(0, 16)}...</span>
                  <button
                    onClick={() => onCopy(token.token)}
                    className="ml-1 text-gray-400 hover:text-gray-600"
                    title="复制完整令牌"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
                
                <div className="flex items-center">
                  <User className="h-4 w-4 mr-1" />
                  <span>{token.createdBy}</span>
                </div>
                
                <div className="flex items-center">
                  <Calendar className="h-4 w-4 mr-1" />
                  <span>{formatRelativeTime(token.createdAt)}</span>
                </div>
              </div>
              
              <div className="mt-1 flex items-center space-x-4 text-sm">
                <div className={`flex items-center ${expiryInfo.color}`}>
                  <Clock className="h-4 w-4 mr-1" />
                  <span>{expiryInfo.text}</span>
                </div>
                
                <div className="text-gray-500">
                  使用次数: {token.usageCount}/{token.maxUsage}
                </div>
              </div>

              {token.usedAt && token.usedByDevice && (
                <div className="mt-1 text-sm text-gray-500">
                  <span>已被设备 {token.usedByDevice} 于 {formatDate(token.usedAt)} 使用</span>
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-2 ml-4">
          <button
            onClick={onEdit}
            className="text-gray-400 hover:text-blue-600"
            title="编辑令牌"
          >
            <Edit className="h-4 w-4" />
          </button>
          <button
            onClick={onDelete}
            className="text-gray-400 hover:text-red-600"
            title="删除令牌"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}