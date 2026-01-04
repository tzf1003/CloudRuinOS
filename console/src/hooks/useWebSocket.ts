import { useState, useEffect, useCallback, useRef } from 'react';
import { webSocketManager, ConnectionStatus, MessageHandler, StatusHandler, FileOperationHandler, FileOperationProgress } from '../lib/websocket-manager';
import { WebSocketMessage, TerminalMessage, CommandExecution } from '../types/api';

// WebSocket Hook 配置
interface UseWebSocketConfig {
  autoConnect?: boolean;
  reconnectOnMount?: boolean;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
}

// WebSocket Hook 返回值
interface UseWebSocketReturn {
  // 连接状态
  connectionStatus: ConnectionStatus | null;
  isConnected: boolean;
  isConnecting: boolean;
  isDisconnected: boolean;
  hasError: boolean;
  
  // 消息和历史
  messages: TerminalMessage[];
  lastMessage: WebSocketMessage | null;
  
  // 文件操作
  fileOperations: FileOperationProgress[];
  activeFileOperations: FileOperationProgress[];
  
  // 操作方法
  connect: () => Promise<void>;
  disconnect: () => void;
  sendMessage: (message: WebSocketMessage) => boolean;
  sendCommand: (command: string, args?: string[]) => string;
  requestFileList: (path: string) => string;
  requestFileDownload: (path: string) => string;
  requestFileUpload: (path: string, content: string) => string;
  clearMessages: () => void;
  
  // 错误信息
  error: string | null;
}

/**
 * WebSocket 自定义 Hook
 * 封装 WebSocket 连接状态管理、消息发送接收处理、连接状态监听和错误处理
 */
export function useWebSocket(
  deviceId: string,
  sessionId: string,
  config: UseWebSocketConfig = {}
): UseWebSocketReturn {
  const {
    autoConnect = false,
    reconnectOnMount = true,
    maxReconnectAttempts = 5,
    heartbeatInterval = 30000
  } = config;

  // 状态管理
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);
  const [messages, setMessages] = useState<TerminalMessage[]>([]);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [fileOperations, setFileOperations] = useState<FileOperationProgress[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 引用管理
  const connectionKeyRef = useRef<string>('');
  const messageHandlerRef = useRef<MessageHandler | null>(null);
  const statusHandlerRef = useRef<StatusHandler | null>(null);
  const fileOperationHandlerRef = useRef<FileOperationHandler | null>(null);
  const commandIdCounterRef = useRef<number>(0);
  const pendingCommandsRef = useRef<Map<string, {
    command: string;
    timestamp: number;
    resolve: (result: CommandExecution) => void;
    reject: (error: Error) => void;
  }>>(new Map());

  // 生成连接键
  const connectionKey = `${deviceId}:${sessionId}`;
  connectionKeyRef.current = connectionKey;

  // 计算派生状态
  const isConnected = connectionStatus?.status === 'connected';
  const isConnecting = connectionStatus?.status === 'connecting';
  const isDisconnected = connectionStatus?.status === 'disconnected';
  const hasError = connectionStatus?.status === 'error';
  const activeFileOperations = fileOperations.filter(op => op.status === 'pending' || op.status === 'progress');

  // 消息处理器
  const handleMessage = useCallback((message: WebSocketMessage) => {
    setLastMessage(message);
    setError(null);

    // 根据消息类型处理
    switch (message.type) {
      case 'cmd_result': {
        // 处理命令执行结果
        const cmdResult = message as any; // CommandResultMessage
        const terminalMessage: TerminalMessage = {
          id: `result-${cmdResult.id}`,
          type: cmdResult.exitCode === 0 ? 'output' : 'error',
          content: cmdResult.stdout || cmdResult.stderr || '',
          timestamp: Date.now(),
          exitCode: cmdResult.exitCode
        };
        
        setMessages(prev => [...prev, terminalMessage]);

        // 解决待处理的命令 Promise
        const pendingCommand = pendingCommandsRef.current.get(cmdResult.id);
        if (pendingCommand) {
          pendingCommandsRef.current.delete(cmdResult.id);
          const commandExecution: CommandExecution = {
            id: cmdResult.id,
            command: pendingCommand.command,
            startTime: pendingCommand.timestamp,
            endTime: Date.now(),
            exitCode: cmdResult.exitCode,
            stdout: cmdResult.stdout || '',
            stderr: cmdResult.stderr || ''
          };
          pendingCommand.resolve(commandExecution);
        }
        break;
      }
      
      case 'error': {
        // 处理错误消息
        const errorMsg = message as any; // ErrorMessage
        const terminalMessage: TerminalMessage = {
          id: `error-${Date.now()}`,
          type: 'error',
          content: `Error: ${errorMsg.message}`,
          timestamp: Date.now()
        };
        
        setMessages(prev => [...prev, terminalMessage]);
        setError(errorMsg.message);
        break;
      }
      
      case 'file_list_result':
      case 'file_get_result':
      case 'file_put_result': {
        // 文件操作结果，可以在这里处理或传递给其他组件
        console.log('File operation result:', message);
        break;
      }
      
      case 'presence': {
        // 处理在线状态消息
        const terminalMessage: TerminalMessage = {
          id: `presence-${Date.now()}`,
          type: 'system',
          content: 'Device is online',
          timestamp: Date.now()
        };
        
        setMessages(prev => [...prev, terminalMessage]);
        break;
      }
      
      default: {
        // 处理其他类型的消息
        console.log('Received WebSocket message:', message);
        break;
      }
    }
  }, []);

  // 状态变化处理器
  const handleStatusChange = useCallback((status: ConnectionStatus) => {
    setConnectionStatus(status);
    
    // 根据状态更新错误信息
    if (status.status === 'error') {
      setError(status.error || 'Connection error');
    } else if (status.status === 'connected') {
      setError(null);
    }

    // 添加系统消息
    let systemMessage: string | null = null;
    switch (status.status) {
      case 'connecting':
        systemMessage = 'Connecting to device...';
        break;
      case 'connected':
        systemMessage = 'Connected to device';
        break;
      case 'disconnected':
        systemMessage = 'Disconnected from device';
        break;
      case 'error':
        systemMessage = `Connection error: ${status.error || 'Unknown error'}`;
        break;
    }

    if (systemMessage) {
      const terminalMessage: TerminalMessage = {
        id: `system-${Date.now()}`,
        type: 'system',
        content: systemMessage,
        timestamp: Date.now()
      };
      
      setMessages(prev => [...prev, terminalMessage]);
    }
  }, []);

  // 文件操作处理器
  const handleFileOperation = useCallback((operation: FileOperationProgress) => {
    setFileOperations(prev => {
      const existingIndex = prev.findIndex(op => op.id === operation.id);
      if (existingIndex >= 0) {
        // 更新现有操作
        const updated = [...prev];
        updated[existingIndex] = operation;
        return updated;
      } else {
        // 添加新操作
        return [...prev, operation];
      }
    });

    // 添加文件操作相关的终端消息
    let message: string | null = null;
    switch (operation.status) {
      case 'pending':
        message = `Starting ${operation.type} operation: ${operation.path}`;
        break;
      case 'progress':
        if (operation.progress !== undefined) {
          message = `${operation.type} progress: ${operation.progress}% - ${operation.path}`;
        }
        break;
      case 'success':
        message = `${operation.type} completed successfully: ${operation.path}`;
        break;
      case 'error':
        message = `${operation.type} failed: ${operation.path} - ${operation.error}`;
        break;
    }

    if (message) {
      const terminalMessage: TerminalMessage = {
        id: `file-op-${operation.id}`,
        type: operation.status === 'error' ? 'error' : 'system',
        content: message,
        timestamp: Date.now()
      };
      
      setMessages(prev => [...prev, terminalMessage]);
    }
  }, []);

  // 连接方法
  const connect = useCallback(async () => {
    if (!deviceId || !sessionId) {
      throw new Error('Device ID and Session ID are required');
    }

    try {
      setError(null);
      await webSocketManager.connect(deviceId, sessionId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Connection failed';
      setError(errorMessage);
      throw error;
    }
  }, [deviceId, sessionId]);

  // 断开连接方法
  const disconnect = useCallback(() => {
    webSocketManager.disconnect(connectionKey);
    
    // 清理待处理的命令
    for (const [id, pendingCommand] of pendingCommandsRef.current.entries()) {
      pendingCommand.reject(new Error('Connection closed'));
    }
    pendingCommandsRef.current.clear();
  }, [connectionKey]);

  // 发送消息方法
  const sendMessage = useCallback((message: WebSocketMessage): boolean => {
    const success = webSocketManager.send(connectionKey, message);
    
    if (!success) {
      setError('Failed to send message - connection not available');
    }
    
    return success;
  }, [connectionKey]);

  // 发送命令方法
  const sendCommand = useCallback((command: string, args: string[] = []): string => {
    const commandId = `cmd-${++commandIdCounterRef.current}`;
    
    const commandMessage: WebSocketMessage = {
      type: 'cmd',
      id: commandId,
      command,
      args,
      timeout: 30000 // 30 seconds timeout
    } as any; // CommandMessage

    // 添加命令到消息历史
    const terminalMessage: TerminalMessage = {
      id: `command-${commandId}`,
      type: 'command',
      content: `$ ${command} ${args.join(' ')}`.trim(),
      timestamp: Date.now()
    };
    
    setMessages(prev => [...prev, terminalMessage]);

    // 发送命令
    const success = sendMessage(commandMessage);
    
    if (!success) {
      // 添加错误消息
      const errorMessage: TerminalMessage = {
        id: `error-${commandId}`,
        type: 'error',
        content: 'Failed to send command - connection not available',
        timestamp: Date.now()
      };
      
      setMessages(prev => [...prev, errorMessage]);
    }

    return commandId;
  }, [sendMessage]);

  // 清空消息历史
  const clearMessages = useCallback(() => {
    setMessages([]);
    setLastMessage(null);
    setError(null);
  }, []);

  // 文件操作方法
  const requestFileList = useCallback((path: string): string => {
    if (!isConnected) {
      setError('Cannot request file list - not connected');
      return '';
    }

    const operationId = webSocketManager.requestFileList(connectionKey, path);
    return operationId;
  }, [connectionKey, isConnected]);

  const requestFileDownload = useCallback((path: string): string => {
    if (!isConnected) {
      setError('Cannot download file - not connected');
      return '';
    }

    const operationId = webSocketManager.requestFileDownload(connectionKey, path);
    return operationId;
  }, [connectionKey, isConnected]);

  const requestFileUpload = useCallback((path: string, content: string): string => {
    if (!isConnected) {
      setError('Cannot upload file - not connected');
      return '';
    }

    const operationId = webSocketManager.requestFileUpload(connectionKey, path, content);
    return operationId;
  }, [connectionKey, isConnected]);

  // 设置和清理事件处理器
  useEffect(() => {
    if (!deviceId || !sessionId) return;

    // 创建处理器引用
    messageHandlerRef.current = handleMessage;
    statusHandlerRef.current = handleStatusChange;
    fileOperationHandlerRef.current = handleFileOperation;

    // 注册处理器
    webSocketManager.onMessage(connectionKey, handleMessage);
    webSocketManager.onStatusChange(connectionKey, handleStatusChange);
    webSocketManager.onFileOperation(connectionKey, handleFileOperation);

    // 获取当前连接状态
    const currentStatus = webSocketManager.getConnectionStatus(connectionKey);
    if (currentStatus) {
      setConnectionStatus(currentStatus);
    }

    // 自动连接
    if (autoConnect) {
      connect().catch(error => {
        console.error('Auto-connect failed:', error);
      });
    }

    // 清理函数
    return () => {
      if (messageHandlerRef.current) {
        webSocketManager.offMessage(connectionKey, messageHandlerRef.current);
      }
      if (statusHandlerRef.current) {
        webSocketManager.offStatusChange(connectionKey, statusHandlerRef.current);
      }
      if (fileOperationHandlerRef.current) {
        webSocketManager.offFileOperation(connectionKey, fileOperationHandlerRef.current);
      }
    };
  }, [deviceId, sessionId, connectionKey, autoConnect, connect, handleMessage, handleStatusChange, handleFileOperation]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      // 清理待处理的命令
      for (const [id, pendingCommand] of pendingCommandsRef.current.entries()) {
        pendingCommand.reject(new Error('Component unmounted'));
      }
      pendingCommandsRef.current.clear();
    };
  }, []);

  return {
    // 连接状态
    connectionStatus,
    isConnected,
    isConnecting,
    isDisconnected,
    hasError,
    
    // 消息和历史
    messages,
    lastMessage,
    
    // 文件操作
    fileOperations,
    activeFileOperations,
    
    // 操作方法
    connect,
    disconnect,
    sendMessage,
    sendCommand,
    requestFileList,
    requestFileDownload,
    requestFileUpload,
    clearMessages,
    
    // 错误信息
    error
  };
}

/**
 * 简化版 WebSocket Hook，用于基本的消息收发
 */
export function useSimpleWebSocket(
  deviceId: string,
  sessionId: string,
  autoConnect: boolean = false
) {
  const {
    isConnected,
    isConnecting,
    hasError,
    connect,
    disconnect,
    sendMessage,
    error
  } = useWebSocket(deviceId, sessionId, { autoConnect });

  return {
    isConnected,
    isConnecting,
    hasError,
    connect,
    disconnect,
    sendMessage,
    error
  };
}

export default useWebSocket;