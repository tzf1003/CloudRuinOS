import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Terminal, Play, Square, RotateCcw, Trash2, Copy, Download, Radio } from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';
import { useNotifications } from '../contexts/UIContext';
import { TerminalMessage, CommandExecution } from '../types/api';
import { Card } from './ui/Card';
import { cn } from '../lib/utils';

const COMMON_COMMANDS = [
  'ls', 'cd', 'pwd', 'cat', 'echo', 'grep', 'find', 'ps', 'top', 'kill',
  'mkdir', 'rm', 'cp', 'mv', 'chmod', 'chown', 'df', 'du', 'head', 'tail',
  'whoami', 'hostname', 'uname', 'date', 'uptime', 'free', 'netstat', 'ping',
  'curl', 'wget', 'tar', 'gzip', 'unzip', 'ssh', 'scp', 'systemctl', 'service',
  'dir', 'type', 'copy', 'move', 'del', 'rd', 'md', 'cls', 'tasklist', 'taskkill',
  'ipconfig', 'netsh', 'sc', 'net', 'reg', 'wmic', 'powershell', 'cmd'
];

interface TerminalCommandEvent {
  command: string;
  timestamp: number;
  status: 'pending' | 'success' | 'error';
  output: string;
}

interface WebSocketTerminalProps {
  deviceId: string;
  sessionId?: string;
  autoConnect?: boolean;
  theme?: 'glass' | 'dark' | 'light';
  fontSize?: number;
  className?: string;
  onConnectionChange?: (connected: boolean) => void;
  onCommandExecuted?: (execution: TerminalCommandEvent) => void;
}

export function WebSocketTerminal({
  deviceId,
  sessionId = `terminal-${Date.now()}`,
  autoConnect = true,
  theme = 'glass',
  fontSize = 14,
  className = '',
  onConnectionChange,
  onCommandExecuted
}: WebSocketTerminalProps) {
  const {
    isConnected,
    isConnecting,
    hasError,
    messages,
    connect,
    disconnect,
    sendCommand,
    sendMessage,
    clearMessages,
    error
  } = useWebSocket(deviceId, sessionId, { autoConnect });

  const [currentCommand, setCurrentCommand] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isCommandRunning, setIsCommandRunning] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showCopySuccess, setShowCopySuccess] = useState(false);
  const [autoCompleteSuggestions, setAutoCompleteSuggestions] = useState<string[]>([]);
  const [showAutoComplete, setShowAutoComplete] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);

  const { addNotification } = useNotifications();

  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (onConnectionChange) {
      onConnectionChange(isConnected);
    }
  }, [isConnected, onConnectionChange]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, currentCommand, autoScroll]);

  const handleCommandSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    
    if (!currentCommand.trim() || !isConnected) return;

    if (currentCommand.trim().toLowerCase() === 'clear' || currentCommand.trim().toLowerCase() === 'cls') {
      clearMessages();
      setCurrentCommand('');
      return;
    }

    setCommandHistory(prev => [currentCommand, ...prev]);
    setHistoryIndex(-1);
    setIsCommandRunning(true);

    try {
      sendCommand(currentCommand);
      onCommandExecuted?.({
        command: currentCommand,
        timestamp: Date.now(),
        status: 'pending',
        output: ''
      });
    } catch (err) {
      console.error('Command failed', err);
    } finally {
      setCurrentCommand('');
      setIsCommandRunning(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showAutoComplete) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedSuggestionIndex(prev => (prev + 1) % autoCompleteSuggestions.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedSuggestionIndex(prev => (prev - 1 + autoCompleteSuggestions.length) % autoCompleteSuggestions.length);
        } else if (e.key === 'Tab' || e.key === 'Enter') {
            e.preventDefault();
            applySuggestion(autoCompleteSuggestions[selectedSuggestionIndex]);
        } else if (e.key === 'Escape') {
            setShowAutoComplete(false);
        }
        return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex < commandHistory.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setCurrentCommand(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > -1) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setCurrentCommand(newIndex >= 0 ? commandHistory[newIndex] : '');
      }
    } else if (e.key === 'Tab') {
        e.preventDefault();
        // Simple autocomplete logic could go here
    } else if (e.key === 'c' && e.ctrlKey) {
       // Ctrl+C handling simulation
        setCurrentCommand(prev => prev + '^C');
        setTimeout(() => setCurrentCommand(''), 200);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setCurrentCommand(value);

      // Simple autocomplete logic
      if (value.trim()) {
          const suggestions = COMMON_COMMANDS.filter(cmd => cmd.startsWith(value.toLowerCase()) && cmd !== value.toLowerCase());
          if (suggestions.length > 0) {
              setAutoCompleteSuggestions(suggestions);
              setShowAutoComplete(true);
              setSelectedSuggestionIndex(0);
          } else {
              setShowAutoComplete(false);
          }
      } else {
          setShowAutoComplete(false);
      }
  };

  const applySuggestion = (suggestion: string) => {
      setCurrentCommand(suggestion);
      setShowAutoComplete(false);
      inputRef.current?.focus();
  };

  const handleCopy = () => {
    if (!scrollRef.current) return;
    const text = scrollRef.current.innerText;
    navigator.clipboard.writeText(text);
    setShowCopySuccess(true);
    setTimeout(() => setShowCopySuccess(false), 2000);
    addNotification({
        type: 'success',
        title: 'Copied',
        message: 'Terminal output copied to clipboard'
    });
  };

  const handleDownload = () => {
    if (!scrollRef.current) return;
    const text = scrollRef.current.innerText;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `terminal-log-${sessionId}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card 
        variant={theme === 'glass' ? 'glass' : 'default'} 
        className={cn(
            "flex flex-col h-full overflow-hidden p-0 border", 
            theme === 'glass' ? "border-slate-800/60" : "border-slate-800",
            className
        )}
    >
      {/* Terminal Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900/80 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-amber-500/80" />
            <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
          </div>
          <div className="h-4 w-px bg-slate-700 mx-2" />
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
             <Terminal className="w-3.5 h-3.5" />
             <span>{sessionId}</span>
             {isConnected ? (
                 <span className="flex items-center text-emerald-400 gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Connected
                 </span>
             ) : (
                 <span className="flex items-center text-red-400 gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    Disconnected
                 </span>
             )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button onClick={isConnected ? disconnect : connect} className={cn("p-1.5 rounded hover:bg-slate-800 transition-colors", isConnected ? "text-red-400" : "text-emerald-400")} title={isConnected ? "Disconnect" : "Connect"}>
             {isConnected ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button onClick={clearMessages} className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors" title="Clear">
             <Trash2 className="w-4 h-4" />
          </button>
          <button onClick={handleCopy} className={cn("p-1.5 rounded hover:bg-slate-800 transition-colors", showCopySuccess ? "text-emerald-400" : "text-slate-400 hover:text-white")} title="Copy All">
             <Copy className="w-4 h-4" />
          </button>
           <button onClick={handleDownload} className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors" title="Download Log">
             <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Terminal Output */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 font-mono bg-[#0c0c0c] text-slate-300 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent"
        style={{ fontSize: `${fontSize}px`, fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}
        onClick={() => inputRef.current?.focus()}
      >
        <div className="pb-2">
            <div className="text-slate-500 mb-2">CloudRuinOS Terminal v1.0.0 [Secure Connection]</div>
            <div className="text-slate-500 mb-4">Type 'help' for available commands.</div>
            
            {messages.map((msg, index) => (
            <div key={index} className="mb-0.5 break-all whitespace-pre-wrap">
                {msg.type === 'command' ? (
                 <div className="flex items-center">
                    <span className="text-cyan-500 mr-2">➜</span>
                    <span className="text-slate-100 font-bold opacity-90">{msg.content}</span>
                 </div>
                ) : msg.type === 'error' ? (
                <span className="text-red-400">{msg.content}</span>
                ) : (
                <span className="text-slate-300">{msg.content}</span>
                )}
            </div>
            ))}
        </div>

        {/* Input Line */}
        <div className="flex items-center relative group">
          <span className="text-cyan-500 mr-2 animate-pulse">➜</span>
          <form onSubmit={handleCommandSubmit} className="flex-1 relative">
            <input
                ref={inputRef}
                type="text"
                value={currentCommand}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                className="w-full bg-transparent border-none outline-none text-slate-100 placeholder-slate-600 focus:ring-0 p-0"
                placeholder={isConnected ? "Enter command..." : "Terminal disconnected"}
                autoComplete="off"
                disabled={!isConnected}
            />
            
            {/* Autocomplete Popup */}
            {showAutoComplete && (
                <div className="absolute bottom-full left-0 mb-2 w-48 bg-slate-800 border border-slate-700 rounded-md shadow-lg overflow-hidden z-20">
                    <div className="text-xs text-slate-500 px-2 py-1 border-b border-slate-700 bg-slate-900/50">Suggestions</div>
                    {autoCompleteSuggestions.map((suggestion, idx) => (
                        <div 
                            key={suggestion}
                            className={cn(
                                "px-3 py-1.5 cursor-pointer text-sm font-mono transition-colors",
                                idx === selectedSuggestionIndex ? "bg-cyan-500/20 text-cyan-300" : "text-slate-300 hover:bg-slate-700"
                            )}
                            onClick={() => applySuggestion(suggestion)}
                        >
                            {suggestion}
                        </div>
                    ))}
                </div>
            )}
          </form>
        </div>
      </div>
    </Card>
  );
}
