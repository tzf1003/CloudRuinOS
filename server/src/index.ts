/**
 * Ruinos Server - Cloudflare Workers API
 * 轻量化远程监控和管理系统服务端
 */

import { createRouter } from './api/routes';
import { validateSecrets, getEnvironmentConfig, type Environment } from './config/secrets';
import { addCorsHeaders } from './middleware/cors';
import { verifyEd25519Signature } from './api/utils/crypto';
import { getDeviceById } from './api/utils/database';
import { NotificationService } from './monitoring/notifications';

export interface Env extends Environment {}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      // Validate secrets on startup
      const secrets = validateSecrets(env);
      const config = getEnvironmentConfig(env);
      
      // Add secrets and config to env for use in handlers
      (env as any).secrets = secrets;
      (env as any).config = config;
      
      const router = createRouter();
      
      // 使用路由处理请求
      const response = await router.handle(request, env, ctx);
      
      // 添加 CORS 头
      return addCorsHeaders(response);
    } catch (error) {
      console.error('Request handling error:', error);
      
      // If it's a secrets validation error, return specific error
      if (error instanceof Error && error.message.includes('Missing required secrets')) {
        const errorResponse = new Response(JSON.stringify({
          error: 'Configuration error',
          message: error.message,
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
        return addCorsHeaders(errorResponse);
      }
      
      const errorResponse = new Response(JSON.stringify({
        error: 'Internal server error',
        message: 'An unexpected error occurred',
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
      return addCorsHeaders(errorResponse);
    }
  },
};

// Durable Object 会话管理实现
export class SessionDurableObject {
  private sessions: Map<string, WebSocket> = new Map();
  private deviceSessions: Map<string, string> = new Map(); // deviceId -> sessionId
  private sessionMetadata: Map<string, SessionMetadata> = new Map();
  private cleanupInterval: number | null = null;
  private notificationService: NotificationService;

  constructor(private state: DurableObjectState, private env: Env) {
    // 初始化通知服务
    this.notificationService = new NotificationService(env);
    // 启动定期清理任务
    this.startCleanupTask();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    // WebSocket 升级请求
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocketUpgrade(request);
    }
    
    // HTTP API 请求
    if (url.pathname === '/session/create') {
      return this.handleSessionCreate(request);
    }
    
    if (url.pathname === '/session/status') {
      return this.getSessionStatus();
    }
    
    if (url.pathname === '/session/cleanup') {
      return this.forceCleanup();
    }
    
    if (url.pathname === '/message') {
      return this.handleMessage(request);
    }
    
    return new Response('Not Found', { status: 404 });
  }

  /**
   * 处理会话创建请求
   */
  private async handleSessionCreate(request: Request): Promise<Response> {
    try {
      const sessionData = await request.json() as SessionData;
      
      // 存储会话数据到 Durable Object 存储
      await this.state.storage.put(`session:${sessionData.sessionId}`, sessionData);
      
      return new Response(JSON.stringify({
        success: true,
        sessionId: sessionData.sessionId,
        message: 'Session created successfully'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Session creation error:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to create session'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  /**
   * 处理 WebSocket 升级请求
   */
  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId');
    const deviceId = url.searchParams.get('deviceId');
    const signature = url.searchParams.get('signature');
    const timestamp = url.searchParams.get('timestamp');
    
    if (!sessionId || !deviceId || !signature || !timestamp) {
      return new Response('Missing required parameters', { status: 400 });
    }
    
    // 验证时间戳（防重放攻击）
    const requestTimestamp = parseInt(timestamp, 10);
    const now = Date.now();
    const maxAge = 300000; // 5 分钟
    if (isNaN(requestTimestamp) || Math.abs(now - requestTimestamp) > maxAge) {
      return new Response('Invalid or expired timestamp', { status: 400 });
    }
    
    // 验证会话是否存在且有效
    const sessionData = await this.state.storage.get(`session:${sessionId}`);
    if (!sessionData) {
      return new Response('Session not found', { status: 404 });
    }
    
    const session = sessionData as SessionData;
    if (session.deviceId !== deviceId) {
      return new Response('Device ID mismatch', { status: 403 });
    }
    
    if (Date.now() > session.expiresAt) {
      await this.state.storage.delete(`session:${sessionId}`);
      return new Response('Session expired', { status: 410 });
    }
    
    // 验证 Ed25519 签名
    const signatureValid = await this.verifyWebSocketSignature(
      deviceId,
      sessionId,
      requestTimestamp,
      signature
    );
    
    if (!signatureValid) {
      return new Response('Invalid signature', { status: 401 });
    }
    
    // 创建 WebSocket 连接
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);
    
    // 接受 WebSocket 连接
    server.accept();
    
    // 存储会话信息
    this.sessions.set(sessionId, server);
    this.deviceSessions.set(deviceId, sessionId);
    this.sessionMetadata.set(sessionId, {
      deviceId,
      connectedAt: Date.now(),
      lastActivity: Date.now(),
      status: 'connected'
    });
    
    // 设置 WebSocket 事件处理器
    this.setupWebSocketHandlers(server, sessionId, deviceId);
    
    // 更新会话状态到持久存储
    await this.state.storage.put(`session:${sessionId}`, {
      ...session,
      status: 'connected',
      connectedAt: Date.now()
    });
    
    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  /**
   * 设置 WebSocket 事件处理器
   */
  private setupWebSocketHandlers(ws: WebSocket, sessionId: string, deviceId: string) {
    ws.addEventListener('message', async (event) => {
      try {
        const message = JSON.parse(event.data as string);
        await this.handleWebSocketMessage(ws, sessionId, deviceId, message);
      } catch (error) {
        console.error('WebSocket message handling error:', error);
        ws.send(JSON.stringify({
          type: 'error',
          code: 'INVALID_MESSAGE',
          message: 'Invalid message format'
        }));
      }
    });

    ws.addEventListener('close', async () => {
      await this.handleWebSocketClose(sessionId, deviceId);
    });

    ws.addEventListener('error', async (error) => {
      console.error('WebSocket error:', error);
      await this.handleWebSocketClose(sessionId, deviceId);
    });
  }

  /**
   * 处理 WebSocket 消息
   */
  private async handleWebSocketMessage(
    ws: WebSocket, 
    sessionId: string, 
    deviceId: string, 
    message: WSMessage
  ) {
    // 更新最后活动时间
    const metadata = this.sessionMetadata.get(sessionId);
    if (metadata) {
      metadata.lastActivity = Date.now();
    }

    switch (message.type) {
      case 'auth':
        await this.handleAuthMessage(ws, sessionId, deviceId, message);
        break;
      
      case 'cmd_result':
        await this.handleCommandResult(ws, sessionId, deviceId, message);
        break;
      
      case 'fs_list_result':
      case 'fs_get_result':
      case 'fs_put_result':
        await this.handleFileOperationResult(ws, sessionId, deviceId, message);
        break;
      
      case 'presence':
        await this.handlePresenceUpdate(ws, sessionId, deviceId, message);
        break;
      
      case 'error':
        await this.handleErrorMessage(ws, sessionId, deviceId, message);
        break;
      
      default:
        ws.send(JSON.stringify({
          type: 'error',
          code: 'UNKNOWN_MESSAGE_TYPE',
          message: `Unknown message type: ${(message as any).type}`
        }));
    }
  }

  /**
   * 处理认证消息
   */
  private async handleAuthMessage(
    ws: WebSocket, 
    sessionId: string, 
    deviceId: string, 
    message: AuthMessage
  ) {
    // 验证 deviceId 匹配
    if (message.deviceId !== deviceId) {
      ws.send(JSON.stringify({
        type: 'error',
        code: 'AUTH_FAILED',
        message: 'Device ID mismatch'
      }));
      ws.close(1008, 'Authentication failed');
      return;
    }
    
    // 验证 Ed25519 签名
    // 签名格式: timestamp:signature
    const signatureParts = message.signature.split(':');
    if (signatureParts.length !== 2) {
      ws.send(JSON.stringify({
        type: 'error',
        code: 'AUTH_FAILED',
        message: 'Invalid signature format'
      }));
      ws.close(1008, 'Authentication failed');
      return;
    }
    
    const [timestampStr, signature] = signatureParts;
    const timestamp = parseInt(timestampStr, 10);
    
    // 验证时间戳（防重放攻击，5分钟窗口）
    const now = Date.now();
    const maxAge = 300000;
    if (isNaN(timestamp) || Math.abs(now - timestamp) > maxAge) {
      ws.send(JSON.stringify({
        type: 'error',
        code: 'AUTH_FAILED',
        message: 'Timestamp expired or invalid'
      }));
      ws.close(1008, 'Authentication failed');
      return;
    }
    
    // 获取设备公钥并验证签名
    const signatureValid = await this.verifyAuthSignature(deviceId, timestamp, signature);
    
    if (!signatureValid) {
      ws.send(JSON.stringify({
        type: 'error',
        code: 'AUTH_FAILED',
        message: 'Signature verification failed'
      }));
      ws.close(1008, 'Authentication failed');
      return;
    }
    
    // 认证成功
    ws.send(JSON.stringify({
      type: 'auth_success',
      sessionId,
      serverTime: Date.now()
    }));
    
    // 更新会话状态
    const metadata = this.sessionMetadata.get(sessionId);
    if (metadata) {
      metadata.status = 'authenticated';
    }
  }

  /**
   * 处理命令执行结果
   */
  private async handleCommandResult(
    ws: WebSocket, 
    sessionId: string, 
    deviceId: string, 
    message: CommandResultMessage
  ) {
    // 记录审计日志
    await this.logAuditEvent(deviceId, sessionId, 'command_result', {
      commandId: message.id,
      exitCode: message.exitCode,
      stdout: message.stdout?.substring(0, 1000), // 限制日志长度
      stderr: message.stderr?.substring(0, 1000)
    });
    
    // 转发命令结果到管理端
    await this.forwardCommandResultToAdmin(deviceId, sessionId, message);
    
    // 如果命令执行失败，发送通知
    if (message.exitCode !== 0) {
      await this.notificationService.notifyCommandFailed(
        deviceId,
        message.id,
        'command_execute',
        message.stderr || `Exit code: ${message.exitCode}`
      );
    }
  }

  /**
   * 转发命令结果到管理端
   * 通过 KV 存储命令结果，管理端可通过轮询或 WebSocket 获取
   */
  private async forwardCommandResultToAdmin(
    deviceId: string,
    sessionId: string,
    message: CommandResultMessage
  ): Promise<void> {
    try {
      // 存储命令结果到 KV，供管理端获取
      const resultKey = `cmd_result:${message.id}`;
      const resultData = {
        commandId: message.id,
        deviceId,
        sessionId,
        exitCode: message.exitCode,
        stdout: message.stdout,
        stderr: message.stderr,
        completedAt: Date.now(),
      };
      
      await this.env.KV.put(resultKey, JSON.stringify(resultData), {
        expirationTtl: 3600, // 1 小时过期
      });

      // 将结果 ID 添加到设备的结果队列中
      const queueKey = `cmd_result_queue:${deviceId}`;
      const existingQueue = await this.env.KV.get<string[]>(queueKey, 'json') || [];
      existingQueue.push(message.id);
      
      // 只保留最近 50 条结果
      if (existingQueue.length > 50) {
        existingQueue.splice(0, existingQueue.length - 50);
      }
      
      await this.env.KV.put(queueKey, JSON.stringify(existingQueue), {
        expirationTtl: 3600,
      });

      // 通过 WebSocket 广播给在线的管理端 (如果有连接)
      await this.broadcastToAdminSessions({
        type: 'command_result',
        deviceId,
        commandId: message.id,
        exitCode: message.exitCode,
        stdout: message.stdout?.substring(0, 500),
        stderr: message.stderr?.substring(0, 500),
        timestamp: Date.now(),
      });
      
    } catch (error) {
      console.error('Failed to forward command result:', error);
    }
  }

  /**
   * 广播消息到所有管理端会话
   */
  private async broadcastToAdminSessions(message: any): Promise<void> {
    // 遍历所有活动会话，向管理端会话发送消息
    for (const [sessionId, ws] of this.sessions.entries()) {
      try {
        const metadata = this.sessionMetadata.get(sessionId);
        // 检查是否是管理端会话 (可以通过 metadata 标记区分)
        if (metadata?.status === 'connected' || metadata?.status === 'authenticated') {
          ws.send(JSON.stringify(message));
        }
      } catch (error) {
        console.error(`Failed to broadcast to session ${sessionId}:`, error);
      }
    }
  }

  /**
   * 处理文件操作结果
   */
  private async handleFileOperationResult(
    ws: WebSocket, 
    sessionId: string, 
    deviceId: string, 
    message: FileOperationResultMessage
  ) {
    const success = 'success' in message ? message.success : true;
    const errorMessage = 'error' in message ? (message as any).error : undefined;
    
    // 记录审计日志
    await this.logAuditEvent(deviceId, sessionId, 'file_operation_result', {
      operationId: message.id,
      operationType: message.type,
      success
    });
    
    // 转发文件操作结果到管理端
    await this.forwardFileOperationResultToAdmin(deviceId, sessionId, message, success);
    
    // 如果操作失败，发送通知
    if (!success) {
      await this.notificationService.notifyCommandFailed(
        deviceId,
        message.id,
        `file_${message.type}`,
        errorMessage || `File operation ${message.type} failed`
      );
    }
  }

  /**
   * 转发文件操作结果到管理端
   */
  private async forwardFileOperationResultToAdmin(
    deviceId: string,
    sessionId: string,
    message: FileOperationResultMessage,
    success: boolean
  ): Promise<void> {
    try {
      // 存储文件操作结果到 KV
      const resultKey = `file_result:${message.id}`;
      const resultData = {
        operationId: message.id,
        deviceId,
        sessionId,
        type: message.type,
        success,
        data: 'data' in message ? message.data : undefined,
        error: 'error' in message ? (message as any).error : undefined,
        completedAt: Date.now(),
      };
      
      await this.env.KV.put(resultKey, JSON.stringify(resultData), {
        expirationTtl: 3600,
      });

      // 广播给管理端
      await this.broadcastToAdminSessions({
        type: 'file_operation_result',
        deviceId,
        operationId: message.id,
        operationType: message.type,
        success,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Failed to forward file operation result:', error);
    }
  }

  /**
   * 处理状态更新
   */
  private async handlePresenceUpdate(
    ws: WebSocket, 
    sessionId: string, 
    deviceId: string, 
    message: PresenceMessage
  ) {
    const metadata = this.sessionMetadata.get(sessionId);
    if (metadata) {
      // 映射 PresenceMessage 状态到 SessionMetadata 状态
      switch (message.status) {
        case 'online':
          metadata.status = 'connected';
          break;
        case 'busy':
          metadata.status = 'busy';
          break;
        case 'idle':
          metadata.status = 'idle';
          break;
        default:
          // 保持当前状态不变
          break;
      }
    }
  }

  /**
   * 处理错误消息
   */
  private async handleErrorMessage(
    ws: WebSocket, 
    sessionId: string, 
    deviceId: string, 
    message: ErrorMessage
  ) {
    // 记录错误到审计日志
    await this.logAuditEvent(deviceId, sessionId, 'agent_error', {
      errorCode: message.code,
      errorMessage: message.message
    });
  }

  /**
   * 处理 WebSocket 连接关闭
   */
  private async handleWebSocketClose(sessionId: string, deviceId: string) {
    // 清理内存中的会话信息
    this.sessions.delete(sessionId);
    this.deviceSessions.delete(deviceId);
    this.sessionMetadata.delete(sessionId);
    
    // 更新持久存储中的会话状态
    const sessionData = await this.state.storage.get(`session:${sessionId}`);
    if (sessionData) {
      await this.state.storage.put(`session:${sessionId}`, {
        ...(sessionData as SessionData),
        status: 'disconnected',
        disconnectedAt: Date.now()
      });
    }
    
    // 记录审计日志
    await this.logAuditEvent(deviceId, sessionId, 'session_disconnected', {
      reason: 'websocket_closed'
    });
    
    // 通知管理端设备离线
    await this.notifyDeviceOffline(deviceId, sessionId);
  }

  /**
   * 通知管理端设备离线
   */
  private async notifyDeviceOffline(deviceId: string, sessionId: string): Promise<void> {
    try {
      // 获取设备元数据
      const metadata = this.sessionMetadata.get(sessionId);
      const lastSeen = Date.now();
      const platform = metadata?.platform || 'unknown';
      
      // 发送设备离线通知
      await this.notificationService.notifyDeviceOffline(deviceId, lastSeen, platform);
      
      // 广播给在线的管理端会话
      await this.broadcastToAdminSessions({
        type: 'device_status',
        deviceId,
        status: 'offline',
        sessionId,
        timestamp: Date.now(),
      });
      
      // 更新 KV 中的设备状态
      const statusKey = `device_status:${deviceId}`;
      await this.env.KV.put(statusKey, JSON.stringify({
        deviceId,
        status: 'offline',
        lastSeen: Date.now(),
      }), {
        expirationTtl: 86400, // 24 小时过期
      });
    } catch (error) {
      console.error('Failed to notify device offline:', error);
    }
  }

  /**
   * 处理消息发送请求
   */
  private async handleMessage(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const deviceId = url.searchParams.get('deviceId');
      
      if (!deviceId) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Missing deviceId parameter'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      const message = await request.json() as WSMessage;
      
      // 查找对应的会话
      const targetSessionId = this.deviceSessions.get(deviceId);
      
      // 如果没有找到会话，返回错误
      if (!targetSessionId) {
        return new Response(JSON.stringify({
          success: false,
          error: 'No active session found for device'
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // 获取 WebSocket 连接
      const ws = this.sessions.get(targetSessionId);
      if (!ws) {
        return new Response(JSON.stringify({
          success: false,
          error: 'WebSocket connection not found'
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // 发送消息到 Agent
      ws.send(JSON.stringify(message));
      
      // 更新最后活动时间
      const metadata = this.sessionMetadata.get(targetSessionId);
      if (metadata) {
        metadata.lastActivity = Date.now();
      }
      
      return new Response(JSON.stringify({
        success: true,
        message: 'Message sent successfully'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      console.error('Message handling error:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to handle message'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  /**
   * 获取会话状态
   */
  private async getSessionStatus(): Promise<Response> {
    const activeSessions = Array.from(this.sessionMetadata.entries()).map(([sessionId, metadata]) => ({
      sessionId,
      deviceId: metadata.deviceId,
      status: metadata.status,
      connectedAt: metadata.connectedAt,
      lastActivity: metadata.lastActivity
    }));
    
    return new Response(JSON.stringify({
      activeSessions,
      totalSessions: activeSessions.length,
      timestamp: Date.now()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * 强制清理过期会话
   */
  private async forceCleanup(): Promise<Response> {
    const cleaned = await this.cleanupExpiredSessions();
    return new Response(JSON.stringify({
      message: 'Cleanup completed',
      cleanedSessions: cleaned,
      timestamp: Date.now()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * 启动定期清理任务
   */
  private startCleanupTask() {
    // 每5分钟清理一次过期会话
    this.cleanupInterval = setInterval(async () => {
      await this.cleanupExpiredSessions();
    }, 5 * 60 * 1000) as any;
  }

  /**
   * 清理过期会话
   */
  private async cleanupExpiredSessions(): Promise<number> {
    const now = Date.now();
    const sessionTimeout = parseInt(this.env.SESSION_TIMEOUT || '1800000'); // 默认30分钟
    let cleanedCount = 0;
    
    // 清理内存中的过期会话
    for (const [sessionId, metadata] of this.sessionMetadata.entries()) {
      if (now - metadata.lastActivity > sessionTimeout) {
        const ws = this.sessions.get(sessionId);
        if (ws) {
          ws.close(1000, 'Session timeout');
        }
        
        this.sessions.delete(sessionId);
        this.deviceSessions.delete(metadata.deviceId);
        this.sessionMetadata.delete(sessionId);
        
        // 更新持久存储
        const sessionData = await this.state.storage.get(`session:${sessionId}`);
        if (sessionData) {
          await this.state.storage.put(`session:${sessionId}`, {
            ...(sessionData as SessionData),
            status: 'expired',
            expiredAt: now
          });
        }
        
        cleanedCount++;
      }
    }
    
    return cleanedCount;
  }

  /**
   * 验证 WebSocket 升级请求的签名
   */
  private async verifyWebSocketSignature(
    deviceId: string,
    sessionId: string,
    timestamp: number,
    signature: string
  ): Promise<boolean> {
    try {
      // 获取设备公钥
      const device = await getDeviceById(this.env.DB, deviceId);
      if (!device || !device.public_key) {
        console.error('Device not found or missing public key:', deviceId);
        return false;
      }
      
      // 构造签名数据：sessionId:deviceId:timestamp
      const signatureData = `${sessionId}:${deviceId}:${timestamp}`;
      
      // 验证 Ed25519 签名
      return await verifyEd25519Signature(device.public_key, signature, signatureData);
    } catch (error) {
      console.error('WebSocket signature verification failed:', error);
      return false;
    }
  }

  /**
   * 验证认证消息的签名
   */
  private async verifyAuthSignature(
    deviceId: string,
    timestamp: number,
    signature: string
  ): Promise<boolean> {
    try {
      // 获取设备公钥
      const device = await getDeviceById(this.env.DB, deviceId);
      if (!device || !device.public_key) {
        console.error('Device not found or missing public key:', deviceId);
        return false;
      }
      
      // 构造签名数据：deviceId:timestamp
      const signatureData = `${deviceId}:${timestamp}`;
      
      // 验证 Ed25519 签名
      return await verifyEd25519Signature(device.public_key, signature, signatureData);
    } catch (error) {
      console.error('Auth signature verification failed:', error);
      return false;
    }
  }

  /**
   * 记录审计日志
   */
  private async logAuditEvent(
    deviceId: string, 
    sessionId: string, 
    actionType: string, 
    actionData: any
  ) {
    try {
      // 通过 KV 存储临时审计事件，后续由定期任务写入 D1
      const auditEvent = {
        deviceId,
        sessionId,
        actionType,
        actionData,
        timestamp: Date.now()
      };
      
      const auditKey = `audit:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
      await this.env.KV.put(auditKey, JSON.stringify(auditEvent), {
        expirationTtl: 86400 // 24小时过期
      });
    } catch (error) {
      console.error('Failed to log audit event:', error);
    }
  }
}

// 类型定义
interface SessionData {
  sessionId: string;
  deviceId: string;
  durableObjectId: string;
  status: 'pending' | 'connected' | 'disconnected' | 'expired';
  createdAt: number;
  expiresAt: number;
  connectedAt?: number;
  disconnectedAt?: number;
  expiredAt?: number;
}

interface SessionMetadata {
  deviceId: string;
  connectedAt: number;
  lastActivity: number;
  status: 'connected' | 'authenticated' | 'busy' | 'idle';
  platform?: string;
}

// WebSocket 消息类型
type WSMessage = 
  | AuthMessage
  | CommandMessage
  | CommandResultMessage
  | FileListMessage
  | FileListResultMessage
  | FileGetMessage
  | FileGetResultMessage
  | FilePutMessage
  | FilePutResultMessage
  | PresenceMessage
  | ErrorMessage
  | AuditRefMessage;

interface AuthMessage {
  type: 'auth';
  deviceId: string;
  signature: string;
}

interface CommandMessage {
  type: 'cmd';
  id: string;
  command: string;
  args: string[];
}

interface CommandResultMessage {
  type: 'cmd_result';
  id: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface FileListMessage {
  type: 'fs_list';
  id: string;
  path: string;
}

interface FileListResultMessage {
  type: 'fs_list_result';
  id: string;
  files: FileInfo[];
}

interface FileGetMessage {
  type: 'fs_get';
  id: string;
  path: string;
}

interface FileGetResultMessage {
  type: 'fs_get_result';
  id: string;
  content: string;
  checksum: string;
}

interface FilePutMessage {
  type: 'fs_put';
  id: string;
  path: string;
  content: string;
  checksum: string;
}

interface FilePutResultMessage {
  type: 'fs_put_result';
  id: string;
  success: boolean;
  error?: string;
}

interface PresenceMessage {
  type: 'presence';
  status: 'online' | 'busy' | 'idle';
}

interface ErrorMessage {
  type: 'error';
  code: string;
  message: string;
}

interface AuditRefMessage {
  type: 'audit_ref';
  logId: number;
}

interface FileInfo {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  modified: number;
  permissions?: string;
}

type FileOperationResultMessage = FileListResultMessage | FileGetResultMessage | FilePutResultMessage;