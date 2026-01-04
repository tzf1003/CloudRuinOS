import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Send, History, ArrowUp, ArrowDown } from 'lucide-react';

// Terminal 输入组件配置
interface TerminalInputProps {
  onCommand: (command: string) => void;
  disabled?: boolean;
  placeholder?: string;
  history: string[];
  className?: string;
  theme?: 'dark' | 'light';
  fontSize?: number;
  autoFocus?: boolean;
  onHistoryChange?: (index: number) => void;
}

// 命令补全建议
interface CommandSuggestion {
  command: string;
  description?: string;
  category?: string;
}

// 常用命令建议
const COMMON_COMMANDS: CommandSuggestion[] = [
  { command: 'ls', description: 'List directory contents', category: 'file' },
  { command: 'cd', description: 'Change directory', category: 'file' },
  { command: 'pwd', description: 'Print working directory', category: 'file' },
  { command: 'cat', description: 'Display file contents', category: 'file' },
  { command: 'grep', description: 'Search text patterns', category: 'text' },
  { command: 'find', description: 'Find files and directories', category: 'file' },
  { command: 'ps', description: 'List running processes', category: 'system' },
  { command: 'top', description: 'Display running processes', category: 'system' },
  { command: 'kill', description: 'Terminate processes', category: 'system' },
  { command: 'chmod', description: 'Change file permissions', category: 'file' },
  { command: 'chown', description: 'Change file ownership', category: 'file' },
  { command: 'mkdir', description: 'Create directory', category: 'file' },
  { command: 'rmdir', description: 'Remove directory', category: 'file' },
  { command: 'rm', description: 'Remove files', category: 'file' },
  { command: 'cp', description: 'Copy files', category: 'file' },
  { command: 'mv', description: 'Move/rename files', category: 'file' },
  { command: 'tar', description: 'Archive files', category: 'file' },
  { command: 'wget', description: 'Download files', category: 'network' },
  { command: 'curl', description: 'Transfer data', category: 'network' },
  { command: 'ssh', description: 'Secure shell connection', category: 'network' },
];

/**
 * Terminal 输入组件
 * 实现命令输入和快捷键支持、命令历史浏览功能、支持多行命令和特殊字符处理
 */
export function TerminalInput({
  onCommand,
  disabled = false,
  placeholder = "Enter command...",
  history = [],
  className = '',
  theme = 'dark',
  fontSize = 14,
  autoFocus = true,
  onHistoryChange
}: TerminalInputProps) {
  // 组件状态
  const [currentInput, setCurrentInput] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<CommandSuggestion[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [isMultiLine, setIsMultiLine] = useState(false);

  // 引用管理
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // 主题配置
  const themeClasses = {
    dark: {
      background: 'bg-gray-800',
      border: 'border-gray-600',
      text: 'text-green-400',
      placeholder: 'placeholder-gray-500',
      suggestion: 'bg-gray-700 hover:bg-gray-600',
      selectedSuggestion: 'bg-blue-600'
    },
    light: {
      background: 'bg-white',
      border: 'border-gray-300',
      text: 'text-gray-800',
      placeholder: 'placeholder-gray-400',
      suggestion: 'bg-gray-100 hover:bg-gray-200',
      selectedSuggestion: 'bg-blue-100'
    }
  };

  const currentTheme = themeClasses[theme];

  // 自动聚焦
  useEffect(() => {
    if (autoFocus && !disabled) {
      const activeInput = isMultiLine ? textareaRef.current : inputRef.current;
      if (activeInput) {
        activeInput.focus();
      }
    }
  }, [autoFocus, disabled, isMultiLine]);

  // 生成命令建议
  const generateSuggestions = useCallback((input: string) => {
    if (!input.trim()) {
      return [];
    }

    const inputLower = input.toLowerCase();
    const matchingSuggestions = COMMON_COMMANDS.filter(cmd =>
      cmd.command.toLowerCase().startsWith(inputLower) ||
      cmd.description?.toLowerCase().includes(inputLower)
    );

    // 添加历史命令建议
    const historyMatches = history
      .filter(cmd => cmd.toLowerCase().includes(inputLower))
      .slice(0, 5)
      .map(cmd => ({ command: cmd, description: 'From history', category: 'history' }));

    return [...matchingSuggestions.slice(0, 5), ...historyMatches];
  }, [history]);

  // 更新建议
  useEffect(() => {
    const newSuggestions = generateSuggestions(currentInput);
    setSuggestions(newSuggestions);
    setShowSuggestions(newSuggestions.length > 0 && currentInput.trim().length > 0);
    setSelectedSuggestionIndex(-1);
  }, [currentInput, generateSuggestions]);

  // 处理命令提交
  const handleSubmit = useCallback(() => {
    const command = currentInput.trim();
    if (!command || disabled) {
      return;
    }

    // 提交命令
    onCommand(command);
    
    // 清空输入
    setCurrentInput('');
    setHistoryIndex(-1);
    setShowSuggestions(false);
    setIsMultiLine(false);
    
    // 通知历史变化
    onHistoryChange?.(-1);
  }, [currentInput, disabled, onCommand, onHistoryChange]);

  // 处理历史导航
  const navigateHistory = useCallback((direction: 'up' | 'down') => {
    if (history.length === 0) return;

    let newIndex = historyIndex;
    
    if (direction === 'up') {
      newIndex = Math.min(historyIndex + 1, history.length - 1);
    } else {
      newIndex = Math.max(historyIndex - 1, -1);
    }

    setHistoryIndex(newIndex);
    
    if (newIndex === -1) {
      setCurrentInput('');
    } else {
      setCurrentInput(history[newIndex]);
    }
    
    onHistoryChange?.(newIndex);
  }, [history, historyIndex, onHistoryChange]);

  // 处理建议选择
  const selectSuggestion = useCallback((suggestion: CommandSuggestion) => {
    setCurrentInput(suggestion.command);
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
    
    // 聚焦输入框
    const activeInput = isMultiLine ? textareaRef.current : inputRef.current;
    if (activeInput) {
      activeInput.focus();
    }
  }, [isMultiLine]);

  // 处理键盘事件
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    switch (event.key) {
      case 'Enter':
        if (event.shiftKey) {
          // Shift+Enter 切换多行模式
          event.preventDefault();
          setIsMultiLine(!isMultiLine);
        } else if (showSuggestions && selectedSuggestionIndex >= 0) {
          // 选择建议
          event.preventDefault();
          selectSuggestion(suggestions[selectedSuggestionIndex]);
        } else {
          // 提交命令
          event.preventDefault();
          handleSubmit();
        }
        break;
        
      case 'ArrowUp':
        if (showSuggestions) {
          event.preventDefault();
          setSelectedSuggestionIndex(prev => 
            prev <= 0 ? suggestions.length - 1 : prev - 1
          );
        } else {
          event.preventDefault();
          navigateHistory('up');
        }
        break;
        
      case 'ArrowDown':
        if (showSuggestions) {
          event.preventDefault();
          setSelectedSuggestionIndex(prev => 
            prev >= suggestions.length - 1 ? 0 : prev + 1
          );
        } else {
          event.preventDefault();
          navigateHistory('down');
        }
        break;
        
      case 'Tab':
        if (showSuggestions && suggestions.length > 0) {
          event.preventDefault();
          const suggestionToSelect = selectedSuggestionIndex >= 0 
            ? suggestions[selectedSuggestionIndex] 
            : suggestions[0];
          selectSuggestion(suggestionToSelect);
        }
        break;
        
      case 'Escape':
        event.preventDefault();
        setShowSuggestions(false);
        setSelectedSuggestionIndex(-1);
        break;
        
      case 'c':
        if (event.ctrlKey) {
          event.preventDefault();
          // Ctrl+C 清空输入
          setCurrentInput('');
          setHistoryIndex(-1);
          setShowSuggestions(false);
        }
        break;
        
      case 'l':
        if (event.ctrlKey) {
          event.preventDefault();
          // Ctrl+L 可以用于清屏（由父组件处理）
        }
        break;
    }
  }, [showSuggestions, selectedSuggestionIndex, suggestions, selectSuggestion, handleSubmit, navigateHistory, isMultiLine]);

  // 处理输入变化
  const handleInputChange = useCallback((value: string) => {
    setCurrentInput(value);
    setHistoryIndex(-1);
  }, []);

  // 切换多行模式
  const toggleMultiLine = useCallback(() => {
    setIsMultiLine(!isMultiLine);
  }, [isMultiLine]);

  // 渲染建议列表
  const renderSuggestions = () => {
    if (!showSuggestions || suggestions.length === 0) {
      return null;
    }

    return (
      <div 
        ref={suggestionsRef}
        className={`absolute bottom-full left-0 right-0 mb-1 ${currentTheme.background} ${currentTheme.border} border rounded-md shadow-lg max-h-48 overflow-y-auto z-10`}
      >
        {suggestions.map((suggestion, index) => (
          <div
            key={`${suggestion.command}-${index}`}
            className={`px-3 py-2 cursor-pointer transition-colors ${
              index === selectedSuggestionIndex 
                ? currentTheme.selectedSuggestion 
                : currentTheme.suggestion
            }`}
            onClick={() => selectSuggestion(suggestion)}
          >
            <div className="flex items-center justify-between">
              <span className={`font-mono text-sm ${currentTheme.text}`}>
                {suggestion.command}
              </span>
              {suggestion.category && (
                <span className="text-xs text-gray-500 uppercase">
                  {suggestion.category}
                </span>
              )}
            </div>
            {suggestion.description && (
              <div className="text-xs text-gray-500 mt-1">
                {suggestion.description}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={`relative ${className}`}>
      {/* 建议列表 */}
      {renderSuggestions()}
      
      {/* 输入区域 */}
      <div className={`flex items-center space-x-2 p-3 ${currentTheme.background} ${currentTheme.border} border rounded-md`}>
        {/* 命令提示符 */}
        <span className={`text-sm font-mono ${currentTheme.text} select-none`}>
          $
        </span>
        
        {/* 输入框 */}
        {isMultiLine ? (
          <textarea
            ref={textareaRef}
            value={currentInput}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={placeholder}
            rows={3}
            className={`flex-1 bg-transparent ${currentTheme.text} ${currentTheme.placeholder} font-mono text-sm outline-none resize-none disabled:opacity-50`}
            style={{ fontSize: `${fontSize}px` }}
          />
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={currentInput}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={placeholder}
            className={`flex-1 bg-transparent ${currentTheme.text} ${currentTheme.placeholder} font-mono text-sm outline-none disabled:opacity-50`}
            style={{ fontSize: `${fontSize}px` }}
          />
        )}
        
        {/* 控制按钮 */}
        <div className="flex items-center space-x-1">
          {/* 多行切换按钮 */}
          <button
            onClick={toggleMultiLine}
            disabled={disabled}
            className={`p-1 text-gray-400 hover:text-gray-300 transition-colors disabled:opacity-50 ${
              isMultiLine ? 'text-blue-400' : ''
            }`}
            title={isMultiLine ? 'Switch to single line' : 'Switch to multi-line'}
          >
            {isMultiLine ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
          </button>
          
          {/* 历史按钮 */}
          {history.length > 0 && (
            <button
              onClick={() => navigateHistory('up')}
              disabled={disabled}
              className="p-1 text-gray-400 hover:text-gray-300 transition-colors disabled:opacity-50"
              title="Command history (↑/↓)"
            >
              <History className="w-4 h-4" />
            </button>
          )}
          
          {/* 发送按钮 */}
          <button
            onClick={handleSubmit}
            disabled={disabled || !currentInput.trim()}
            className="p-1 text-gray-400 hover:text-gray-300 transition-colors disabled:opacity-50"
            title="Send command (Enter)"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* 快捷键提示 */}
      <div className="mt-2 text-xs text-gray-500 space-y-1">
        <div className="flex flex-wrap gap-4">
          <span>↑/↓: History</span>
          <span>Tab: Autocomplete</span>
          <span>Shift+Enter: Multi-line</span>
          <span>Ctrl+C: Clear</span>
          <span>Esc: Close suggestions</span>
        </div>
        {history.length > 0 && (
          <div>
            Command history: {history.length} commands available
          </div>
        )}
      </div>
    </div>
  );
}

export default TerminalInput;