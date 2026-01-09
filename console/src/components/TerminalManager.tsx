// console/src/components/TerminalManager.tsx
// 终端管理器（标签式多终端 + 侧边栏会话列表）

import React, { useState, useEffect, useCallback } from 'react';
import { Terminal } from './Terminal';
import { Plus, RefreshCw, Terminal as TerminalIcon, Circle, X } from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../lib/api-client';

interface Session {
  session_id: string;
  agent_id: string;
  shell_type: string;
  state: string;
  output_cursor: number;
  created_at: string;
}

interface OpenTab {
  session_id: string;
  agent_id: string;
  shell_type: string;
  title: string;
  isConnected: boolean;
}

interface Agent {
  deviceId: string;  // 使用 Device 接口的字段名
  name?: string;
  platform: string;
  status: string;
}

export const TerminalManager: React.FC = () => {
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 加载所有会话
  const loadSessions = useCallback(async () => {
    try {
      const data = await apiClient.getTerminalSessions();
      setAllSessions(data);

      // 更新已打开标签的连接状态
      setOpenTabs((prevTabs) =>
        prevTabs.map((tab) => {
          const session = data.find((s: Session) => s.session_id === tab.session_id);
          return {
            ...tab,
            isConnected: session ? ['opened', 'running'].includes(session.state) : false,
          };
        })
      );
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  }, []);

  useEffect(() => {
    loadSessions();
    const interval = setInterval(loadSessions, 5000);
    return () => clearInterval(interval);
  }, [loadSessions]);

  // 手动刷新
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadSessions();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // 创建新会话
  const createSession = async (agentId: string, shellType: string) => {
    try {
      const data = await apiClient.createTerminalSession(agentId, shellType, 80, 24);
      
      if (!data.success || !data.session_id) {
        console.error('Failed to create session:', data.error);
        alert(`创建终端失败: ${data.error || '未知错误'}`);
        return;
      }

      const sessionId = data.session_id;

      // 添加到标签栏
      const newTab: OpenTab = {
        session_id: sessionId,
        agent_id: agentId,
        shell_type: shellType,
        title: `${shellType}-${sessionId.substring(0, 8)}`,
        isConnected: true,
      };

      setOpenTabs((prev) => [...prev, newTab]);
      setActiveTabId(sessionId);
      setShowCreateDialog(false);
      loadSessions();
    } catch (error) {
      console.error('Failed to create session:', error);
      alert(`创建终端失败: ${error}`);
    }
  };

  // 从侧边栏打开会话
  const openSessionInTab = (session: Session) => {
    // 检查是否已经打开
    const existingTab = openTabs.find((tab) => tab.session_id === session.session_id);
    if (existingTab) {
      setActiveTabId(session.session_id);
      return;
    }

    // 添加新标签
    const newTab: OpenTab = {
      session_id: session.session_id,
      agent_id: session.agent_id,
      shell_type: session.shell_type,
      title: `${session.shell_type}-${session.session_id.substring(0, 8)}`,
      isConnected: ['opened', 'running'].includes(session.state),
    };

    setOpenTabs((prev) => [...prev, newTab]);
    setActiveTabId(session.session_id);
  };

  // 关闭标签
  const closeTab = async (sessionId: string, shouldCloseRemote: boolean = true) => {
    // 关闭远程会话
    if (shouldCloseRemote) {
      try {
        await apiClient.closeTerminalSession(sessionId);
      } catch (error) {
        console.error('Failed to close remote session:', error);
      }
    }

    // 移除标签
    setOpenTabs((prev) => {
      const newTabs = prev.filter((tab) => tab.session_id !== sessionId);
      
      // 如果关闭的是当前激活标签，切换到前一个
      if (activeTabId === sessionId && newTabs.length > 0) {
        const closedIndex = prev.findIndex((tab) => tab.session_id === sessionId);
        const newActiveIndex = Math.max(0, closedIndex - 1);
        setActiveTabId(newTabs[newActiveIndex].session_id);
      } else if (newTabs.length === 0) {
        setActiveTabId(null);
      }

      return newTabs;
    });

    loadSessions();
  };

  // 处理终端断开
  const handleTerminalDisconnect = (sessionId: string) => {
    setOpenTabs((prev) =>
      prev.map((tab) =>
        tab.session_id === sessionId ? { ...tab, isConnected: false } : tab
      )
    );
  };

  const activeTab = openTabs.find((tab) => tab.session_id === activeTabId);

  return (
    <div className="flex h-[calc(100vh-8rem)] bg-background rounded-lg overflow-hidden border border-white/5">
      {/* 侧边栏 - 终端管理 */}
      <aside className="w-64 glass-panel border-r border-white/5 flex flex-col">
        {/* 标题区域 */}
        <div className="p-4 border-b border-white/5">
          <div className="flex items-center mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center mr-3 shadow-lg shadow-primary/20">
              <TerminalIcon className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-lg font-bold text-white">终端管理</h2>
          </div>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="w-full flex items-center justify-center px-4 py-2.5 text-sm font-medium rounded-lg text-white bg-primary hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
          >
            <Plus className="w-4 h-4 mr-2" />
            新建终端
          </button>
        </div>

        {/* 会话列表 */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {allSessions.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              暂无终端会话
            </div>
          ) : (
            allSessions.map((session) => {
              const isOpen = openTabs.some((tab) => tab.session_id === session.session_id);
              const isConnected = ['opened', 'running'].includes(session.state);

              return (
                <div
                  key={session.session_id}
                  className={clsx(
                    'relative w-full text-left p-3 rounded-lg transition-all group',
                    isOpen
                      ? 'bg-primary/10 border border-primary/20 shadow-glow'
                      : 'bg-white/5 border border-white/5 hover:bg-white/10'
                  )}
                >
                  <button
                    onClick={() => openSessionInTab(session)}
                    className="w-full text-left"
                  >
                    <div className="flex items-center mb-2">
                      <Circle
                        className={clsx(
                          'w-2 h-2 mr-2',
                          isConnected ? 'fill-green-500 text-green-500' : 'fill-slate-500 text-slate-500'
                        )}
                      />
                      <span className="text-sm font-semibold text-white">
                        {session.shell_type}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 ml-4">
                      {session.session_id.substring(0, 16)}...
                    </div>
                    <div className="text-xs text-slate-500 ml-4 mt-1">
                      {session.state}
                    </div>
                  </button>
                  
                  {/* 删除按钮 */}
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (confirm(`确定要删除终端会话 ${session.shell_type}-${session.session_id.substring(0, 8)} 吗？`)) {
                        try {
                          await apiClient.closeTerminalSession(session.session_id);
                          // 如果该会话已打开，也关闭标签
                          closeTab(session.session_id, false);
                          // 刷新会话列表
                          loadSessions();
                        } catch (error) {
                          console.error('Failed to delete session:', error);
                          alert('删除终端会话失败');
                        }
                      }
                    }}
                    className="absolute top-2 right-2 p-1.5 rounded-md text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                    title="删除终端"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* 底部操作 */}
        <div className="p-3 border-t border-white/5">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="w-full flex items-center justify-center px-3 py-2 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all"
          >
            <RefreshCw className={clsx('w-4 h-4 mr-2', isRefreshing && 'animate-spin')} />
            刷新列表
          </button>
        </div>
      </aside>

      {/* 主工作区 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 标签栏 */}
        <div className="flex items-center bg-slate-900/50 border-b border-white/5 overflow-x-auto">
          {/* 新建按钮 */}
          <button
            onClick={() => setShowCreateDialog(true)}
            className="flex-shrink-0 px-4 h-12 flex items-center text-slate-400 hover:text-white hover:bg-white/5 transition-all border-r border-white/5"
            title="新建终端"
          >
            <Plus className="w-5 h-5" />
          </button>

          {/* 标签列表 */}
          {openTabs.map((tab) => (
            <div
              key={tab.session_id}
              onClick={() => setActiveTabId(tab.session_id)}
              className={clsx(
                'flex-shrink-0 flex items-center px-4 h-12 border-r border-white/5 cursor-pointer transition-all',
                activeTabId === tab.session_id
                  ? 'bg-background text-white'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              )}
            >
              <Circle
                className={clsx(
                  'w-2 h-2 mr-2',
                  tab.isConnected ? 'fill-green-500 text-green-500' : 'fill-slate-500 text-slate-500'
                )}
              />
              <span className="text-sm font-medium truncate max-w-[150px]">
                {tab.title}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.session_id);
                }}
                className="ml-2 p-1 text-slate-500 hover:text-red-400 transition-colors"
                title="关闭终端"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* 终端显示区域 */}
        <div className="flex-1 relative bg-background">
          {activeTab ? (
            <Terminal
              key={activeTab.session_id}
              sessionId={activeTab.session_id}
              agentId={activeTab.agent_id}
              shellType={activeTab.shell_type as any}
              onDisconnect={() => handleTerminalDisconnect(activeTab.session_id)}
              onClose={() => closeTab(activeTab.session_id, false)}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">
              <div className="text-center">
                <TerminalIcon className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                <p>从左侧选择一个终端会话</p>
                <p className="mt-2">或点击 + 创建新终端</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 创建对话框 */}
      {showCreateDialog && (
        <CreateSessionDialog
          onClose={() => setShowCreateDialog(false)}
          onCreate={createSession}
        />
      )}
    </div>
  );
};

interface CreateSessionDialogProps {
  onClose: () => void;
  onCreate: (agentId: string, shellType: string) => void;
}

const CreateSessionDialog: React.FC<CreateSessionDialogProps> = ({
  onClose,
  onCreate,
}) => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [shellType, setShellType] = useState('bash');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    try {
      const devices = await apiClient.getDevices();
      setAgents(devices);
      
      // 默认选择第一个在线的 Agent
      const onlineAgent = devices.find((a: Agent) => a.status === 'online');
      if (onlineAgent) {
        setSelectedAgentId(onlineAgent.deviceId);
        // 根据 platform 设置默认 shell
        const platform = onlineAgent.platform.toLowerCase();
        if (platform.includes('windows') || platform.includes('win32')) {
          setShellType('powershell');
        } else {
          setShellType('bash');
        }
      } else if (devices.length > 0) {
        setSelectedAgentId(devices[0].deviceId);
        // 根据第一个设备的 platform 设置默认 shell
        const platform = devices[0].platform.toLowerCase();
        if (platform.includes('windows') || platform.includes('win32')) {
          setShellType('powershell');
        } else {
          setShellType('bash');
        }
      }
    } catch (error) {
      console.error('Failed to load agents:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectedAgent = agents.find((a) => a.deviceId === selectedAgentId);
  const isWindows = selectedAgent 
    ? (selectedAgent.platform.toLowerCase().includes('windows') || 
       selectedAgent.platform.toLowerCase().includes('win32'))
    : false;

  const shellOptions = isWindows
    ? ['cmd', 'powershell', 'pwsh']
    : ['sh', 'bash', 'zsh'];

  const handleCreate = () => {
    if (!selectedAgentId) {
      alert('请选择一个 Agent');
      return;
    }
    onCreate(selectedAgentId, shellType);
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="glass-panel max-w-md w-full p-6 animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl font-bold text-white mb-6">创建新终端会话</h3>

        {loading ? (
          <div className="text-center py-8 text-slate-400">
            <div className="loader-spinner w-8 h-8 mx-auto mb-3" />
            正在加载 Agent 列表...
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <p>暂无可用的 Agent</p>
            <p className="text-sm mt-2">请先启动 Agent 服务</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                选择 Agent
              </label>
              <select
                value={selectedAgentId}
                onChange={(e) => {
                  setSelectedAgentId(e.target.value);
                  const agent = agents.find((a) => a.deviceId === e.target.value);
                  if (agent) {
                    // 根据 platform 自动切换默认 shell
                    const platform = agent.platform.toLowerCase();
                    if (platform.includes('windows') || platform.includes('win32')) {
                      setShellType('powershell');
                    } else {
                      setShellType('bash');
                    }
                  }
                }}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              >
                {agents.map((agent) => (
                  <option key={agent.deviceId} value={agent.deviceId}>
                    {agent.name || agent.deviceId} ({agent.deviceId.substring(0, 8)}) - {agent.status}
                  </option>
                ))}
              </select>
              {selectedAgent && (
                <p className="text-xs text-slate-400 mt-2">
                  平台: {selectedAgent.platform}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Shell 类型
              </label>
              <select
                value={shellType}
                onChange={(e) => setShellType(e.target.value)}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              >
                {shellOptions.map((shell) => (
                  <option key={shell} value={shell}>
                    {shell}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-all"
          >
            取消
          </button>
          <button
            onClick={handleCreate}
            disabled={loading || agents.length === 0 || !selectedAgentId}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-all shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            创建
          </button>
        </div>
      </div>
    </div>
  );
};
