/**
 * 文件管理 API 处理器
 * 实现文件列表、下载、上传功能
 * Requirements: 5.1, 5.2, 5.3
 */

import { Env } from '../../index';
import { createAuditService } from '../utils/audit';

// 文件操作请求接口
interface FileListRequest {
  device_id: string;
  path: string;
  session_id?: string;
}

interface FileDownloadRequest {
  device_id: string;
  path: string;
  session_id?: string;
}

interface FileUploadRequest {
  device_id: string;
  path: string;
  content: string;
  checksum: string;
  session_id?: string;
}

// 文件操作响应接口
interface FileInfo {
  path: string;
  size: number;
  is_dir: boolean;
  modified?: number;
}

interface FileListResponse {
  success: boolean;
  files?: FileInfo[];
  error?: string;
}

interface FileDownloadResponse {
  success: boolean;
  content?: string;
  checksum?: string;
  error?: string;
}

interface FileUploadResponse {
  success: boolean;
  error?: string;
}

// WebSocket 消息类型
interface WSMessage {
  type: string;
  id: string;
  [key: string]: any;
}

/**
 * 文件列表 API 处理器
 * POST /files/list
 */
export async function listFiles(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  try {
    const body = await request.json() as FileListRequest;
    
    // 验证请求参数
    if (!body.device_id || !body.path) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required parameters: device_id and path'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 验证设备是否存在
    const device = await env.DB.prepare(
      'SELECT id, status FROM devices WHERE id = ?'
    ).bind(body.device_id).first();

    if (!device) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Device not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (device.status !== 'online') {
      return new Response(JSON.stringify({
        success: false,
        error: 'Device is not online'
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 获取活跃会话
    const session = await getActiveSession(env, body.device_id, body.session_id);
    if (!session) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No active session found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 生成操作 ID
    const operationId = generateOperationId();

    // 通过 WebSocket 发送文件列表请求
    const wsMessage: WSMessage = {
      type: 'fs_list',
      id: operationId,
      path: body.path
    };

    const success = await sendWebSocketMessage(env, session.durable_object_id, body.device_id, wsMessage);
    if (!success) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to send command to device'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 记录审计日志
    const auditService = createAuditService(env);
    await auditService.logFileOperation(
      body.device_id,
      session.id,
      'list',
      body.path,
      operationId,
      undefined,
      undefined,
      undefined,
      'success'
    );

    return new Response(JSON.stringify({
      success: true,
      operation_id: operationId,
      message: 'File list request sent to device'
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('File list error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * 文件下载 API 处理器
 * GET /files/download
 */
export async function downloadFile(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const device_id = url.searchParams.get('device_id');
    const path = url.searchParams.get('path');
    const session_id = url.searchParams.get('session_id');

    // 验证请求参数
    if (!device_id || !path) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required parameters: device_id and path'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 验证设备是否存在
    const device = await env.DB.prepare(
      'SELECT id, status FROM devices WHERE id = ?'
    ).bind(device_id).first();

    if (!device) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Device not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (device.status !== 'online') {
      return new Response(JSON.stringify({
        success: false,
        error: 'Device is not online'
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 获取活跃会话
    const session = await getActiveSession(env, device_id, session_id);
    if (!session) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No active session found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 生成操作 ID
    const operationId = generateOperationId();

    // 通过 WebSocket 发送文件下载请求
    const wsMessage: WSMessage = {
      type: 'fs_get',
      id: operationId,
      path: path
    };

    const success = await sendWebSocketMessage(env, session.durable_object_id, device_id, wsMessage);
    if (!success) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to send command to device'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 记录审计日志
    const auditService = createAuditService(env);
    await auditService.logFileOperation(
      device_id,
      session.id,
      'download',
      path,
      operationId,
      undefined,
      undefined,
      undefined,
      'success'
    );

    return new Response(JSON.stringify({
      success: true,
      operation_id: operationId,
      message: 'File download request sent to device'
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('File download error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * 文件上传 API 处理器
 * POST /files/upload
 */
export async function uploadFile(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  try {
    const body = await request.json() as FileUploadRequest;
    
    // 验证请求参数
    if (!body.device_id || !body.path || !body.content || !body.checksum) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required parameters: device_id, path, content, and checksum'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 验证文件大小限制 (100MB)
    const maxFileSize = 100 * 1024 * 1024; // 100MB in bytes
    const contentSize = new TextEncoder().encode(body.content).length;
    if (contentSize > maxFileSize) {
      return new Response(JSON.stringify({
        success: false,
        error: `File size ${contentSize} exceeds maximum allowed size ${maxFileSize}`
      }), {
        status: 413,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 验证设备是否存在
    const device = await env.DB.prepare(
      'SELECT id, status FROM devices WHERE id = ?'
    ).bind(body.device_id).first();

    if (!device) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Device not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (device.status !== 'online') {
      return new Response(JSON.stringify({
        success: false,
        error: 'Device is not online'
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 获取活跃会话
    const session = await getActiveSession(env, body.device_id, body.session_id);
    if (!session) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No active session found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 生成操作 ID
    const operationId = generateOperationId();

    // 通过 WebSocket 发送文件上传请求
    const wsMessage: WSMessage = {
      type: 'fs_put',
      id: operationId,
      path: body.path,
      content: body.content,
      checksum: body.checksum
    };

    const success = await sendWebSocketMessage(env, session.durable_object_id, body.device_id, wsMessage);
    if (!success) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to send command to device'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 记录文件操作到数据库和审计日志
    const auditService = createAuditService(env);
    await auditService.logFileOperation(
      body.device_id,
      session.id,
      'upload',
      body.path,
      operationId,
      contentSize,
      body.checksum,
      undefined,
      'success'
    );

    return new Response(JSON.stringify({
      success: true,
      operation_id: operationId,
      message: 'File upload request sent to device'
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('File upload error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// 辅助函数

/**
 * 获取活跃会话
 */
async function getActiveSession(env: Env, deviceId: string, sessionId?: string | null): Promise<any> {
  let query = 'SELECT id, durable_object_id FROM sessions WHERE device_id = ? AND status = ?';
  let params = [deviceId, 'active'];

  if (sessionId) {
    query += ' AND id = ?';
    params.push(sessionId);
  }

  query += ' ORDER BY created_at DESC LIMIT 1';

  return await env.DB.prepare(query).bind(...params).first();
}

/**
 * 生成操作 ID
 */
function generateOperationId(): string {
  return `op_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * 发送 WebSocket 消息到 Durable Object
 */
async function sendWebSocketMessage(env: Env, durableObjectId: string, deviceId: string, message: WSMessage): Promise<boolean> {
  try {
    // 获取 Durable Object 实例
    const id = env.SESSION_DO.idFromString(durableObjectId);
    const stub = env.SESSION_DO.get(id);
    
    // 发送消息到 Durable Object，包含 deviceId 作为查询参数
    const response = await stub.fetch(`http://internal/message?deviceId=${encodeURIComponent(deviceId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });

    return response.ok;
  } catch (error) {
    console.error('Failed to send WebSocket message:', error);
    return false;
  }
}