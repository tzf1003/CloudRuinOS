// console/src/components/TerminalManager.tsx
// 终端管理器（创建、列表、切换）

import React, { useState, useEffect } from 'react';
import { Terminal } from './Terminal';

interface Session {
  session_id: string;
  agent_id: string;
  shell_type: string;
  state: string;
  created_at: string;
}

export const TerminalManager: React.FC = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  useEffect(() => {
    loadSessions();
    const interval = setInterval(loadSessions, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadSessions = async () => {
    try {
      const response = await fetch('/api/terminal/sessions');
      if (response.ok) {
        const data = await response.json();
        setSessions(data);
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  };

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
        setActiveSessionId(data.session_id);
        setShowCreateDialog(false);
        loadSessions();
      }
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  };

  const activeSession = sessions.find((s) => s.session_id === activeSessionId);

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* 侧边栏 */}
      <div
        style={{
          width: '250px',
          background: '#252526',
          color: '#fff',
          padding: '16px',
          overflowY: 'auto',
        }}
      >
        <h3>Terminal Sessions</h3>
        <button
          onClick={() => setShowCreateDialog(true)}
          style={{
            width: '100%',
            padding: '8px',
            marginBottom: '16px',
            background: '#0e639c',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          + New Session
        </button>

        {sessions.map((session) => (
          <div
            key={session.session_id}
            onClick={() => setActiveSessionId(session.session_id)}
            style={{
              padding: '8px',
              marginBottom: '8px',
              background:
                activeSessionId === session.session_id ? '#094771' : '#3c3c3c',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 'bold' }}>
              {session.shell_type}
            </div>
            <div style={{ fontSize: '10px', color: '#ccc' }}>
              {session.session_id.substring(0, 12)}...
            </div>
            <div style={{ fontSize: '10px', color: '#888' }}>
              {session.state}
            </div>
          </div>
        ))}
      </div>

      {/* 终端区域 */}
      <div style={{ flex: 1 }}>
        {activeSession ? (
          <Terminal
            key={activeSession.session_id}
            sessionId={activeSession.session_id}
            agentId={activeSession.agent_id}
            shellType={activeSession.shell_type as any}
            onClose={() => {
              setActiveSessionId(null);
              loadSessions();
            }}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: '#888',
            }}
          >
            Select a session or create a new one
          </div>
        )}
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
