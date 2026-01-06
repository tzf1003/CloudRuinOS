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
}

// 心跳响应类型
export interface HeartbeatResponse {
  status: 'ok' | 'error';
  server_time: number;
  next_heartbeat: number;
  commands?: Command[];
  error?: string;
  error_code?: string;
}

// 命令类型
export interface Command {
  id: string;
  type: 'upgrade' | 'execute' | 'file_op' | 'config_update';
  data: any;
  expires_at: number;
}

import { ConfigurationRow } from '../../database/schema';

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

    // 检查是否有待执行的命令
    // 从 KV 存储中获取该设备的待处理命令
    const pendingCommands = await kvManager.getDeviceCommands(body.device_id);
    const commands: Command[] = [];

    for (const cmd of pendingCommands) {
      // 只发送处于 pending 状态的命令
      if (cmd.status === 'pending') {
        // 映射 KV 命令记录到 API 响应格式
        // 注意: 我们做一个简单的类型断言/映射，确保类型兼容
        // 如果遇到不兼容的类型（如 'script'），在客户端未支持前可以过滤或者是作为 execute 处理
        if (cmd.type === 'script') {
           // Skip or map script? For now let's map to execute with special payload if needed, 
           // or just skip if client doesn't support 'script'. 
           // Let's assume client supports what's in 'Command' interface.
           // If 'script' is not in Command interface, we skip or extend interface.
           // Current Command interface: 'upgrade' | 'execute' | 'file_op' | 'config_update'
           continue; 
        }

        commands.push({
          id: cmd.id,
          type: cmd.type as any, // Safe cast as we filtered/checked above mostly
          data: cmd.payload,
          expires_at: cmd.expires_at
        });

        // 标记命令为已投递
        await kvManager.updateCommandStatus(cmd.id, 'delivered');
      }
    }
    
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
      commands: commands.length > 0 ? commands : undefined,
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