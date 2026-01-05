import { WebSocketMessage, TerminalMessage, CommandExecution } from '../types/api';

// Connection status interface
export interface ConnectionStatus {
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  lastConnected?: number;
  reconnectAttempts: number;
  error?: string;
}

// Message handler type
export type MessageHandler = (message: WebSocketMessage) => void;
export type StatusHandler = (status: ConnectionStatus) => void;
export type FileOperationHandler = (operation: FileOperationProgress) => void;

// WebSocket connection configuration
interface WebSocketConfig {
  maxReconnectAttempts: number;
  heartbeatInterval: number;
  reconnectDelay: number;
  connectionTimeout: number;
}

// Message queue item
interface QueuedMessage {
  message: WebSocketMessage;
  priority: number;
  timestamp: number;
  retries: number;
}

// File operation progress tracking
export interface FileOperationProgress {
  id: string;
  type: 'upload' | 'download' | 'list' | 'delete';
  path: string;
  status: 'pending' | 'progress' | 'success' | 'error';
  progress?: number;
  totalSize?: number;
  transferredSize?: number;
  error?: string;
  startTime: number;
  endTime?: number;
}

/**
 * WebSocket 管理器类
 * 负责管理多个 WebSocket 连接，提供自动重连、消息路由、心跳机制等功能
 */
export class WebSocketManager {
  private connections: Map<string, WebSocket> = new Map();
  private connectionStatus: Map<string, ConnectionStatus> = new Map();
  private messageHandlers: Map<string, Set<MessageHandler>> = new Map();
  private statusHandlers: Map<string, Set<StatusHandler>> = new Map();
  private heartbeatIntervals: Map<string, NodeJS.Timeout> = new Map();
  private reconnectTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private messageQueues: Map<string, QueuedMessage[]> = new Map();
  private fileOperations: Map<string, FileOperationProgress> = new Map();
  private fileOperationHandlers: Map<string, Set<FileOperationHandler>> = new Map();
  private config: WebSocketConfig;

  constructor(
    private baseUrl: string,
    config?: Partial<WebSocketConfig>
  ) {
    this.config = {
      maxReconnectAttempts: 5,
      heartbeatInterval: 30000, // 30 seconds
      reconnectDelay: 1000, // 1 second base delay
      connectionTimeout: 10000, // 10 seconds
      ...config
    };
  }

  /**
   * 建立 WebSocket 连接
   */
  async connect(deviceId: string, sessionId: string): Promise<WebSocket> {
    const connectionKey = this.getConnectionKey(deviceId, sessionId);
    
    // 如果连接已存在且状态良好，返回现有连接
    const existingConnection = this.connections.get(connectionKey);
    if (existingConnection && existingConnection.readyState === WebSocket.OPEN) {
      return existingConnection;
    }

    // 清理现有连接
    this.disconnect(connectionKey);

    // 构建 WebSocket URL
    const wsUrl = this.buildWebSocketUrl(deviceId, sessionId);
    
    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(wsUrl);
        
        // 设置连接超时
        const timeoutId = setTimeout(() => {
          ws.close();
          reject(new Error('WebSocket connection timeout'));
        }, this.config.connectionTimeout);

        // 更新连接状态
        this.updateConnectionStatus(connectionKey, {
          status: 'connecting',
          reconnectAttempts: 0
        });

        ws.onopen = () => {
          clearTimeout(timeoutId);
          
          // 存储连接
          this.connections.set(connectionKey, ws);
          
          // 更新状态
          this.updateConnectionStatus(connectionKey, {
            status: 'connected',
            lastConnected: Date.now(),
            reconnectAttempts: 0
          });

          // 启动心跳
          this.startHeartbeat(connectionKey);
          
          // 处理队列中的消息
          this.processMessageQueue(connectionKey);
          
          resolve(ws);
        };

        ws.onmessage = (event) => {
          this.handleMessage(connectionKey, event);
        };

        ws.onclose = (event) => {
          clearTimeout(timeoutId);
          this.handleConnectionClose(connectionKey, event);
        };

        ws.onerror = (error) => {
          clearTimeout(timeoutId);
          this.handleConnectionError(connectionKey, error);
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 断开 WebSocket 连接
   */
  disconnect(connectionKey: string): void {
    const ws = this.connections.get(connectionKey);
    if (ws) {
      ws.close();
      this.connections.delete(connectionKey);
    }

    // 清理心跳
    this.stopHeartbeat(connectionKey);
    
    // 清理重连定时器
    const reconnectTimeout = this.reconnectTimeouts.get(connectionKey);
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      this.reconnectTimeouts.delete(connectionKey);
    }

    // 更新状态
    this.updateConnectionStatus(connectionKey, {
      status: 'disconnected',
      reconnectAttempts: 0
    });

    // 清理消息队列
    this.messageQueues.delete(connectionKey);
    
    // 清理文件操作处理器
    this.fileOperationHandlers.delete(connectionKey);
  }

  /**
   * 发送消息
   */
  send(connectionKey: string, message: WebSocketMessage, priority: number = 0): boolean {
    const ws = this.connections.get(connectionKey);
    
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error('Failed to send WebSocket message:', error);
        return false;
      }
    } else {
      // 将消息加入队列
      this.queueMessage(connectionKey, message, priority);
      return false;
    }
  }

  /**
   * 添加消息处理器
   */
  onMessage(connectionKey: string, handler: MessageHandler): void {
    if (!this.messageHandlers.has(connectionKey)) {
      this.messageHandlers.set(connectionKey, new Set());
    }
    this.messageHandlers.get(connectionKey)!.add(handler);
  }

  /**
   * 移除消息处理器
   */
  offMessage(connectionKey: string, handler: MessageHandler): void {
    const handlers = this.messageHandlers.get(connectionKey);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.messageHandlers.delete(connectionKey);
      }
    }
  }

  /**
   * 添加状态变化处理器
   */
  onStatusChange(connectionKey: string, handler: StatusHandler): void {
    if (!this.statusHandlers.has(connectionKey)) {
      this.statusHandlers.set(connectionKey, new Set());
    }
    this.statusHandlers.get(connectionKey)!.add(handler);
  }

  /**
   * 移除状态变化处理器
   */
  offStatusChange(connectionKey: string, handler: StatusHandler): void {
    const handlers = this.statusHandlers.get(connectionKey);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.statusHandlers.delete(connectionKey);
      }
    }
  }

  /**
   * 获取连接状态
   */
  getConnectionStatus(connectionKey: string): ConnectionStatus | null {
    return this.connectionStatus.get(connectionKey) || null;
  }

  /**
   * 获取所有活跃连接
   */
  getActiveConnections(): string[] {
    const activeConnections: string[] = [];
    
    for (const [key, ws] of this.connections.entries()) {
      if (ws.readyState === WebSocket.OPEN) {
        activeConnections.push(key);
      }
    }
    
    return activeConnections;
  }

  /**
   * 发送文件列表请求
   */
  requestFileList(connectionKey: string, path: string): string {
    const operationId = this.generateOperationId();
    
    const message: WebSocketMessage = {
      type: 'file_list',
      id: operationId,
      path
    } as any;

    // 创建文件操作跟踪
    this.trackFileOperation({
      id: operationId,
      type: 'list',
      path,
      status: 'pending',
      startTime: Date.now()
    });

    this.send(connectionKey, message, 1); // 高优先级
    return operationId;
  }

  /**
   * 发送文件下载请求
   */
  requestFileDownload(connectionKey: string, path: string): string {
    const operationId = this.generateOperationId();
    
    const message: WebSocketMessage = {
      type: 'file_get',
      id: operationId,
      path
    } as any;

    // 创建文件操作跟踪
    this.trackFileOperation({
      id: operationId,
      type: 'download',
      path,
      status: 'pending',
      startTime: Date.now()
    });

    this.send(connectionKey, message, 1); // 高优先级
    return operationId;
  }

  /**
   * 发送文件上传请求
   */
  requestFileUpload(connectionKey: string, path: string, content: string): string {
    const operationId = this.generateOperationId();
    
    const message: WebSocketMessage = {
      type: 'file_put',
      id: operationId,
      path,
      content
    } as any;

    // 创建文件操作跟踪
    this.trackFileOperation({
      id: operationId,
      type: 'upload',
      path,
      status: 'pending',
      totalSize: content.length,
      transferredSize: 0,
      startTime: Date.now()
    });

    this.send(connectionKey, message, 1); // 高优先级
    return operationId;
  }

  /**
   * 添加文件操作处理器
   */
  onFileOperation(connectionKey: string, handler: FileOperationHandler): void {
    if (!this.fileOperationHandlers.has(connectionKey)) {
      this.fileOperationHandlers.set(connectionKey, new Set());
    }
    this.fileOperationHandlers.get(connectionKey)!.add(handler);
  }

  /**
   * 移除文件操作处理器
   */
  offFileOperation(connectionKey: string, handler: FileOperationHandler): void {
    const handlers = this.fileOperationHandlers.get(connectionKey);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.fileOperationHandlers.delete(connectionKey);
      }
    }
  }

  /**
   * 获取文件操作状态
   */
  getFileOperationStatus(operationId: string): FileOperationProgress | null {
    return this.fileOperations.get(operationId) || null;
  }

  /**
   * 获取所有进行中的文件操作
   */
  getActiveFileOperations(): FileOperationProgress[] {
    return Array.from(this.fileOperations.values())
      .filter(op => op.status === 'pending' || op.status === 'progress');
  }

  /**
   * 清理所有连接和资源
   */
  cleanup(): void {
    // 断开所有连接
    for (const connectionKey of this.connections.keys()) {
      this.disconnect(connectionKey);
    }

    // 清理所有处理器
    this.messageHandlers.clear();
    this.statusHandlers.clear();
    this.fileOperationHandlers.clear();
    this.connectionStatus.clear();
    this.fileOperations.clear();
  }

  // 私有方法

  private getConnectionKey(deviceId: string, sessionId: string): string {
    return `${deviceId}:${sessionId}`;
  }

  private buildWebSocketUrl(deviceId: string, sessionId: string): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = this.baseUrl || window.location.host;
    return `${protocol}//${host}/ws/${deviceId}/${sessionId}`;
  }

  private handleMessage(connectionKey: string, event: MessageEvent): void {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      
      // 处理心跳消息
      if (message.type === 'heartbeat') {
        this.handleHeartbeat(connectionKey, message);
        return;
      }

      // 处理文件操作结果消息
      if (this.isFileOperationMessage(message)) {
        this.handleFileOperationMessage(connectionKey, message);
      }

      // 分发消息给处理器
      const handlers = this.messageHandlers.get(connectionKey);
      if (handlers) {
        handlers.forEach(handler => {
          try {
            handler(message);
          } catch (error) {
            console.error('Message handler error:', error);
          }
        });
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }

  private handleConnectionClose(connectionKey: string, event: CloseEvent): void {
    console.log(`WebSocket connection closed: ${connectionKey}`, event);
    
    // 停止心跳
    this.stopHeartbeat(connectionKey);
    
    // 移除连接
    this.connections.delete(connectionKey);
    
    // 更新状态
    this.updateConnectionStatus(connectionKey, {
      status: 'disconnected',
      reconnectAttempts: this.connectionStatus.get(connectionKey)?.reconnectAttempts || 0
    });

    // 如果不是正常关闭，尝试重连
    if (event.code !== 1000) {
      this.handleReconnect(connectionKey);
    }
  }

  private handleConnectionError(connectionKey: string, error: Event): void {
    console.error(`WebSocket connection error: ${connectionKey}`, error);
    
    // 更新状态
    this.updateConnectionStatus(connectionKey, {
      status: 'error',
      error: 'Connection error',
      reconnectAttempts: this.connectionStatus.get(connectionKey)?.reconnectAttempts || 0
    });

    // 尝试重连
    this.handleReconnect(connectionKey);
  }

  private handleReconnect(connectionKey: string): void {
    const status = this.connectionStatus.get(connectionKey);
    if (!status) return;

    const reconnectAttempts = status.reconnectAttempts + 1;
    
    if (reconnectAttempts <= this.config.maxReconnectAttempts) {
      // 计算重连延迟（指数退避）
      const delay = this.config.reconnectDelay * Math.pow(2, reconnectAttempts - 1);
      
      console.log(`Attempting to reconnect ${connectionKey} (attempt ${reconnectAttempts}/${this.config.maxReconnectAttempts}) in ${delay}ms`);
      
      // 更新重连次数
      this.updateConnectionStatus(connectionKey, {
        ...status,
        reconnectAttempts
      });

      // 设置重连定时器
      const timeoutId = setTimeout(() => {
        this.reconnectTimeouts.delete(connectionKey);
        
        // 解析连接键获取设备ID和会话ID
        const [deviceId, sessionId] = connectionKey.split(':');
        if (deviceId && sessionId) {
          this.connect(deviceId, sessionId).catch(error => {
            console.error(`Reconnection failed for ${connectionKey}:`, error);
          });
        }
      }, delay);
      
      this.reconnectTimeouts.set(connectionKey, timeoutId);
    } else {
      console.error(`Max reconnection attempts reached for ${connectionKey}`);
      this.updateConnectionStatus(connectionKey, {
        ...status,
        status: 'error',
        error: 'Max reconnection attempts reached'
      });
    }
  }

  private startHeartbeat(connectionKey: string): void {
    this.stopHeartbeat(connectionKey);
    
    const intervalId = setInterval(() => {
      const heartbeatMessage: WebSocketMessage = {
        type: 'heartbeat',
        timestamp: Date.now()
      };
      
      if (!this.send(connectionKey, heartbeatMessage)) {
        console.warn(`Failed to send heartbeat for ${connectionKey}`);
      }
    }, this.config.heartbeatInterval);
    
    this.heartbeatIntervals.set(connectionKey, intervalId);
  }

  private stopHeartbeat(connectionKey: string): void {
    const intervalId = this.heartbeatIntervals.get(connectionKey);
    if (intervalId) {
      clearInterval(intervalId);
      this.heartbeatIntervals.delete(connectionKey);
    }
  }

  private handleHeartbeat(connectionKey: string, message: WebSocketMessage): void {
    // 心跳响应，更新最后活动时间
    const status = this.connectionStatus.get(connectionKey);
    if (status) {
      this.updateConnectionStatus(connectionKey, {
        ...status,
        lastConnected: Date.now()
      });
    }
  }

  private queueMessage(connectionKey: string, message: WebSocketMessage, priority: number): void {
    if (!this.messageQueues.has(connectionKey)) {
      this.messageQueues.set(connectionKey, []);
    }
    
    const queue = this.messageQueues.get(connectionKey)!;
    const queuedMessage: QueuedMessage = {
      message,
      priority,
      timestamp: Date.now(),
      retries: 0
    };
    
    // 按优先级插入队列
    let insertIndex = queue.length;
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].priority < priority) {
        insertIndex = i;
        break;
      }
    }
    
    queue.splice(insertIndex, 0, queuedMessage);
    
    // 限制队列大小
    const maxQueueSize = 100;
    if (queue.length > maxQueueSize) {
      queue.splice(maxQueueSize);
    }
  }

  private processMessageQueue(connectionKey: string): void {
    const queue = this.messageQueues.get(connectionKey);
    if (!queue || queue.length === 0) return;
    
    const ws = this.connections.get(connectionKey);
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    // 处理队列中的消息
    const messagesToProcess = [...queue];
    queue.length = 0; // 清空队列
    
    for (const queuedMessage of messagesToProcess) {
      if (!this.send(connectionKey, queuedMessage.message)) {
        // 如果发送失败，重新加入队列
        queuedMessage.retries++;
        if (queuedMessage.retries < 3) {
          queue.push(queuedMessage);
        }
      }
    }
  }

  private updateConnectionStatus(connectionKey: string, status: Partial<ConnectionStatus>): void {
    const currentStatus = this.connectionStatus.get(connectionKey) || {
      status: 'disconnected',
      reconnectAttempts: 0
    };
    
    const newStatus = { ...currentStatus, ...status };
    this.connectionStatus.set(connectionKey, newStatus);
    
    // 通知状态处理器
    const handlers = this.statusHandlers.get(connectionKey);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(newStatus);
        } catch (error) {
          console.error('Status handler error:', error);
        }
      });
    }
  }

  // 文件操作相关私有方法

  private generateOperationId(): string {
    return `file-op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private isFileOperationMessage(message: WebSocketMessage): boolean {
    return ['file_list_result', 'file_get_result', 'file_put_result'].includes(message.type);
  }

  private handleFileOperationMessage(connectionKey: string, message: WebSocketMessage): void {
    const messageWithId = message as any;
    const operationId = messageWithId.id;
    
    if (!operationId) return;

    const operation = this.fileOperations.get(operationId);
    if (!operation) return;

    // 更新操作状态
    let updatedOperation: FileOperationProgress;

    switch (message.type) {
      case 'file_list_result':
        updatedOperation = {
          ...operation,
          status: messageWithId.files ? 'success' : 'error',
          error: messageWithId.error,
          endTime: Date.now()
        };
        break;

      case 'file_get_result':
        updatedOperation = {
          ...operation,
          status: messageWithId.content !== undefined ? 'success' : 'error',
          error: messageWithId.error,
          transferredSize: messageWithId.content?.length || 0,
          endTime: Date.now()
        };
        break;

      case 'file_put_result':
        updatedOperation = {
          ...operation,
          status: messageWithId.success ? 'success' : 'error',
          error: messageWithId.error,
          transferredSize: operation.totalSize,
          progress: messageWithId.success ? 100 : operation.progress,
          endTime: Date.now()
        };
        break;

      default:
        return;
    }

    // 更新操作记录
    this.fileOperations.set(operationId, updatedOperation);

    // 通知文件操作处理器
    this.notifyFileOperationHandlers(connectionKey, updatedOperation);

    // 清理已完成的操作（延迟清理以允许状态查询）
    if (updatedOperation.status === 'success' || updatedOperation.status === 'error') {
      setTimeout(() => {
        this.fileOperations.delete(operationId);
      }, 30000); // 30秒后清理
    }
  }

  private trackFileOperation(operation: FileOperationProgress): void {
    this.fileOperations.set(operation.id, operation);
  }

  private notifyFileOperationHandlers(connectionKey: string, operation: FileOperationProgress): void {
    const handlers = this.fileOperationHandlers.get(connectionKey);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(operation);
        } catch (error) {
          console.error('File operation handler error:', error);
        }
      });
    }
  }
}

// 创建单例实例
// Extract host from VITE_API_BASE_URL or use current location
const getWebSocketHost = (): string => {
  const apiUrl = import.meta.env.VITE_API_BASE_URL;

  if (apiUrl && apiUrl !== '/api') {
    // Extract host from full URL (e.g., "https://api.example.com" -> "api.example.com")
    try {
      const url = new URL(apiUrl);
      return url.host;
    } catch {
      // If it's just a relative path, use window.location.host
      return window.location.host;
    }
  }

  // Development mode or no custom URL
  if (import.meta.env.DEV) {
    return 'localhost:8787';
  }

  return window.location.host;
};

export const webSocketManager = new WebSocketManager(getWebSocketHost());

export default WebSocketManager;