import { Link, useLocation } from 'react-router-dom';
import { 
  Monitor, 
  Radio, 
  FileText, 
  Activity,
  Key,
  FolderOpen,
  BarChart3,
  Settings,
  Terminal,
  LogOut
} from 'lucide-react';
import { clsx } from 'clsx';

const navigation = [
  { name: '系统概览', href: '/dashboard', icon: BarChart3 },
  { name: '设备管理', href: '/devices', icon: Monitor },
  { name: '文件浏览', href: '/files', icon: FolderOpen },
  { name: '会话管理', href: '/sessions', icon: Radio },
  { name: '访问令牌', href: '/tokens', icon: Key },
  { name: '配置管理', href: '/config', icon: Settings },
  { name: '审计日志', href: '/audit', icon: FileText },
  { name: '系统状态', href: '/status', icon: Activity },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const location = useLocation();

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside className={clsx(
        'fixed inset-y-0 left-0 z-50 w-64 glass-panel transition-transform duration-300 ease-out lg:static lg:translate-x-0',
        !isOpen && '-translate-x-full'
      )}>
        <div className="h-full flex flex-col">
          {/* Logo Area */}
          <div className="h-16 flex items-center px-6 border-b border-white/5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center mr-3 shadow-lg shadow-primary/20">
              <Terminal className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">
                Ruinos<span className="text-primary">OS</span>
              </h1>
              <p className="text-xs text-slate-400">云控制台</p>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
            {navigation.map((item) => {
              const isActive = location.pathname.startsWith(item.href);
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => window.innerWidth < 1024 && onClose()}
                  className={clsx(
                    'group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-all',
                    isActive
                      ? 'bg-primary/10 text-primary shadow-glow'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
                  )}
                >
                  <item.icon className={clsx(
                    'mr-3 h-5 w-5 transition-colors',
                    isActive ? 'text-primary' : 'text-slate-500 group-hover:text-slate-300'
                  )} />
                  {item.name}
                  {isActive && (
                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_currentColor]" />
                  )}
                </Link>
              );
            })}
          </div>

          {/* Footer / Logout */}
          <div className="p-4 border-t border-white/5">
             <button className="flex items-center w-full px-3 py-2 text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
               <LogOut className="mr-3 h-5 w-5" />
               退出登录
             </button>
          </div>
        </div>
      </aside>
    </>
  );
}
