import React from 'react';
import { Loader2, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { useGlobalLoading, useOperations } from '../contexts/UIContext';

// 全局加载遮罩
export function GlobalLoadingOverlay() {
  const { isLoading, message } = useGlobalLoading();

  if (!isLoading) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-sm mx-4 shadow-xl">
        <div className="flex items-center space-x-3">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          <div>
            <div className="text-sm font-medium text-gray-900">
              正在加载...
            </div>
            {message && (
              <div className="text-xs text-gray-500 mt-1">
                {message}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// 内联加载指示器
interface InlineLoadingProps {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
  className?: string;
}

export function InlineLoading({ size = 'md', message, className }: InlineLoadingProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  };

  return (
    <div className={clsx('flex items-center space-x-2', className)}>
      <Loader2 className={clsx('animate-spin text-blue-600', sizeClasses[size])} />
      {message && (
        <span className="text-sm text-gray-600">{message}</span>
      )}
    </div>
  );
}

// 按钮加载状态
interface LoadingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
  children: React.ReactNode;
}

export function LoadingButton({ 
  loading = false, 
  loadingText, 
  children, 
  disabled,
  className,
  ...props 
}: LoadingButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md',
        'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500',
        loading || disabled
          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
          : 'bg-blue-600 text-white hover:bg-blue-700',
        className
      )}
    >
      {loading && (
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
      )}
      {loading ? (loadingText || '处理中...') : children}
    </button>
  );
}

// 操作进度指示器
export function OperationProgress() {
  const { operations } = useOperations();
  
  if (operations.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 space-y-2 z-40">
      {operations.map((operation) => (
        <OperationProgressCard key={operation.id} operation={operation} />
      ))}
    </div>
  );
}

interface OperationProgressCardProps {
  operation: {
    id: string;
    type: 'upload' | 'download' | 'api' | 'websocket';
    status: 'pending' | 'progress' | 'success' | 'error';
    progress: number;
    message?: string;
    error?: string;
  };
}

function OperationProgressCard({ operation }: OperationProgressCardProps) {
  const { removeOperation } = useOperations();

  const getIcon = () => {
    switch (operation.status) {
      case 'pending':
      case 'progress':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-600" />;
    }
  };

  const getTypeLabel = () => {
    switch (operation.type) {
      case 'upload':
        return '上传';
      case 'download':
        return '下载';
      case 'api':
        return 'API请求';
      case 'websocket':
        return 'WebSocket';
      default:
        return '操作';
    }
  };

  const getBgColor = () => {
    switch (operation.status) {
      case 'success':
        return 'bg-green-50 border-green-200';
      case 'error':
        return 'bg-red-50 border-red-200';
      default:
        return 'bg-white border-gray-200';
    }
  };

  // 自动移除成功或错误的操作（3秒后）
  React.useEffect(() => {
    if (operation.status === 'success' || operation.status === 'error') {
      const timer = setTimeout(() => {
        removeOperation(operation.id);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [operation.status, operation.id, removeOperation]);

  return (
    <div className={clsx(
      'bg-white border rounded-lg shadow-lg p-4 min-w-80 max-w-sm',
      getBgColor()
    )}>
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          {getIcon()}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-900">
              {getTypeLabel()}
            </p>
            {operation.status === 'progress' && (
              <span className="text-xs text-gray-500">
                {operation.progress}%
              </span>
            )}
          </div>
          
          {operation.message && (
            <p className="text-xs text-gray-600 mt-1 truncate">
              {operation.message}
            </p>
          )}
          
          {operation.error && (
            <p className="text-xs text-red-600 mt-1">
              {operation.error}
            </p>
          )}
          
          {operation.status === 'progress' && (
            <div className="mt-2">
              <div className="bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${operation.progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
        
        {(operation.status === 'success' || operation.status === 'error') && (
          <button
            onClick={() => removeOperation(operation.id)}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600"
          >
            <XCircle className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// 页面级加载状态
interface PageLoadingProps {
  message?: string;
}

export function PageLoading({ message = '正在加载页面...' }: PageLoadingProps) {
  return (
    <div className="flex items-center justify-center min-h-96">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
        <p className="mt-2 text-sm text-gray-600">{message}</p>
      </div>
    </div>
  );
}

// 骨架屏加载
export function SkeletonLoader() {
  return (
    <div className="animate-pulse">
      <div className="space-y-4">
        <div className="h-4 bg-gray-200 rounded w-3/4"></div>
        <div className="space-y-2">
          <div className="h-4 bg-gray-200 rounded"></div>
          <div className="h-4 bg-gray-200 rounded w-5/6"></div>
        </div>
        <div className="h-4 bg-gray-200 rounded w-1/2"></div>
      </div>
    </div>
  );
}

// 表格骨架屏
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="animate-pulse">
      <div className="space-y-3">
        {/* 表头 */}
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {Array.from({ length: cols }).map((_, i) => (
            <div key={i} className="h-4 bg-gray-300 rounded"></div>
          ))}
        </div>
        
        {/* 表格行 */}
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {Array.from({ length: cols }).map((_, colIndex) => (
              <div key={colIndex} className="h-4 bg-gray-200 rounded"></div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}