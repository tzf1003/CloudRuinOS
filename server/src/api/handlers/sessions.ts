/**
 * 会话管理 API 处理器
 * 实现会话创建和管理逻辑
 * Requirements: 3.1, 3.3, 3.5
 */

import { Env } from '../../index';
import { generateSecureRandomString } from '../utils/crypto';
import { createAuditService } from '../utils/audit';

/**
 * 创建会话 API 处理器
 * POST /sessions
 */
export async function createSession(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  try {
    const body = await request.json() as CreateSessionRequest;
    
    // 验证请求参数
    if (!body.deviceId) {
      return new Response(JSON.stringify({
        error: 'Missing required field: deviceId',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 验证设备是否存在
    const device = await env.DB.prepare(
      'SELECT id, status FROM devices WHERE id = ?'
    ).bind(body.deviceId).first();

    if (!device) {
      return new Response(JSON.stringify({
        error: 'Device not found',
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 生成会话 ID 和 Durable Object ID
    const sessionId = generateSecureRandomString(32);
    const durableObjectId = env.SESSION_DO.idFromName(sessionId);
    const durableObject = env.SESSION_DO.get(durableObjectId);

    // 计算会话过期时间
    const sessionTimeout = parseInt(env.SESSION_TIMEOUT || '1800') * 1000; // 转换为毫秒
    const now = Date.now();
    const expiresAt = now + sessionTimeout;

    // 创建会话数据
    const sessionData: SessionData = {
      sessionId,
      deviceId: body.deviceId,
      durableObjectId: durableObjectId.toString(),
      status: 'pending',
      createdAt: now,
      expiresAt,
    };

    // 存储会话到 D1 数据库
    await env.DB.prepare(`
      INSERT INTO sessions (id, device_id, durable_object_id, status, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      sessionId,
      body.deviceId,
      durableObjectId.toString(),
      'pending',
      now,
      expiresAt
    ).run();

    // 通知 Durable Object 创建会话
    await durableObject.fetch(new Request('http://internal/session/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sessionData),
    }));

    // 构建 WebSocket URL
    const url = new URL(request.url);
    const websocketUrl = `${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}/ws?sessionId=${sessionId}&deviceId=${body.deviceId}`;

    // 记录审计日志
    const auditService = createAuditService(env);
    await auditService.logSessionCreate(
      body.deviceId,
      sessionId,
      durableObjectId.toString(),
      expiresAt,
      'success',
      undefined,
      request
    );

    return new Response(JSON.stringify({
      sessionId,
      deviceId: body.deviceId,
      durableObjectId: durableObjectId.toString(),
      websocketUrl,
      status: 'pending',
      createdAt: now,
      expiresAt,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Create session error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: 'Failed to create session',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * 获取会话列表 API 处理器
 * GET /sessions
 */
export async function getSessions(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const deviceId = url.searchParams.get('deviceId');
    const status = url.searchParams.get('status');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    // 构建查询条件
    let whereClause = '';
    const params: any[] = [];
    
    if (deviceId) {
      whereClause += ' WHERE s.device_id = ?';
      params.push(deviceId);
    }
    
    if (status) {
      whereClause += deviceId ? ' AND' : ' WHERE';
      whereClause += ' s.status = ?';
      params.push(status);
    }

    // 查询会话列表
    const stmt = env.DB.prepare(`
      SELECT 
        s.id,
        s.device_id,
        s.durable_object_id,
        s.status,
        s.created_at,
        s.expires_at,
        s.last_activity,
        d.platform,
        d.version
      FROM sessions s
      JOIN devices d ON s.device_id = d.id
      ${whereClause}
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
    `);

    params.push(limit, offset);
    const result = await stmt.bind(...params).all();

    // 获取总数
    const countStmt = env.DB.prepare(`
      SELECT COUNT(*) as total
      FROM sessions s
      JOIN devices d ON s.device_id = d.id
      ${whereClause}
    `);

    const countParams = params.slice(0, -2); // 移除 limit 和 offset
    const countResult = await countStmt.bind(...countParams).first();
    const total = (countResult as any)?.total || 0;

    // 处理过期会话
    const now = Date.now();
    const sessions = result.results.map((row: any) => {
      let sessionStatus = row.status;
      if (now > row.expires_at && sessionStatus !== 'expired') {
        sessionStatus = 'expired';
        // 异步更新数据库状态
        env.DB.prepare('UPDATE sessions SET status = ? WHERE id = ?')
          .bind('expired', row.id).run().catch(console.error);
      }

      return {
        id: row.id,
        deviceId: row.device_id,
        durableObjectId: row.durable_object_id,
        status: sessionStatus,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        lastActivity: row.last_activity,
        devicePlatform: row.platform,
        deviceVersion: row.version,
      };
    });

    return new Response(JSON.stringify({
      success: true,
      sessions,
      total,
      limit,
      offset,
      timestamp: Date.now(),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Get sessions error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to fetch sessions',
      message: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * 获取会话 API 处理器
 * GET /sessions/:id
 */
export async function getSession(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const sessionId = url.pathname.split('/').pop();

    if (!sessionId) {
      return new Response(JSON.stringify({
        error: 'Missing session ID',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 从数据库查询会话信息
    const session = await env.DB.prepare(`
      SELECT s.*, d.status as device_status, d.last_seen
      FROM sessions s
      JOIN devices d ON s.device_id = d.id
      WHERE s.id = ?
    `).bind(sessionId).first();

    if (!session) {
      return new Response(JSON.stringify({
        error: 'Session not found',
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 检查会话是否过期
    const now = Date.now();
    let sessionStatus = session.status as string;
    
    if (now > (session.expires_at as number)) {
      sessionStatus = 'expired';
      
      // 更新数据库中的会话状态
      await env.DB.prepare(`
        UPDATE sessions SET status = 'expired' WHERE id = ?
      `).bind(sessionId).run();
    }

    // 从 Durable Object 获取实时状态
    let liveStatus = null;
    try {
      const durableObjectId = env.SESSION_DO.idFromString(session.durable_object_id as string);
      const durableObject = env.SESSION_DO.get(durableObjectId);
      
      const statusResponse = await durableObject.fetch(new Request('http://internal/session/status'));
      if (statusResponse.ok) {
        const statusData = await statusResponse.json() as any;
        liveStatus = statusData;
      }
    } catch (error) {
      console.warn('Failed to get live session status:', error);
    }

    return new Response(JSON.stringify({
      sessionId: session.id,
      deviceId: session.device_id,
      durableObjectId: session.durable_object_id,
      status: sessionStatus,
      createdAt: session.created_at,
      expiresAt: session.expires_at,
      deviceStatus: session.device_status,
      deviceLastSeen: session.last_seen,
      liveStatus,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Get session error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: 'Failed to get session',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// 类型定义
interface CreateSessionRequest {
  deviceId: string;
  requestId?: string;
  timestamp?: number;
  sessionTimeout?: number;
}

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

/**
 * WebSocket 升级处理器
 * GET /ws
 */
export async function handleWebSocketUpgrade(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId');
    const deviceId = url.searchParams.get('deviceId');

    if (!sessionId || !deviceId) {
      return new Response('Missing sessionId or deviceId', { status: 400 });
    }

    // 验证会话存在
    const session = await env.DB.prepare(
      'SELECT * FROM sessions WHERE id = ? AND device_id = ?'
    ).bind(sessionId, deviceId).first();

    if (!session) {
      return new Response('Session not found', { status: 404 });
    }

    // 检查会话是否过期
    if (Date.now() > (session.expires_at as number)) {
      return new Response('Session expired', { status: 410 });
    }

    // 获取 Durable Object 并转发 WebSocket 升级请求
    const durableObjectId = env.SESSION_DO.idFromString(session.durable_object_id as string);
    const durableObject = env.SESSION_DO.get(durableObjectId);

    // 转发请求到 Durable Object
    return await durableObject.fetch(request);

  } catch (error) {
    console.error('WebSocket upgrade error:', error);
    return new Response('Internal server error', { status: 500 });
  }
}