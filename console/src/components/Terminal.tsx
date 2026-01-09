// console/src/components/Terminal.tsx
// 终端组件（使用 xterm.js）

import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { AlertCircle, RefreshCw, X } from 'lucide-react';

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
        background: '#0f172a',
        foreground: '#e2e8f0',
        cursor: '#60a5fa',
        selection: '#334155',
        black: '#1e293b',
        red: '#ef4444',
        green: '#10b981',
        yellow: '#f59e0b',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#f1f5f9',
        brightBlack: '#475569',
        brightRed: '#f87171',
        brightGreen: '#34d399',
        brightYellow: '#fbbf24',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#f8fafc',
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
          console.warn('Output buffer overflow detected, some data may be lost');
        }
        
        xtermRef.current?.write(data.output_data);
        setOutputCursor(data.to_cursor);
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

  // 重新连接
  const handleReconnect = () => {
    setIsConnected(true);
    setOutputCursor(0);
    fetchOutput();
  };

  return (
    <div className="flex flex-col h-full bg-slate-950">
      <div
        ref={terminalRef}
        className="flex-1"
      />
      
      {/* 断开连接提示 */}
      {!isConnected && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-10">
          <div className="glass-panel max-w-md w-full p-6 text-center animate-in fade-in zoom-in duration-200">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-white mb-2">终端连接已断开</h3>
            <p className="text-sm text-slate-400 mb-4">
              会话 ID: {sessionId.substring(0, 16)}...
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleReconnect}
                className="flex-1 inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-all shadow-lg shadow-primary/20"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                重新连接
              </button>
              <button
                onClick={handleClose}
                className="flex-1 inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-all"
              >
                <X className="w-4 h-4 mr-2" />
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
