// console/src/components/TerminalManager.tsx
// 终端管理器（标签式多终端 + 侧边栏会话列表）

import React, { useState, useEffect, useCallback } from 'react';
import { Terminal } from './Terminal';

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

export const TerminalManager: React.FC = () => {
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // 加载所有会话
  const loadSessions = useCallback(async () => {
    try {
      const response = await fetch('/api/terminal/sessions');
      if (response.ok) {
        const data = await response.json();
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
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  }, []);

  useEffect(() => {
    loadSessions();
    const interval = setInterval(loadSessions, 5000);
    return () => clearInterval(interval);
  }, [loadSessions]);

  // 创建新会话
  const createSession = async (agentId: string, shellType: string) => {
    try {
      const response = await fetch('/api/terminal/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId,
          shell_type: shellType,
          cols: 80,
          rows: 24,
        }),
      });

      if (response.ok) {
        const data = await response.json();
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
      }
    } catch (error) {
      console.error('Failed to create session:', error);
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
        await fetch(`/api/terminal/close/${sessionId}`, {
          method: 'POST',
        });
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
    <div style={{ display: 'flex', height: '100vh', background: '#1e1e1e' }}>
      {/* 侧边栏 - 终端管理 */}
      <div
        style={{
          width: '250px',
          background: '#252526',
          color: '#cccccc',
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid #3c3c3c',
        }}
      >
        <div style={{ padding: '16px', borderBottom: '1px solid #3c3c3c' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600 }}>
            终端管理
          </h3>
          <button
            onClick={() => setShowCreateDialog(true)}
            style={{
              width: '100%',
              padding: '8px',
              background: '#0e639c',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            + 新建终端
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {allSessions.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', color: '#888', fontSize: '12px' }}>
              暂无终端会话
            </div>
          ) : (
            allSessions.map((session) => {
              const isOpen = openTabs.some((tab) => tab.session_id === session.session_id);
              const isConnected = ['opened', 'running'].includes(session.state);

              return (
                <div
                  key={session.session_id}
                  onClick={() => openSessionInTab(session)}
                  style={{
                    padding: '10px',
                    marginBottom: '6px',
                    background: isOpen ? '#094771' : '#2d2d30',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    border: isOpen ? '1px solid #0e639c' : '1px solid transparent',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isOpen) e.currentTarget.style.background = '#3c3c3c';
                  }}
                  onMouseLeave={(e) => {
                    if (!isOpen) e.currentTarget.style.background = '#2d2d30';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: isConnected ? '#4caf50' : '#888',
                        marginRight: '8px',
                      }}
                    />
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>
                      {session.shell_type}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#888', marginLeft: '16px' }}>
                    {session.session_id.substring(0, 16)}...
                  </div>
                  <div style={{ fontSize: '10px', color: '#666', marginLeft: '16px', marginTop: '2px' }}>
                    {session.state}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div style={{ padding: '12px', borderTop: '1px solid #3c3c3c' }}>
          <button
            onClick={loadSessions}
            style={{
              width: '100%',
              padding: '6px',
              background: '#3c3c3c',
              color: '#cccccc',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            🔄 刷新列表
          </button>
        </div>
      </div>

      {/* 主工作区 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* 标签栏 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: '#2d2d30',
            borderBottom: '1px solid #3c3c3c',
            overflowX: 'auto',
            minHeight: '40px',
          }}
        >
          {/* 新建按钮 */}
          <button
            onClick={() => setShowCreateDialog(true)}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              color: '#cccccc',
              border: 'none',
              cursor: 'pointer',
              fontSize: '18px',
              minWidth: '40px',
              height: '40px',
            }}
            title="新建终端"
          >
            +
          </button>

          {/* 标签列表 */}
          {openTabs.map((tab) => (
            <div
              key={tab.session_id}
              onClick={() => setActiveTabId(tab.session_id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 12px',
                background: activeTabId === tab.session_id ? '#1e1e1e' : 'transparent',
                borderRight: '1px solid #3c3c3c',
                cursor: 'pointer',
                minWidth: '150px',
                maxWidth: '200px',
                position: 'relative',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: tab.isConnected ? '#4caf50' : '#888',
                  marginRight: '8px',
                }}
              />
              <span
                style={{
                  flex: 1,
                  fontSize: '13px',
                  color: tab.isConnected ? '#cccccc' : '#888',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {tab.title}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.session_id);
                }}
                style={{
                  marginLeft: '8px',
                  padding: '2px 6px',
                  background: 'transparent',
                  color: '#888',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '16px',
                  lineHeight: '1',
                }}
                title="关闭终端"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* 终端显示区域 */}
        <div style={{ flex: 1, position: 'relative' }}>
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
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: '#888',
                fontSize: '14px',
              }}
            >
              从左侧选择一个终端会话，或点击 + 创建新终端
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
  const [agentId, setAgentId] = useState('agent-001');
  const [shellType, setShellType] = useState('bash');
  const [os, setOs] = useState<'windows' | 'linux'>('linux');

  const shellOptions = {
    windows: ['cmd', 'powershell', 'pwsh'],
    linux: ['sh', 'bash', 'zsh'],
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#1e1e1e',
          padding: '24px',
          borderRadius: '8px',
          minWidth: '400px',
          color: '#fff',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>Create New Terminal Session</h3>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px' }}>
            Agent ID:
          </label>
          <input
            type="text"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              background: '#3c3c3c',
              border: '1px solid #555',
              color: '#fff',
              borderRadius: '4px',
            }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px' }}>
            Operating System:
          </label>
          <select
            value={os}
            onChange={(e) => {
              setOs(e.target.value as 'windows' | 'linux');
              setShellType(shellOptions[e.target.value as 'windows' | 'linux'][0]);
            }}
            style={{
              width: '100%',
              padding: '8px',
              background: '#3c3c3c',
              border: '1px solid #555',
              color: '#fff',
              borderRadius: '4px',
            }}
          >
            <option value="linux">Linux/macOS</option>
            <option value="windows">Windows</option>
          </select>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px' }}>
            Shell Type:
          </label>
          <select
            value={shellType}
            onChange={(e) => setShellType(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              background: '#3c3c3c',
              border: '1px solid #555',
              color: '#fff',
              borderRadius: '4px',
            }}
          >
            {shellOptions[os].map((shell) => (
              <option key={shell} value={shell}>
                {shell}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: '#3c3c3c',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onCreate(agentId, shellType)}
            style={{
              padding: '8px 16px',
              background: '#0e639c',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
};
