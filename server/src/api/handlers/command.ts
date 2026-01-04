/**
 * 命令队列 API 处理器
 * 实现命令的心跳轮询获取、确认完成、管理员下发等功能
 * 
 * 设计说明:
 * - /agent/command (GET) - Agent 心跳轮询获取待执行命令
 * - /agent/command/:id/ack (POST) - Agent 确认命令执行结果
 * - /commands (POST) - 管理员下发新命令
 * - /commands/:id (GET) - 查询命令状态
 */

import { Env } from '../../index';
import { createKVManager, validateNonce, checkAndUpdateRateLimit } from '../../storage/kv-manager';
import { verifyRequestIntegrity } from '../utils/crypto';
import { getDeviceById } from '../utils/database';
import { createAuditService } from '../utils/audit';
import { 
  CommandRecord, 
  CommandStatus, 
  CommandType, 
  CommandPriority,
  KVKeyGenerator,
  TTLCalculator,
  CommandQueueIndex 
} from '../../types/kv-storage';

// ============= 类型定义 =============

// Agent 获取命令请求
export interface GetCommandsRequest {
  device_id: string;
  timestamp: number;
  nonce: string;
  signature: string;
  limit?: number;
}

// Agent 确认命令请求
export interface AckCommandRequest {
  device_id: string;
  command_id: string;
  timestamp: number;
  nonce: string;
  signature: string;
  status: 'completed' | 'failed';
  result?: any;
  error?: string;
}

// 管理员创建命令请求
export interface CreateCommandRequest {
  device_id: string;
  type: CommandType;
  priority?: CommandPriority;
  payload: Record<string, any>;
  expires_in?: number; // 秒，默认 24 小时
  max_retries?: number;
}

// 命令响应
export interface CommandResponse {
  id: string;
  type: CommandType;
  priority: CommandPriority;
  payload: Record<string, any>;
  expires_at: number;
}

// 获取命令响应
export interface GetCommandsResponse {
  status: 'ok' | 'error';
  commands: CommandResponse[];
  server_time: number;
  error?: string;
}

// ============= 工具函数 =============

function createErrorResponse(
  message: string, 
  errorCode: string, 
  status: number,
  headers?: Record<string, string>
): Response {
  return new Response(JSON.stringify({
    status: 'error',
    error: message,
    error_code: errorCode,
  }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

function generateCommandId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `cmd_${timestamp}_${random}`;
}

// ============= KV 命令队列操作 =============

/**
 * 将命令加入设备队列
 */
async function enqueueCommand(
  kv: KVNamespace,
  command: CommandRecord
): Promise<boolean> {
  try {
    // 1. 存储命令本身
    const commandKey = KVKeyGenerator.command(command.id);
    await kv.put(commandKey, JSON.stringify(command), {
      expirationTtl: TTLCalculator.getCommandQueueTTL(),
    });

    // 2. 更新设备命令队列索引
    const indexKey = KVKeyGenerator.commandQueueIndex(command.device_id);
    const existingIndex = await kv.get<CommandQueueIndex>(indexKey, 'json');
    
    const updatedIndex: CommandQueueIndex = existingIndex 
      ? {
          ...existingIndex,
          command_ids: [...existingIndex.command_ids, command.id],
          updated_at: Date.now(),
        }
      : {
          device_id: command.device_id,
          command_ids: [command.id],
          updated_at: Date.now(),
        };

    await kv.put(indexKey, JSON.stringify(updatedIndex), {
      expirationTtl: TTLCalculator.getCommandQueueTTL(),
    });

    return true;
  } catch (error) {
    console.error('Failed to enqueue command:', error);
    return false;
  }
}

/**
 * 获取设备待执行命令
 */
async function getDevicePendingCommands(
  kv: KVNamespace,
  deviceId: string,
  limit: number = 10
): Promise<CommandRecord[]> {
  try {
    const indexKey = KVKeyGenerator.commandQueueIndex(deviceId);
    const index = await kv.get<CommandQueueIndex>(indexKey, 'json');
    
    if (!index || index.command_ids.length === 0) {
      return [];
    }

    const commands: CommandRecord[] = [];
    const now = Date.now();
    const validCommandIds: string[] = [];

    // 获取所有命令并过滤
    for (const commandId of index.command_ids) {
      if (commands.length >= limit) break;
      
      const commandKey = KVKeyGenerator.command(commandId);
      const command = await kv.get<CommandRecord>(commandKey, 'json');
      
      if (command) {
        // 检查是否过期
        if (command.expires_at > now && command.status === 'pending') {
          commands.push(command);
          validCommandIds.push(commandId);
        } else if (command.expires_at <= now) {
          // 标记为过期
          await updateCommandStatus(kv, commandId, 'expired');
        }
      }
    }

    // 按优先级排序: urgent > high > normal > low
    const priorityOrder: Record<CommandPriority, number> = {
      urgent: 0,
      high: 1,
      normal: 2,
      low: 3,
    };
    
    commands.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.created_at - b.created_at; // 同优先级按创建时间排序
    });

    return commands.slice(0, limit);
  } catch (error) {
    console.error('Failed to get device commands:', error);
    return [];
  }
}

/**
 * 更新命令状态
 */
async function updateCommandStatus(
  kv: KVNamespace,
  commandId: string,
  status: CommandStatus,
  result?: any,
  error?: string
): Promise<boolean> {
  try {
    const commandKey = KVKeyGenerator.command(commandId);
    const command = await kv.get<CommandRecord>(commandKey, 'json');
    
    if (!command) {
      return false;
    }

    const updatedCommand: CommandRecord = {
      ...command,
      status,
      completed_at: status === 'completed' || status === 'failed' ? Date.now() : undefined,
      result,
      error,
    };

    if (status === 'delivered' && !command.delivered_at) {
      updatedCommand.delivered_at = Date.now();
    }

    await kv.put(commandKey, JSON.stringify(updatedCommand), {
      expirationTtl: TTLCalculator.getCommandQueueTTL(),
    });

    // 如果命令已完成/失败，从索引中移除
    if (status === 'completed' || status === 'failed' || status === 'expired') {
      await removeCommandFromIndex(kv, command.device_id, commandId);
    }

    return true;
  } catch (error) {
    console.error('Failed to update command status:', error);
    return false;
  }
}

/**
 * 从设备队列索引中移除命令
 */
async function removeCommandFromIndex(
  kv: KVNamespace,
  deviceId: string,
  commandId: string
): Promise<void> {
  try {
    const indexKey = KVKeyGenerator.commandQueueIndex(deviceId);
    const index = await kv.get<CommandQueueIndex>(indexKey, 'json');
    
    if (index) {
      const updatedIndex: CommandQueueIndex = {
        ...index,
        command_ids: index.command_ids.filter(id => id !== commandId),
        updated_at: Date.now(),
      };
      
      await kv.put(indexKey, JSON.stringify(updatedIndex), {
        expirationTtl: TTLCalculator.getCommandQueueTTL(),
      });
    }
  } catch (error) {
    console.error('Failed to remove command from index:', error);
  }
}

/**
 * 获取单个命令
 */
async function getCommand(
  kv: KVNamespace,
  commandId: string
): Promise<CommandRecord | null> {
  try {
    const commandKey = KVKeyGenerator.command(commandId);
    return await kv.get<CommandRecord>(commandKey, 'json');
  } catch (error) {
    console.error('Failed to get command:', error);
    return null;
  }
}

// ============= API 处理器 =============

/**
 * Agent 获取待执行命令
 * GET /agent/command
 * 
 * Query params:
 * - device_id: 设备 ID
 * - timestamp: 时间戳
 * - nonce: 防重放 nonce
 * - signature: 签名
 * - limit: 返回命令数量限制 (可选, 默认 10)
 */
export async function getAgentCommands(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const deviceId = url.searchParams.get('device_id');
    const timestamp = parseInt(url.searchParams.get('timestamp') || '0');
    const nonce = url.searchParams.get('nonce');
    const signature = url.searchParams.get('signature');
    const limit = parseInt(url.searchParams.get('limit') || '10');

    // 验证必需参数
    if (!deviceId || !timestamp || !nonce || !signature) {
      return createErrorResponse('Missing required parameters', 'INVALID_REQUEST', 400);
    }

    const kvManager = createKVManager(env.KV);
    const now = Date.now();

    // 速率限制检查 (每分钟最多 30 次命令查询)
    const rateLimitResult = await checkAndUpdateRateLimit(
      kvManager,
      deviceId,
      'command',
      30,
      60
    );

    if (!rateLimitResult.allowed) {
      return createErrorResponse(
        'Rate limit exceeded',
        'RATE_LIMIT_EXCEEDED',
        429,
        {
          'Retry-After': Math.ceil((rateLimitResult.resetTime - now) / 1000).toString(),
        }
      );
    }

    // 获取设备信息验证公钥
    const device = await getDeviceById(env.DB, deviceId);
    if (!device) {
      return createErrorResponse('Device not found', 'DEVICE_NOT_FOUND', 404);
    }

    // 验证请求签名
    const integrityResult = await verifyRequestIntegrity(
      deviceId,
      timestamp,
      nonce,
      signature,
      device.public_key,
      { limit }
    );

    if (!integrityResult.valid) {
      return createErrorResponse(
        integrityResult.reason || 'Signature verification failed',
        'INVALID_SIGNATURE',
        401
      );
    }

    // 验证 nonce 防重放
    const nonceResult = await validateNonce(kvManager, deviceId, nonce);
    if (!nonceResult.valid) {
      return createErrorResponse(
        nonceResult.reason || 'Nonce validation failed',
        'REPLAY_ATTACK',
        401
      );
    }

    // 获取待执行命令
    const commands = await getDevicePendingCommands(env.KV, deviceId, limit);

    // 标记命令为已下发
    for (const cmd of commands) {
      await updateCommandStatus(env.KV, cmd.id, 'delivered');
    }

    // 记录审计日志
    const auditService = createAuditService(env);
    await auditService.logEvent(
      'command_execute',
      deviceId,
      null,
      {
        command_execute: {
          command: 'fetch_commands',
          args: [],
          exit_code: 0,
          execution_time: 0,
          stdout_length: commands.length,
          stderr_length: 0,
          is_sensitive: false,
        },
      },
      'success',
      undefined,
      request
    );

    // 构建响应
    const response: GetCommandsResponse = {
      status: 'ok',
      commands: commands.map(cmd => ({
        id: cmd.id,
        type: cmd.type,
        priority: cmd.priority,
        payload: cmd.payload,
        expires_at: cmd.expires_at,
      })),
      server_time: now,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in getAgentCommands:', error);
    return createErrorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

/**
 * Agent 确认命令执行结果
 * POST /agent/command/:id/ack
 */
export async function ackCommand(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const commandId = pathParts[pathParts.indexOf('command') + 1];

    if (!commandId || commandId === 'ack') {
      return createErrorResponse('Missing command ID', 'INVALID_REQUEST', 400);
    }

    const body = await request.json() as AckCommandRequest;

    // 验证必需字段
    if (!body.device_id || !body.timestamp || !body.nonce || !body.signature || !body.status) {
      return createErrorResponse('Missing required fields', 'INVALID_REQUEST', 400);
    }

    const kvManager = createKVManager(env.KV);

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
      { 
        command_id: commandId, 
        status: body.status,
        result: body.result,
        error: body.error,
      }
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

    // 获取命令验证归属
    const command = await getCommand(env.KV, commandId);
    if (!command) {
      return createErrorResponse('Command not found', 'COMMAND_NOT_FOUND', 404);
    }

    if (command.device_id !== body.device_id) {
      return createErrorResponse('Command does not belong to device', 'FORBIDDEN', 403);
    }

    // 更新命令状态
    const status: CommandStatus = body.status === 'completed' ? 'completed' : 'failed';
    const success = await updateCommandStatus(
      env.KV,
      commandId,
      status,
      body.result,
      body.error
    );

    if (!success) {
      return createErrorResponse('Failed to update command status', 'INTERNAL_ERROR', 500);
    }

    // 记录审计日志
    const auditService = createAuditService(env);
    await auditService.logEvent(
      'command_execute',
      body.device_id,
      null,
      {
        command_execute: {
          command: `ack:${command.type}`,
          args: [commandId],
          exit_code: body.status === 'completed' ? 0 : 1,
          execution_time: 0,
          stdout_length: body.result ? JSON.stringify(body.result).length : 0,
          stderr_length: body.error ? body.error.length : 0,
          is_sensitive: false,
        },
      },
      body.status === 'completed' ? 'success' : 'error',
      body.error,
      request
    );

    return new Response(JSON.stringify({
      status: 'ok',
      command_id: commandId,
      new_status: status,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in ackCommand:', error);
    return createErrorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

/**
 * 管理员创建命令 (下发命令到设备队列)
 * POST /commands
 */
export async function createCommand(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  try {
    // 认证已在路由层通过 withAdminAuth 中间件处理
    
    const body = await request.json() as CreateCommandRequest;

    // 验证必需字段
    if (!body.device_id || !body.type || !body.payload) {
      return createErrorResponse('Missing required fields', 'INVALID_REQUEST', 400);
    }

    // 验证命令类型
    const validTypes: CommandType[] = ['execute', 'file_op', 'config_update', 'upgrade', 'script'];
    if (!validTypes.includes(body.type)) {
      return createErrorResponse('Invalid command type', 'INVALID_COMMAND_TYPE', 400);
    }

    // 验证设备存在
    const device = await getDeviceById(env.DB, body.device_id);
    if (!device) {
      return createErrorResponse('Device not found', 'DEVICE_NOT_FOUND', 404);
    }

    const now = Date.now();
    const expiresIn = body.expires_in || 86400; // 默认 24 小时

    // 创建命令记录
    const command: CommandRecord = {
      id: generateCommandId(),
      device_id: body.device_id,
      type: body.type,
      priority: body.priority || 'normal',
      payload: body.payload,
      status: 'pending',
      created_at: now,
      expires_at: now + (expiresIn * 1000),
      retry_count: 0,
      max_retries: body.max_retries || 3,
      created_by: 'admin', // 管理员操作，已通过 JWT 认证
    };

    // 入队
    const success = await enqueueCommand(env.KV, command);
    if (!success) {
      return createErrorResponse('Failed to create command', 'INTERNAL_ERROR', 500);
    }

    // 记录审计日志
    const auditService = createAuditService(env);
    await auditService.logEvent(
      'command_execute',
      body.device_id,
      null,
      {
        command_execute: {
          command: `create:${command.type}`,
          args: [command.id, command.priority],
          exit_code: 0,
          execution_time: 0,
          stdout_length: 0,
          stderr_length: 0,
          is_sensitive: false,
        },
      },
      'success',
      undefined,
      request
    );

    return new Response(JSON.stringify({
      status: 'ok',
      command: {
        id: command.id,
        type: command.type,
        priority: command.priority,
        status: command.status,
        created_at: command.created_at,
        expires_at: command.expires_at,
      },
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in createCommand:', error);
    return createErrorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

/**
 * 查询命令状态
 * GET /commands/:id
 */
export async function getCommandStatus(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  try {
    // 认证已在路由层通过 withAdminAuth 中间件处理
    
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const commandId = pathParts[pathParts.length - 1];

    if (!commandId) {
      return createErrorResponse('Missing command ID', 'INVALID_REQUEST', 400);
    }

    const command = await getCommand(env.KV, commandId);
    if (!command) {
      return createErrorResponse('Command not found', 'COMMAND_NOT_FOUND', 404);
    }

    return new Response(JSON.stringify({
      status: 'ok',
      command: {
        id: command.id,
        device_id: command.device_id,
        type: command.type,
        priority: command.priority,
        payload: command.payload,
        status: command.status,
        created_at: command.created_at,
        expires_at: command.expires_at,
        delivered_at: command.delivered_at,
        completed_at: command.completed_at,
        result: command.result,
        error: command.error,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in getCommandStatus:', error);
    return createErrorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

/**
 * 获取设备所有命令历史
 * GET /devices/:id/commands
 */
export async function getDeviceCommandHistory(
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

    // 验证设备存在
    const device = await getDeviceById(env.DB, deviceId);
    if (!device) {
      return createErrorResponse('Device not found', 'DEVICE_NOT_FOUND', 404);
    }

    // 获取设备命令队列索引
    const indexKey = KVKeyGenerator.commandQueueIndex(deviceId);
    const index = await env.KV.get<CommandQueueIndex>(indexKey, 'json');

    if (!index || index.command_ids.length === 0) {
      return new Response(JSON.stringify({
        status: 'ok',
        commands: [],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 获取所有命令详情
    const commands: CommandRecord[] = [];
    for (const commandId of index.command_ids) {
      const command = await getCommand(env.KV, commandId);
      if (command) {
        commands.push(command);
      }
    }

    return new Response(JSON.stringify({
      status: 'ok',
      commands: commands.map(cmd => ({
        id: cmd.id,
        type: cmd.type,
        priority: cmd.priority,
        status: cmd.status,
        created_at: cmd.created_at,
        expires_at: cmd.expires_at,
        delivered_at: cmd.delivered_at,
        completed_at: cmd.completed_at,
      })),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in getDeviceCommandHistory:', error);
    return createErrorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}
