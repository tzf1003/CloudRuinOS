import { Menu, Bell, Search, User } from 'lucide-react';
import { useGlobalLoading } from '../contexts/UIContext';

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { isLoading } = useGlobalLoading();

  return (
    <header className="h-16 glass backdrop-blur-xl border-b border-white/5 sticky top-0 z-30 px-4 sm:px-6 lg:px-8 flex items-center justify-between">
      <div className="flex items-center">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 -ml-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 focus:outline-none"
        >
          <Menu className="h-6 w-6" />
        </button>
        
        {/* Breadcrumb or Page Title can go here */}
        <div className="hidden md:flex ml-4 items-center text-sm text-slate-400">
          <span className="hover:text-slate-200 cursor-pointer transition-colors">控制台</span>
          <span className="mx-2">/</span>
          <span className="text-slate-200 font-medium">仪表板</span>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        {/* Search Bar - hidden on mobile */}
        <div className="hidden md:block relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-500" />
          </div>
          <input
            type="text"
            className="block w-64 rounded-full bg-slate-900/50 border border-white/10 py-1.5 pl-10 pr-3 text-sm text-slate-200 focus:ring-1 focus:ring-primary focus:border-primary placeholder-slate-500 transition-all outline-none"
            placeholder="搜索资源..."
          />
        </div>

        {/* Status Indicator */}
        <div className="flex items-center px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-2"></div>
          <span className="text-xs font-medium text-emerald-400">系统正常</span>
        </div>

        {/* Notifications */}
        <button className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/5 relative">
          <Bell className="h-5 w-5" />
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 border-2 border-slate-900"></span>
        </button>

        {/* User Profile */}
        <div className="flex items-center pl-4 border-l border-white/10">
          <button className="flex items-center space-x-3 focus:outline-none">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-600 p-[1px]">
              <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center">
                 <User className="w-4 h-4 text-slate-200" />
              </div>
            </div>
          </button>
        </div>
      </div>
          
      {isLoading && (
         <div className="absolute bottom-0 left-0 w-full h-[1px] bg-slate-800 overflow-hidden">
            <div className="w-full h-full bg-primary/50 origin-left animate-progress"></div>
         </div>
      )}
    </header>
  );
}
