import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Terminal, Play, Square, RotateCcw, Trash2, Copy, Download } from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';
import { TerminalMessage, CommandExecution } from '../types/api';

// Terminal 组件配置
interface WebSocketTerminalProps {
  deviceId: string;
  sessionId?: string;
  autoConnect?: boolean;
  theme?: 'dark' | 'light';
  fontSize?: number;
  className?: string;
  onConnectionChange?: (connected: boolean) => void;
  onCommandExecuted?: (execution: CommandExecution) => void;
}

// Terminal 主题配置
interface TerminalTheme {
  background: string;
  foreground: string;
  cursor: string;
  selection: string;
  border: string;
  scrollbar: string;
}

const themes: Record<'dark' | 'light', TerminalTheme> = {
  dark: {
    background: 'bg-gray-900',
    foreground: 'text-green-400',
    cursor: 'bg-green-400',
    selection: 'bg-blue-600/30',
    border: 'border-gray-700',
    scrollbar: 'scrollbar-dark'
  },
  light: {
    background: 'bg-white',
    foreground: 'text-gray-800',
    cursor: 'bg-gray-800',
    selection: 'bg-blue-200/50',
    border: 'border-gray-300',
    scrollbar: 'scrollbar-light'
  }
};

/**
 * WebSocket 实时终端组件
 * 实现终端界面和命令输入输出显示、命令历史和自动补全功能、集成 WebSocket 消息处理
 */
export function WebSocketTerminal({
  deviceId,
  sessionId = `terminal-${Date.now()}`,
  autoConnect = true,
  theme = 'dark',
  fontSize = 14,
  className = '',
  onConnectionChange,
  onCommandExecuted
}: WebSocketTerminalProps) {
  // WebSocket 连接管理
  const {
    isConnected,
    isConnecting,
    hasError,
    messages,
    connect,
    disconnect,
    sendCommand,
    clearMessages,
    error
  } = useWebSocket(deviceId, sessionId, { autoConnect });

  // 组件状态
  const [currentCommand, setCurrentCommand] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isCommandRunning, setIsCommandRunning] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  // 引用管理
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 主题配置
  const currentTheme = themes[theme];

  // 连接状态变化回调
  useEffect(() => {
    onConnectionChange?.(isConnected);
  }, [isConnected, onConnectionChange]);

  // 自动滚动到底部
  useEffect(() => {
    if (autoScroll && messagesEndRef.current && typeof messagesEndRef.current.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, autoScroll]);

  // 焦点管理
  useEffect(() => {
    if (isConnected && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isConnected]);

  // 处理命令执行
  const handleCommandSubmit = useCallback(async () => {
    if (!currentCommand.trim() || !isConnected || isCommandRunning) {
      return;
    }

    const command = currentCommand.trim();
    
    // 添加到命令历史
    setCommandHistory(prev => {
      const newHistory = [command, ...prev.filter(cmd => cmd !== command)];
      return newHistory.slice(0, 100); // 限制历史记录数量
    });
    
    // 重置历史索引
    setHistoryIndex(-1);
    
    // 清空输入
    setCurrentCommand('');
    
    // 设置命令运行状态
    setIsCommandRunning(true);
    
    try {
      // 发送命令
      const commandId = sendCommand(command);
      
      // 这里可以添加命令执行的额外逻辑
      console.log(`Command sent: ${command} (ID: ${commandId})`);
      
    } catch (error) {
      console.error('Failed to send command:', error);
    } finally {
      // 命令发送后立即重置状态，实际执行状态由消息处理
      setIsCommandRunning(false);
    }
  }, [currentCommand, isConnected, isCommandRunning, sendCommand]);

  // 处理键盘事件
  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'Enter':
        event.preventDefault();
        handleCommandSubmit();
        break;
        
      case 'ArrowUp':
        event.preventDefault();
        if (commandHistory.length > 0) {
          const newIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
          setHistoryIndex(newIndex);
          setCurrentCommand(commandHistory[newIndex] || '');
        }
        break;
        
      case 'ArrowDown':
        event.preventDefault();
        if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          setHistoryIndex(newIndex);
          setCurrentCommand(commandHistory[newIndex] || '');
        } else if (historyIndex === 0) {
          setHistoryIndex(-1);
          setCurrentCommand('');
        }
        break;
        
      case 'Tab':
        event.preventDefault();
        // TODO: 实现自动补全功能
        break;
        
      case 'c':
        if (event.ctrlKey) {
          event.preventDefault();
          // TODO: 发送中断信号
        }
        break;
    }
  }, [commandHistory, historyIndex, handleCommandSubmit]);

  // 连接/断开连接
  const handleConnect = useCallback(async () => {
    try {
      await connect();
    } catch (error) {
      console.error('Connection failed:', error);
    }
  }, [connect]);

  const handleDisconnect = useCallback(() => {
    disconnect();
  }, [disconnect]);

  // 清空终端
  const handleClear = useCallback(() => {
    clearMessages();
  }, [clearMessages]);

  // 复制终端内容
  const handleCopy = useCallback(() => {
    const content = messages.map(msg => {
      const timestamp = new Date(msg.timestamp).toLocaleTimeString();
      return `[${timestamp}] ${msg.content}`;
    }).join('\n');
    
    navigator.clipboard.writeText(content).then(() => {
      // TODO: 显示复制成功提示
    }).catch(error => {
      console.error('Failed to copy terminal content:', error);
    });
  }, [messages]);

  // 导出终端日志
  const handleExport = useCallback(() => {
    const content = messages.map(msg => {
      const timestamp = new Date(msg.timestamp).toISOString();
      return `[${timestamp}] [${msg.type.toUpperCase()}] ${msg.content}`;
    }).join('\n');
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `terminal-${deviceId}-${sessionId}-${Date.now()}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [messages, deviceId, sessionId]);

  // 渲染消息
  const renderMessage = useCallback((message: TerminalMessage) => {
    const timestamp = new Date(message.timestamp).toLocaleTimeString();
    
    let messageClass = '';
    let prefix = '';
    
    switch (message.type) {
      case 'command':
        messageClass = 'text-blue-400 font-semibold';
        prefix = '$ ';
        break;
      case 'output':
        messageClass = currentTheme.foreground;
        prefix = '';
        break;
      case 'error':
        messageClass = 'text-red-400';
        prefix = '';
        break;
      case 'system':
        messageClass = 'text-yellow-400 italic';
        prefix = '# ';
        break;
    }
    
    return (
      <div key={message.id} className="flex flex-col py-1">
        <div className="flex items-start space-x-2">
          <span className="text-gray-500 text-xs font-mono min-w-[60px]">
            {timestamp}
          </span>
          <div className={`font-mono text-sm flex-1 ${messageClass}`}>
            <span className="select-none">{prefix}</span>
            <span className="whitespace-pre-wrap break-words">
              {message.content}
            </span>
            {message.exitCode !== undefined && (
              <span className={`ml-2 text-xs ${message.exitCode === 0 ? 'text-green-400' : 'text-red-400'}`}>
                [exit: {message.exitCode}]
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }, [currentTheme.foreground]);

  // 渲染连接状态指示器
  const renderConnectionStatus = () => {
    if (isConnecting) {
      return (
        <div className="flex items-center space-x-2 text-yellow-400">
          <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
          <span className="text-sm">Connecting...</span>
        </div>
      );
    }
    
    if (isConnected) {
      return (
        <div className="flex items-center space-x-2 text-green-400">
          <div className="w-2 h-2 bg-green-400 rounded-full"></div>
          <span className="text-sm">Connected</span>
        </div>
      );
    }
    
    if (hasError) {
      return (
        <div className="flex items-center space-x-2 text-red-400">
          <div className="w-2 h-2 bg-red-400 rounded-full"></div>
          <span className="text-sm">Error: {error}</span>
        </div>
      );
    }
    
    return (
      <div className="flex items-center space-x-2 text-gray-400">
        <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
        <span className="text-sm">Disconnected</span>
      </div>
    );
  };

  return (
    <div className={`flex flex-col h-full ${currentTheme.background} ${currentTheme.border} border rounded-lg ${className}`}>
      {/* 终端头部 */}
      <div className={`flex items-center justify-between p-3 ${currentTheme.border} border-b`}>
        <div className="flex items-center space-x-3">
          <Terminal className="w-5 h-5 text-gray-400" />
          <span className="text-sm font-medium text-gray-300">
            Terminal - {deviceId}
          </span>
          {renderConnectionStatus()}
        </div>
        
        <div className="flex items-center space-x-2">
          {/* 连接控制按钮 */}
          {!isConnected ? (
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className="flex items-center space-x-1 px-2 py-1 text-xs bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded transition-colors"
            >
              <Play className="w-3 h-3" />
              <span>Connect</span>
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              className="flex items-center space-x-1 px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
            >
              <Square className="w-3 h-3" />
              <span>Disconnect</span>
            </button>
          )}
          
          {/* 工具按钮 */}
          <button
            onClick={handleClear}
            className="p-1 text-gray-400 hover:text-gray-300 transition-colors"
            title="Clear terminal"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          
          <button
            onClick={handleCopy}
            className="p-1 text-gray-400 hover:text-gray-300 transition-colors"
            title="Copy terminal content"
          >
            <Copy className="w-4 h-4" />
          </button>
          
          <button
            onClick={handleExport}
            className="p-1 text-gray-400 hover:text-gray-300 transition-colors"
            title="Export terminal log"
          >
            <Download className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-1 transition-colors ${autoScroll ? 'text-blue-400' : 'text-gray-400 hover:text-gray-300'}`}
            title="Toggle auto-scroll"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* 终端内容区域 */}
      <div 
        ref={terminalRef}
        className={`flex-1 overflow-y-auto p-3 ${currentTheme.scrollbar}`}
        style={{ fontSize: `${fontSize}px` }}
      >
        {messages.length === 0 ? (
          <div className="text-gray-500 text-sm italic">
            {isConnected ? 'Terminal ready. Type a command and press Enter.' : 'Connect to start using the terminal.'}
          </div>
        ) : (
          <div className="space-y-1">
            {messages.map(renderMessage)}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {/* 命令输入区域 */}
      <div className={`p-3 ${currentTheme.border} border-t`}>
        <div className="flex items-center space-x-2">
          <span className={`text-sm font-mono ${currentTheme.foreground} select-none`}>
            $
          </span>
          <input
            ref={inputRef}
            type="text"
            value={currentCommand}
            onChange={(e) => setCurrentCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!isConnected || isCommandRunning}
            placeholder={isConnected ? "Enter command..." : "Connect to enable input"}
            className={`flex-1 bg-transparent ${currentTheme.foreground} font-mono text-sm outline-none placeholder-gray-500 disabled:opacity-50`}
            style={{ fontSize: `${fontSize}px` }}
          />
          {isCommandRunning && (
            <div className="flex items-center space-x-1 text-yellow-400">
              <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
              <span className="text-xs">Running...</span>
            </div>
          )}
        </div>
        
        {/* 命令历史提示 */}
        {commandHistory.length > 0 && (
          <div className="mt-2 text-xs text-gray-500">
            Use ↑/↓ arrows to navigate command history ({commandHistory.length} commands)
          </div>
        )}
      </div>
    </div>
  );
}

export default WebSocketTerminal;