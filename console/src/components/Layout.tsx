import { Link, useLocation } from 'react-router-dom';
import { 
  Monitor, 
  Radio, 
  FileText, 
  Activity,
  Key,
  FolderOpen,
  BarChart3,
  Menu,
  X
} from 'lucide-react';
import { clsx } from 'clsx';
import { useState } from 'react';
import { useGlobalLoading } from '../contexts/UIContext';
import { InlineLoading } from './LoadingIndicator';

interface LayoutProps {
  children: React.ReactNode;
}

const navigation = [
  { name: '系统概览', href: '/dashboard', icon: BarChart3 },
  { name: '设备管理', href: '/devices', icon: Monitor },
  { name: '文件管理', href: '/files', icon: FolderOpen },
  { name: '会话管理', href: '/sessions', icon: Radio },
  { name: '令牌管理', href: '/tokens', icon: Key },
  { name: '审计日志', href: '/audit', icon: FileText },
  { name: '系统状态', href: '/status', icon: Activity },
];

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isLoading } = useGlobalLoading();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 relative z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              {/* Mobile menu button */}
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 mr-3"
              >
                {sidebarOpen ? (
                  <X className="h-6 w-6" />
                ) : (
                  <Menu className="h-6 w-6" />
                )}
              </button>
              
              <Monitor className="h-8 w-8 text-blue-600 mr-3" />
              <div>
                <h1 className="text-xl font-semibold text-gray-900">
                  Ruinos Console
                </h1>
                <p className="text-sm text-gray-500 hidden sm:block">
                  远程监控和管理系统
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* 全局加载指示器 */}
              {isLoading && (
                <InlineLoading size="sm" message="加载中..." />
              )}
              
              <div className="flex items-center text-sm text-gray-500">
                <div className="w-2 h-2 bg-green-400 rounded-full mr-2"></div>
                <span className="hidden sm:inline">系统正常</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex relative">
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <nav className={clsx(
          'bg-white shadow-sm min-h-screen transition-all duration-300 ease-in-out z-20',
          'lg:relative lg:translate-x-0',
          sidebarOpen 
            ? 'fixed inset-y-0 left-0 w-64 translate-x-0' 
            : 'fixed inset-y-0 left-0 w-64 -translate-x-full lg:w-64 lg:translate-x-0'
        )}>
          <div className="p-4">
            <ul className="space-y-2">
              {navigation.map((item) => {
                const isActive = location.pathname.startsWith(item.href);
                return (
                  <li key={item.name}>
                    <Link
                      to={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={clsx(
                        'flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-blue-100 text-blue-700'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      )}
                    >
                      <item.icon className="mr-3 h-5 w-5 flex-shrink-0" />
                      <span className="truncate">{item.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>

        {/* Main Content */}
        <main className="flex-1 p-4 lg:p-6 min-w-0">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}