import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug, Copy, Check } from 'lucide-react';

/**
 * 错误边界 Props
 */
interface ErrorBoundaryProps {
  children: ReactNode;
  /** 自定义 fallback UI */
  fallback?: ReactNode;
  /** 错误回调 */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** 是否显示详细错误信息（开发模式） */
  showDetails?: boolean;
}

/**
 * 错误边界状态
 */
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

/**
 * 全局错误边界组件
 * 捕获子组件树中的 JavaScript 错误，记录错误并显示备用 UI
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    
    // 调用错误回调
    this.props.onError?.(error, errorInfo);
    
    // 记录错误到控制台
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // 可以在这里发送错误到监控服务
    this.reportError(error, errorInfo);
  }

  /**
   * 上报错误到监控服务
   */
  private reportError(error: Error, errorInfo: ErrorInfo): void {
    // TODO: 集成错误监控服务 (如 Sentry)
    const errorReport = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    };
    
    // 存储到 localStorage 以便后续查看
    try {
      const existingErrors = JSON.parse(localStorage.getItem('errorLogs') || '[]');
      existingErrors.push(errorReport);
      // 只保留最近 10 条错误
      if (existingErrors.length > 10) {
        existingErrors.shift();
      }
      localStorage.setItem('errorLogs', JSON.stringify(existingErrors));
    } catch {
      // 忽略存储错误
    }
  }

  /**
   * 重置错误状态
   */
  private handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
    });
  };

  /**
   * 刷新页面
   */
  private handleRefresh = (): void => {
    window.location.reload();
  };

  /**
   * 返回首页
   */
  private handleGoHome = (): void => {
    window.location.href = '/';
  };

  /**
   * 复制错误信息
   */
  private handleCopyError = async (): Promise<void> => {
    const { error, errorInfo } = this.state;
    const errorText = `
Error: ${error?.message}
Stack: ${error?.stack}
Component Stack: ${errorInfo?.componentStack}
Time: ${new Date().toISOString()}
URL: ${window.location.href}
    `.trim();

    try {
      await navigator.clipboard.writeText(errorText);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch {
      console.error('Failed to copy error');
    }
  };

  render(): ReactNode {
    const { hasError, error, errorInfo, copied } = this.state;
    const { children, fallback, showDetails = process.env.NODE_ENV === 'development' } = this.props;

    if (hasError) {
      // 如果提供了自定义 fallback，使用它
      if (fallback) {
        return fallback;
      }

      // 默认错误 UI
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="max-w-2xl w-full bg-white rounded-lg shadow-xl overflow-hidden">
            {/* 错误头部 */}
            <div className="bg-red-500 px-6 py-8 text-white text-center">
              <AlertTriangle className="h-16 w-16 mx-auto mb-4" />
              <h1 className="text-2xl font-bold mb-2">应用程序错误</h1>
              <p className="text-red-100">
                抱歉，应用程序遇到了一个意外错误
              </p>
            </div>

            {/* 错误内容 */}
            <div className="p-6">
              {/* 错误消息 */}
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">
                  错误信息
                </h2>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-red-800 font-mono text-sm">
                    {error?.message || '未知错误'}
                  </p>
                </div>
              </div>

              {/* 详细信息（开发模式） */}
              {showDetails && error?.stack && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-lg font-semibold text-gray-900">
                      堆栈跟踪
                    </h2>
                    <button
                      onClick={this.handleCopyError}
                      className="inline-flex items-center px-3 py-1 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      {copied ? (
                        <>
                          <Check className="h-4 w-4 mr-1 text-green-500" />
                          已复制
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-1" />
                          复制错误
                        </>
                      )}
                    </button>
                  </div>
                  <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                    <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono">
                      {error.stack}
                    </pre>
                  </div>
                </div>
              )}

              {/* 组件堆栈（开发模式） */}
              {showDetails && errorInfo?.componentStack && (
                <div className="mb-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-2">
                    组件堆栈
                  </h2>
                  <div className="bg-gray-100 rounded-lg p-4 overflow-x-auto">
                    <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono">
                      {errorInfo.componentStack}
                    </pre>
                  </div>
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={this.handleReset}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  重试
                </button>
                
                <button
                  onClick={this.handleRefresh}
                  className="inline-flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  刷新页面
                </button>
                
                <button
                  onClick={this.handleGoHome}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                >
                  <Home className="h-4 w-4 mr-2" />
                  返回首页
                </button>

                {showDetails && (
                  <a
                    href="https://github.com/your-org/CloudRuinOS/issues/new"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                  >
                    <Bug className="h-4 w-4 mr-2" />
                    报告问题
                  </a>
                )}
              </div>
            </div>

            {/* 页脚 */}
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
              <p className="text-sm text-gray-500 text-center">
                如果问题持续存在，请联系系统管理员或查看控制台日志获取更多信息
              </p>
            </div>
          </div>
        </div>
      );
    }

    return children;
  }
}

/**
 * 路由级别错误边界
 * 用于包裹单个路由页面，错误不会影响其他页面
 */
interface RouteErrorBoundaryProps {
  children: ReactNode;
  routeName?: string;
}

interface RouteErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  constructor(props: RouteErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error(`Route "${this.props.routeName}" error:`, error, errorInfo);
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
          <AlertTriangle className="h-12 w-12 text-yellow-500 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            页面加载失败
          </h2>
          <p className="text-gray-500 mb-4 text-center max-w-md">
            {this.props.routeName ? `"${this.props.routeName}" 页面` : '当前页面'}
            加载时遇到错误
          </p>
          <button
            onClick={this.handleRetry}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            重新加载
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * 异步组件错误边界 Hook
 * 用于函数组件中处理异步错误
 */
export function useErrorHandler(): (error: Error) => void {
  return (error: Error) => {
    // 手动触发错误边界
    throw error;
  };
}

export default ErrorBoundary;
