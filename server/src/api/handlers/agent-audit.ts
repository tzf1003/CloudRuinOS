/**
 * Agent 审计日志接收 API
 * 接收 Agent 批量上传的审计日志并存储
 */

import { Env } from '../../index';
import { createKVManager, validateNonce, checkAndUpdateRateLimit } from '../../storage/kv-manager';
import { verifyRequestIntegrity } from '../utils/crypto';
import { getDeviceById } from '../utils/database';
import { createAuditLog } from '../utils/database';
import { CreateAuditLogInput } from '../../types/database';

// ============= 类型定义 =============

export interface AuditEvent {
  event_type: string;
  timestamp: number;
  device_id: string;
  session_id?: string;
  data: Record<string, any>;
  result: 'Success' | 'Error' | 'Timeout';
  error_message?: string;
}

export interface AuditBatchRequest {
  device_id: string;
  timestamp: number;
  nonce: string;
  signature: string;
  events: AuditEvent[];
}

export interface AuditBatchResponse {
  status: 'ok' | 'error';
  accepted_count: number;
  rejected_count: number;
  errors: string[];
}

// ============= 工具函数 =============

function createErrorResponse(
  message: string, 
  errorCode: string, 
  status: number
): Response {
  return new Response(JSON.stringify({
    status: 'error',
    error: message,
    error_code: errorCode,
    accepted_count: 0,
    rejected_count: 0,
    errors: [message],
  }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mapEventTypeToActionType(eventType: string): 'register' | 'heartbeat' | 'command' | 'file_op' | 'session' {
  const typeMap: Record<string, 'register' | 'heartbeat' | 'command' | 'file_op' | 'session'> = {
    'CommandExecute': 'command',
    'FileList': 'file_op',
    'FileDownload': 'file_op',
    'FileUpload': 'file_op',
    'FileDelete': 'file_op',
    'SessionConnect': 'session',
    'SessionDisconnect': 'session',
    'DeviceRegister': 'register',
    'SecurityViolation': 'command',
    'AuthenticationFailure': 'command',
  };
  return typeMap[eventType] || 'command';
}

function mapResult(result: string): 'success' | 'error' | 'timeout' {
  const resultMap: Record<string, 'success' | 'error' | 'timeout'> = {
    'Success': 'success',
    'Error': 'error',
    'Timeout': 'timeout',
  };
  return resultMap[result] || 'error';
}

// ============= API 处理器 =============

/**
 * 接收 Agent 批量审计日志
 * POST /agent/audit
 */
export async function receiveAuditLogs(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  try {
    const body = await request.json() as AuditBatchRequest;

    // 验证必需字段
    if (!body.device_id || !body.timestamp || !body.nonce || !body.signature || !body.events) {
      return createErrorResponse('Missing required fields', 'INVALID_REQUEST', 400);
    }

    if (!Array.isArray(body.events) || body.events.length === 0) {
      return createErrorResponse('Events array is empty or invalid', 'INVALID_REQUEST', 400);
    }

    // 限制单次上传的事件数量
    if (body.events.length > 100) {
      return createErrorResponse('Too many events in batch (max 100)', 'BATCH_TOO_LARGE', 400);
    }

    const kvManager = createKVManager(env.KV);
    const now = Date.now();

    // 速率限制检查 (每分钟最多 10 次批量上传)
    const rateLimitResult = await checkAndUpdateRateLimit(
      kvManager,
      body.device_id,
      'audit',
      10,
      60
    );

    if (!rateLimitResult.allowed) {
      return createErrorResponse(
        'Rate limit exceeded',
        'RATE_LIMIT_EXCEEDED',
        429
      );
    }

    // 获取设备信息验证公钥
    const device = await getDeviceById(env.DB, body.device_id);
    if (!device) {
      return createErrorResponse('Device not found', 'DEVICE_NOT_FOUND', 404);
    }

    // 验证请求签名
    const integrityResult = await verifyRequestIntegrity(
      body.device_id,
      body.timestamp,
      body.nonce,
      body.signature,
      device.public_key,
      { event_count: body.events.length }
    );

    if (!integrityResult.valid) {
      return createErrorResponse(
        integrityResult.reason || 'Signature verification failed',
        'INVALID_SIGNATURE',
        401
      );
    }

    // 验证 nonce 防重放
    const nonceResult = await validateNonce(kvManager, body.device_id, body.nonce);
    if (!nonceResult.valid) {
      return createErrorResponse(
        nonceResult.reason || 'Nonce validation failed',
        'REPLAY_ATTACK',
        401
      );
    }

    // 处理事件
    let acceptedCount = 0;
    let rejectedCount = 0;
    const errors: string[] = [];

    for (const event of body.events) {
      try {
        // 验证事件归属
        if (event.device_id !== body.device_id) {
          errors.push(`Event device_id mismatch: ${event.device_id}`);
          rejectedCount++;
          continue;
        }

        // 存储到数据库
        const auditInput: CreateAuditLogInput = {
          device_id: event.device_id,
          session_id: event.session_id,
          action_type: mapEventTypeToActionType(event.event_type),
          action_data: {
            event_type: event.event_type,
            ...event.data,
          },
          result: mapResult(event.result),
          error_message: event.error_message,
          ip_address: request.headers.get('CF-Connecting-IP') || undefined,
          user_agent: request.headers.get('User-Agent') || undefined,
        };

        const success = await createAuditLog(env.DB, auditInput);
        if (success) {
          acceptedCount++;
        } else {
          errors.push(`Failed to store event at timestamp ${event.timestamp}`);
          rejectedCount++;
        }
      } catch (error) {
        errors.push(`Error processing event: ${error}`);
        rejectedCount++;
      }
    }

    const response: AuditBatchResponse = {
      status: acceptedCount > 0 ? 'ok' : 'error',
      accepted_count: acceptedCount,
      rejected_count: rejectedCount,
      errors: errors.slice(0, 10), // 最多返回 10 个错误
    };

    console.log(`Audit batch received: ${acceptedCount} accepted, ${rejectedCount} rejected from device ${body.device_id}`);

    return new Response(JSON.stringify(response), {
      status: rejectedCount === body.events.length ? 400 : 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in receiveAuditLogs:', error);
    return createErrorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

/**
 * 获取设备审计日志
 * GET /devices/:id/audit
 */
export async function getDeviceAuditLogs(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  try {
    // 认证已在路由层通过 withAdminAuth 中间件处理

    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const deviceIdIndex = pathParts.indexOf('devices') + 1;
    const deviceId = pathParts[deviceIdIndex];

    if (!deviceId) {
      return createErrorResponse('Missing device ID', 'INVALID_REQUEST', 400);
    }

    // 查询参数
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const actionType = url.searchParams.get('action_type');
    const startTime = url.searchParams.get('start_time');
    const endTime = url.searchParams.get('end_time');

    // 构建查询
    let query = 'SELECT * FROM audit_logs WHERE device_id = ?';
    const params: any[] = [deviceId];

    if (actionType) {
      query += ' AND action_type = ?';
      params.push(actionType);
    }

    if (startTime) {
      query += ' AND timestamp >= ?';
      params.push(parseInt(startTime));
    }

    if (endTime) {
      query += ' AND timestamp <= ?';
      params.push(parseInt(endTime));
    }

    query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const result = await env.DB.prepare(query).bind(...params).all();

    // 获取总数
    let countQuery = 'SELECT COUNT(*) as total FROM audit_logs WHERE device_id = ?';
    const countParams: any[] = [deviceId];

    if (actionType) {
      countQuery += ' AND action_type = ?';
      countParams.push(actionType);
    }

    if (startTime) {
      countQuery += ' AND timestamp >= ?';
      countParams.push(parseInt(startTime));
    }

    if (endTime) {
      countQuery += ' AND timestamp <= ?';
      countParams.push(parseInt(endTime));
    }

    const countResult = await env.DB.prepare(countQuery).bind(...countParams).first();
    const total = (countResult as any)?.total || 0;

    return new Response(JSON.stringify({
      status: 'ok',
      data: result.results,
      pagination: {
        limit,
        offset,
        total,
        has_more: offset + limit < total,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in getDeviceAuditLogs:', error);
    return createErrorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}
