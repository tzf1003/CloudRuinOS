/**
 * 心跳 API 处理器
 * 实现心跳逻辑：验证签名、防重放、更新时间戳、速率限制
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */

import { Env } from '../../index';
import { createKVManager, validateNonce, checkAndUpdateRateLimit } from '../../storage/kv-manager';
import { verifyRequestIntegrity } from '../utils/crypto';
import { getDeviceById, updateDevice } from '../utils/database';
import { createAuditService } from '../utils/audit';

// 心跳请求类型
export interface HeartbeatRequest {
  device_id: string;
  timestamp: number;
  nonce: string;
  protocol_version: string;
  signature: string;
  system_info: {
    platform: string;
    version: string;
    uptime: number;
    cpu_usage?: number;
    memory_usage?: number;
    disk_usage?: number;
  };
  reports?: TaskReport[];
}

export interface TaskReport {
  task_id: string;
  state: 'received' | 'running' | 'succeeded' | 'failed' | 'canceled';
  progress?: number;
  output_chunk?: string;
  output_cursor?: number;
  error?: string;
}

// 心跳响应类型
export interface HeartbeatResponse {
  status: 'ok' | 'error';
  server_time: number;
  next_heartbeat: number;
  tasks?: TaskItem[];
  cancels?: CancelItem[];
  error?: string;
  error_code?: string;
}

export interface TaskItem {
  task_id: string;
  revision: number;
  type: 'config_update' | 'cmd_exec';
  desired_state: 'pending' | 'running' | 'succeeded' | 'failed' | 'canceled';
  payload: any;
}

export interface CancelItem {
  task_id: string;
  revision: number;
  desired_state: 'canceled';
}

// Old Command Interface (Deprecated)
// export interface Command { ... }

import { ConfigurationRow, TaskRow } from '../../database/schema';

// Helper: Deep Merge (Simple version for config)
function deepMerge(target: any, source: any): any {
  const isObject = (obj: any) => obj && typeof obj === 'object';
  if (!isObject(target) || !isObject(source)) return source;
  Object.keys(source).forEach(key => {
    const targetValue = target[key];
    const sourceValue = source[key];
    if (Array.isArray(targetValue) && Array.isArray(sourceValue)) {
      target[key] = sourceValue;
    } else if (isObject(targetValue) && isObject(sourceValue)) {
      target[key] = deepMerge(Object.assign({}, targetValue), sourceValue);
    } else {
      target[key] = sourceValue;
    }
  });
  return target;
}

/**
 * 心跳 API 处理器
 * POST /agent/heartbeat
 */
export async function heartbeat(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  try {
    // 解析请求体
    const body = await request.json() as HeartbeatRequest;
    
    // 验证必需字段
    if (!body.device_id || !body.timestamp || !body.nonce || !body.signature || !body.system_info) {
      return createErrorResponse('Missing required fields', 'INVALID_REQUEST', 400);
    }

    const kvManager = createKVManager(env.KV);
    const now = Date.now();
    
    // 速率限制检查 (每分钟最多60次心跳)
    const rateLimitResult = await checkAndUpdateRateLimit(
      kvManager,
      body.device_id,
      'heartbeat',
      60, // 最大请求数
      60  // 窗口时间（秒）
    );
    
    if (!rateLimitResult.allowed) {
      return createErrorResponse(
        'Rate limit exceeded',
        'RATE_LIMIT_EXCEEDED',
        429,
        {
          'Retry-After': Math.ceil((rateLimitResult.resetTime - now) / 1000).toString(),
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
          'X-RateLimit-Reset': rateLimitResult.resetTime.toString(),
        }
      );
    }

    // 获取设备信息
    const device = await getDeviceById(env.DB, body.device_id);
    if (!device) {
      const auditService = createAuditService(env);
      await auditService.logHeartbeat(
        body.device_id,
        body.system_info,
        body.nonce,
        'error',
        'Device not found',
        request
      );
      
      return createErrorResponse('Device not found', 'DEVICE_NOT_FOUND', 404);
    }

    // 验证请求完整性（签名和时间戳）
    const integrityResult = await verifyRequestIntegrity(
      body.device_id,
      body.timestamp,
      body.nonce,
      body.signature,
      device.public_key,
      {
        protocol_version: body.protocol_version,
        system_info: body.system_info,
      }
    );

    if (!integrityResult.valid) {
      const auditService = createAuditService(env);
      await auditService.logHeartbeat(
        body.device_id,
        body.system_info,
        body.nonce,
        'error',
        `Integrity verification failed: ${integrityResult.reason}`,
        request
      );
      
      return createErrorResponse(
        integrityResult.reason || 'Request integrity verification failed',
        'INVALID_SIGNATURE',
        401
      );
    }

    // 验证 nonce 防重放
    const nonceResult = await validateNonce(kvManager, body.device_id, body.nonce);
    if (!nonceResult.valid) {
      const auditService = createAuditService(env);
      await auditService.logHeartbeat(
        body.device_id,
        body.system_info,
        body.nonce,
        'error',
        `Nonce validation failed: ${nonceResult.reason}`,
        request
      );
      
      return createErrorResponse(
        nonceResult.reason || 'Nonce validation failed',
        'REPLAY_ATTACK',
        401
      );
    }

    // 更新设备状态和时间戳
    const updateSuccess = await updateDevice(env.DB, body.device_id, {
      last_seen: now,
      status: 'online',
      version: body.system_info.version,
    });

    if (!updateSuccess) {
      return createErrorResponse('Failed to update device status', 'DATABASE_ERROR', 500);
    }

    // 更新设备缓存
    await kvManager.updateDeviceStatus(body.device_id, 'online', now);

    // 记录成功的心跳事件
    const auditService = createAuditService(env);
    await auditService.logHeartbeat(
      body.device_id,
      body.system_info,
      body.nonce,
      'success',
      undefined,
      request
    );

    // Process Reports from Agent
    if (body.reports && body.reports.length > 0) {
      for (const report of body.reports) {
        try {
            await env.DB.prepare(`
                INSERT INTO task_states (task_id, device_id, state, progress, output_cursor, error, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(task_id, device_id) DO UPDATE SET
                state=excluded.state, progress=excluded.progress, output_cursor=excluded.output_cursor, error=excluded.error, updated_at=excluded.updated_at
            `).bind(
                report.task_id,
                body.device_id,
                report.state,
                report.progress || 0,
                report.output_cursor || 0,
                report.error || null,
                now
            ).run();

            if (report.output_chunk) {
                await env.DB.prepare(`
                    INSERT INTO task_logs (task_id, content, created_at)
                    VALUES (?, ?, ?)
                `).bind(
                    report.task_id,
                    report.output_chunk,
                    now
                ).run();
            }
        } catch (e) {
            console.error(`Failed to process report for task ${report.task_id}`, e);
        }
      }
    }

    // Retrieve Tasks (Pending or Running)
    const { results: pendingTasks } = await env.DB.prepare(`
        SELECT * FROM tasks 
        WHERE device_id = ? 
        AND desired_state != 'canceled'
        AND id NOT IN (
            SELECT task_id FROM task_states 
            WHERE device_id = ? AND state IN ('succeeded', 'failed', 'canceled')
        )
    `).bind(body.device_id, body.device_id).all<TaskRow>();

    const tasks = (pendingTasks || []).map(t => ({
        task_id: t.id,
        revision: t.revision,
        type: t.type,
        desired_state: t.desired_state,
        payload: JSON.parse(t.payload)
    }));
    
    // Retrieve Cancels
    const { results: cancelledTasks } = await env.DB.prepare(`
        SELECT * FROM tasks 
        WHERE device_id = ? 
        AND desired_state = 'canceled'
        AND id NOT IN (
            SELECT task_id FROM task_states 
            WHERE device_id = ? AND state = 'canceled'
        )
    `).bind(body.device_id, body.device_id).all<TaskRow>();

    const cancels = (cancelledTasks || []).map(t => ({
        task_id: t.id,
        revision: t.revision,
        desired_state: 'canceled' as const
    }));
    
    // 计算下次心跳时间
    // Fetch effective configuration to determine heartbeat interval
    let heartbeatIntervalMs = parseInt(env.HEARTBEAT_INTERVAL || '60') * 1000;
    
    try {
        const token = device.enrollment_token || 'default-token';
        const stmt = env.DB.prepare(`
          SELECT scope, content
          FROM configurations
          WHERE scope = 'global'
             OR (scope = 'token' AND target_id = ?)
             OR (scope = 'device' AND target_id = ?)
          ORDER BY 
            CASE scope 
              WHEN 'global' THEN 1 
              WHEN 'token' THEN 2 
              WHEN 'device' THEN 3 
            END ASC
        `);
        const { results } = await stmt.bind(token, body.device_id).all<ConfigurationRow>();
        
        if (results && results.length > 0) {
            let finalConfig: any = {};
            for (const row of results) {
                try {
                    const configContent = typeof row.content === 'string' ? JSON.parse(row.content) : row.content;
                    finalConfig = deepMerge(finalConfig, configContent);
                } catch (e) {
                    // Ignore parsing errors
                }
            }
            if (finalConfig && finalConfig.heartbeat && finalConfig.heartbeat.interval) {
                heartbeatIntervalMs = finalConfig.heartbeat.interval * 1000;
            }
        }
    } catch (dbError) {
        console.warn('Failed to fetch dynamic config for heartbeat:', dbError);
    }

    const nextHeartbeat = now + heartbeatIntervalMs;

    // 返回成功响应
    const response: HeartbeatResponse = {
      status: 'ok',
      server_time: now,
      next_heartbeat: nextHeartbeat,
      tasks: tasks.length > 0 ? tasks : undefined,
      cancels: cancels.length > 0 ? cancels : undefined,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
        'X-RateLimit-Reset': rateLimitResult.resetTime.toString(),
      },
    });

  } catch (error) {
    console.error('Heartbeat error:', error);
    
    // 记录内部错误
    try {
      const auditService = createAuditService(env);
      await auditService.logHeartbeat(
        'unknown',
        {},
        '',
        'error',
        `Internal error: ${error}`,
        request
      );
    } catch (logError) {
      console.error('Failed to log heartbeat error:', logError);
    }

    return createErrorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

/**
 * 创建错误响应
 */
function createErrorResponse(
  message: string,
  code: string,
  status: number,
  additionalHeaders?: Record<string, string>
): Response {
  const response: HeartbeatResponse = {
    status: 'error',
    server_time: Date.now(),
    next_heartbeat: Date.now() + 60000, // 1分钟后重试
    error: message,
    error_code: code,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    ...additionalHeaders,
  };

  return new Response(JSON.stringify(response), {
    status,
    headers,
  });
}