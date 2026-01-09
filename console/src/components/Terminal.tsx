// console/src/components/Terminal.tsx
// 终端组件（使用 xterm.js）

import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface TerminalProps {
  sessionId: string;
  agentId: string;
  shellType: 'cmd' | 'powershell' | 'pwsh' | 'sh' | 'bash' | 'zsh';
  onDisconnect?: () => void;
  onClose?: () => void;
}

export const Terminal: React.FC<TerminalProps> = ({
  sessionId,
  agentId,
  shellType,
  onDisconnect,
  onClose,
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [outputCursor, setOutputCursor] = useState<number>(0);
  const [isConnected, setIsConnected] = useState<boolean>(true);

  useEffect(() => {
    if (!terminalRef.current) return;

    // 初始化 xterm.js
    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Consolas, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
      },
      rows: 24,
      cols: 80,
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // 监听用户输入
    xterm.onData((data) => {
      sendInput(data);
    });

    // 监听窗口大小变化
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      const dims = fitAddon.proposeDimensions();
      if (dims) {
        resizeSession(dims.cols, dims.rows);
      }
    });
    resizeObserver.observe(terminalRef.current);

    // 启动输出轮询
    const pollInterval = setInterval(() => {
      fetchOutput();
    }, 1000); // 1秒轮询一次

    return () => {
      clearInterval(pollInterval);
      resizeObserver.disconnect();
      xterm.dispose();
    };
  }, [sessionId]);

  // 发送输入
  const sendInput = async (data: string) => {
    try {
      const response = await fetch('/api/terminal/input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          input_data: data,
        }),
      });

      if (!response.ok) {
        console.error('Failed to send input:', await response.text());
      }
    } catch (error) {
      console.error('Failed to send input:', error);
      setIsConnected(false);
    }
  };

  // 拉取输出
  const fetchOutput = async () => {
    try {
      const response = await fetch(
        `/api/terminal/output/${sessionId}?from_cursor=${outputCursor}`
      );

      if (!response.ok) {
        if (response.status === 404) {
          console.error('Session not found');
          setIsConnected(false);
          onDisconnect?.();
          return;
        }
        console.error('Failed to fetch output:', await response.text());
        setIsConnected(false);
        onDisconnect?.();
        return;
      }

      const data = await response.json();

      if (data.output_data && data.output_data.length > 0) {
        // 检查是否有数据丢失警告
        if (data.output_data.includes('[Warning:') && data.output_data.includes('data lost')) {
          // 显示警告但继续
          console.warn('Output buffer overflow detected, some data may be lost');
        }
        
        xtermRef.current?.write(data.output_data);
        setOutputCursor(data.to_cursor);
      }

      // 如果 cursor 没有变化且连续多次，可能会话已关闭
      if (data.to_cursor === outputCursor) {
        // 可以添加计数器检测会话是否真的关闭
      }

      setIsConnected(true);
    } catch (error) {
      console.error('Failed to fetch output:', error);
      setIsConnected(false);
      onDisconnect?.();
    }
  };

  // 调整窗口大小
  const resizeSession = async (cols: number, rows: number) => {
    try {
      await fetch('/api/terminal/resize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          cols,
          rows,
        }),
      });
    } catch (error) {
      console.error('Failed to resize session:', error);
    }
  };

  // 关闭会话
  const handleClose = async () => {
    try {
      await fetch(`/api/terminal/close/${sessionId}`, {
        method: 'POST',
      });
      onClose?.();
    } catch (error) {
      console.error('Failed to close session:', error);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        ref={terminalRef}
        style={{ flex: 1, background: '#1e1e1e' }}
      />
      
      {/* 断开连接提示 */}
      {!isConnected && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            padding: '24px',
            background: 'rgba(0, 0, 0, 0.9)',
            border: '1px solid #f44336',
            borderRadius: '8px',
            color: '#fff',
            textAlign: 'center',
            zIndex: 1000,
          }}
        >
          <div style={{ fontSize: '16px', marginBottom: '12px', color: '#f44336' }}>
            ⚠ 终端连接已断开
          </div>
          <div style={{ fontSize: '13px', color: '#ccc', marginBottom: '16px' }}>
            会话 ID: {sessionId.substring(0, 16)}...
          </div>
          <button
            onClick={() => {
              setIsConnected(true);
              setOutputCursor(0);
              fetchOutput();
            }}
            style={{
              padding: '8px 16px',
              background: '#0e639c',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              marginRight: '8px',
            }}
          >
            重新连接
          </button>
          <button
            onClick={handleClose}
            style={{
              padding: '8px 16px',
              background: '#3c3c3c',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            关闭
          </button>
        </div>
      )}
    </div>
  );
};
