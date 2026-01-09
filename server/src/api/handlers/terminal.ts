/**
 * 终端管理 API 处理器
 * 
 * 通过任务系统管理终端会话：
 * - 创建/输入/关闭 → 任务系统（异步）
 * - 输出查询 → 数据库查询（同步）
 */

import { Env } from '../../index';
import { createAuditService } from '../utils/audit';

export interface CreateTerminalRequest {
  agent_id: string;
  shell_type: string;
  cols?: number;
  rows?: number;
  cwd?: string;
  env?: Record<string, string>;
}

export interface CreateTerminalResponse {
  success: boolean;
  session_id?: string;
  error?: string;
}

export interface TerminalInputRequest {
  session_id: string;
  input_data: string;
  client_seq?: number;
}

export interface TerminalOutputResponse {
  success: boolean;
  session_id?: string;
  from_cursor?: number;
  to_cursor?: number;
  output_data?: string;
  state?: string;
  error?: string;
}

export interface TerminalSession {
  session_id: string;
  agent_id: string;
  user_id: string;
  shell_type: string;
  state: string;
  output_cursor: number;
  cols: number;
  rows: number;
  created_at: string;
  updated_at: string;
}

/**
 * 创建终端会话
 * POST /terminal/create
 * 
 * 通过任务系统创建终端会话
 */
export async function createTerminal(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  try {
    const body = await request.json() as CreateTerminalRequest;

    // 验证必需字段
    if (!body.agent_id || !body.shell_type) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required fields: agent_id, shell_type',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 生成会话 ID
    const sessionId = `term-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    // 从 JWT 获取用户 ID（简化处理，实际应从认证中间件获取）
    const userId = 'admin'; // TODO: 从 JWT 获取

    // 插入会话记录到数据库
    try {
      await env.DB.prepare(`
        INSERT INTO terminal_sessions 
        (session_id, agent_id, user_id, shell_type, cwd, env, cols, rows, state, output_cursor, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'opening', 0, datetime('now'), datetime('now'))
      `).bind(
        sessionId,
        body.agent_id,
        userId,
        body.shell_type,
        body.cwd || null,
        body.env ? JSON.stringify(body.env) : null,
        body.cols || 80,
        body.rows || 24
      ).run();
    } catch (dbError: any) {
      console.error('Database insert error:', dbError);
      return new Response(JSON.stringify({
        success: false,
        error: 'Database error',
        details: dbError.message,
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 检查是否已有创建任务
    const taskId = `term-open-${sessionId}`;
    const existingTask = await env.DB.prepare(`
      SELECT id FROM tasks WHERE id = ?
    `).bind(taskId).first();

    if (existingTask) {
      // 任务已存在，返回成功（幂等性）
      return new Response(JSON.stringify({
        success: true,
        session_id: sessionId,
        message: 'Open task already exists',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 创建任务到任务系统
    const taskPayload = {
      session_id: sessionId,
      shell_type: body.shell_type,
      cols: body.cols || 80,
      rows: body.rows || 24,
      cwd: body.cwd,
      env: body.env,
    };

    try {
      await env.DB.prepare(`
        INSERT INTO tasks (id, device_id, type, desired_state, payload, revision, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        taskId,
        body.agent_id,
        'terminal_open',
        'pending',
        JSON.stringify(taskPayload),
        1,
        now,
        now
      ).run();
    } catch (taskError: any) {
      console.error('Task creation error:', taskError);
      return new Response(JSON.stringify({
        success: false,
        error: 'Task creation error',
        details: taskError.message,
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 记录审计日志
    try {
      const auditService = createAuditService(env);
      await auditService.logEvent(
        'terminal_create',
        body.agent_id,
        null,
        {
          terminal_create: {
            session_id: sessionId,
            shell_type: body.shell_type,
          },
        },
        'success',
        undefined,
        request
      );
    } catch (auditError: any) {
      console.error('Audit log error:', auditError);
      // 审计日志失败不影响主流程
    }

    const response: CreateTerminalResponse = {
      success: true,
      session_id: sessionId,
    };

    return new Response(JSON.stringify(response), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Create terminal error:', error);
    console.error('Error stack:', error.stack);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error',
      details: error.message,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * 发送终端输入
 * POST /terminal/input
 * 
 * 通过任务系统发送输入到终端
 */
export async function sendTerminalInput(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  try {
    const body = await request.json() as TerminalInputRequest;

    // 验证必需字段
    if (!body.session_id || body.input_data === undefined) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required fields: session_id, input_data',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 查询会话
    const session = await env.DB.prepare(`
      SELECT * FROM terminal_sessions WHERE session_id = ?
    `).bind(body.session_id).first();

    if (!session) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Session not found',
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 生成 client_seq（如果未提供）
    const clientSeq = body.client_seq || Date.now();

    // 记录输入到数据库（用于去重）
    try {
      await env.DB.prepare(`
        INSERT INTO terminal_inputs (session_id, client_seq, input_data, created_at)
        VALUES (?, ?, ?, datetime('now'))
      `).bind(body.session_id, clientSeq, body.input_data).run();
    } catch (error: any) {
      // 如果是重复的 client_seq，忽略（幂等性）
      if (error.message && error.message.includes('UNIQUE constraint')) {
        return new Response(JSON.stringify({
          success: true,
          message: 'Input already processed (duplicate client_seq)',
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw error;
    }

    // 检查是否已有输入任务
    const taskId = `term-input-${body.session_id}-${clientSeq}`;
    const existingTask = await env.DB.prepare(`
      SELECT id FROM tasks WHERE id = ?
    `).bind(taskId).first();

    if (existingTask) {
      // 任务已存在，返回成功（幂等性）
      return new Response(JSON.stringify({
        success: true,
        message: 'Input task already exists',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 创建输入任务
    const now = Date.now();
    const taskPayload = {
      session_id: body.session_id,
      input_data: body.input_data,
      client_seq: clientSeq,
    };

    try {
      await env.DB.prepare(`
        INSERT INTO tasks (id, device_id, type, desired_state, payload, revision, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        taskId,
        session.agent_id,
        'terminal_input',
        'pending',
        JSON.stringify(taskPayload),
        1,
        now,
        now
      ).run();
    } catch (taskError: any) {
      console.error('Task creation error:', taskError);
      return new Response(JSON.stringify({
        success: false,
        error: 'Task creation error',
        details: taskError.message,
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Send terminal input error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error',
      details: error.message,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * 查询终端输出
 * GET /terminal/output/:sessionId?from_cursor=N
 * 
 * 从数据库查询输出增量
 */
export async function getTerminalOutput(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  sessionId: string
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const fromCursor = parseInt(url.searchParams.get('from_cursor') || '0');

    // 查询会话
    const session = await env.DB.prepare(`
      SELECT * FROM terminal_sessions WHERE session_id = ?
    `).bind(sessionId).first();

    if (!session) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Session not found',
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 查询输出增量
    const { results: outputs } = await env.DB.prepare(`
      SELECT output_data, cursor_end
      FROM terminal_outputs
      WHERE session_id = ? AND cursor_start >= ?
      ORDER BY cursor_start ASC
    `).bind(sessionId, fromCursor).all();

    // 拼接输出
    let outputData = '';
    let toCursor = fromCursor;

    if (outputs && outputs.length > 0) {
      outputData = outputs.map((o: any) => o.output_data).join('');
      toCursor = outputs[outputs.length - 1].cursor_end as number;
    }

    const response: TerminalOutputResponse = {
      success: true,
      session_id: sessionId,
      from_cursor: fromCursor,
      to_cursor: toCursor,
      output_data: outputData,
      state: session.state as string,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Get terminal output error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error',
      details: error.message,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * 获取用户的所有终端会话
 * GET /terminal/sessions
 */
export async function getTerminalSessions(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  try {
    // TODO: 从 JWT 获取用户 ID
    const userId = 'admin';

    // 查询会话列表（只返回未关闭的会话）
    const { results: sessions } = await env.DB.prepare(`
      SELECT session_id, agent_id, user_id, shell_type, state, output_cursor, cols, rows, created_at, updated_at
      FROM terminal_sessions
      WHERE user_id = ? AND state != 'closed'
      ORDER BY created_at DESC
      LIMIT 100
    `).bind(userId).all();

    return new Response(JSON.stringify(sessions || []), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Get terminal sessions error:', error);
    console.error('Error details:', error.message, error.stack);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error',
      details: error.message,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * 关闭终端会话
 * POST /terminal/close/:sessionId
 * 
 * 立即标记会话为关闭状态，同时通过任务系统通知 agent
 */
export async function closeTerminal(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  sessionId: string
): Promise<Response> {
  try {
    // 查询会话
    const session = await env.DB.prepare(`
      SELECT * FROM terminal_sessions WHERE session_id = ?
    `).bind(sessionId).first();

    if (!session) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Session not found',
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 立即标记会话为关闭状态（软删除）
    await env.DB.prepare(`
      UPDATE terminal_sessions
      SET state = 'closed', closed_at = datetime('now'), updated_at = datetime('now')
      WHERE session_id = ?
    `).bind(sessionId).run();

    // 检查是否已有关闭任务
    const existingTask = await env.DB.prepare(`
      SELECT id FROM tasks WHERE id = ?
    `).bind(`term-close-${sessionId}`).first();

    if (!existingTask) {
      // 创建关闭任务通知 agent（如果 agent 在线的话）
      const taskId = `term-close-${sessionId}`;
      const now = Date.now();
      const taskPayload = {
        session_id: sessionId,
      };

      try {
        await env.DB.prepare(`
          INSERT INTO tasks (id, device_id, type, desired_state, payload, revision, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          taskId,
          session.agent_id,
          'terminal_close',
          'pending',
          JSON.stringify(taskPayload),
          1,
          now,
          now
        ).run();
      } catch (taskError: any) {
        console.error('Task creation error (non-critical):', taskError);
        // 任务创建失败不影响关闭操作，因为会话已经标记为关闭
      }
    }

    // 记录审计日志
    try {
      const auditService = createAuditService(env);
      await auditService.logEvent(
        'terminal_close',
        session.agent_id as string,
        null,
        {
          terminal_close: {
            session_id: sessionId,
          },
        },
        'success',
        undefined,
        request
      );
    } catch (auditError: any) {
      console.error('Audit log error:', auditError);
      // 审计日志失败不影响主流程
    }

    return new Response(JSON.stringify({
      success: true,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Close terminal error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error',
      details: error.message,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * 调整终端窗口大小
 * POST /terminal/resize
 */
export async function resizeTerminal(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  try {
    const body = await request.json() as {
      session_id: string;
      cols: number;
      rows: number;
    };

    // 验证必需字段
    if (!body.session_id || !body.cols || !body.rows) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required fields: session_id, cols, rows',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 查询会话
    const session = await env.DB.prepare(`
      SELECT * FROM terminal_sessions WHERE session_id = ?
    `).bind(body.session_id).first();

    if (!session) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Session not found',
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 更新会话尺寸
    await env.DB.prepare(`
      UPDATE terminal_sessions
      SET cols = ?, rows = ?, updated_at = datetime('now')
      WHERE session_id = ?
    `).bind(body.cols, body.rows, body.session_id).run();

    // 创建调整大小任务（resize 使用时间戳保证唯一性，因为可能需要多次调整）
    const taskId = `term-resize-${body.session_id}-${Date.now()}`;
    const now = Date.now();
    const taskPayload = {
      session_id: body.session_id,
      cols: body.cols,
      rows: body.rows,
    };

    try {
      await env.DB.prepare(`
        INSERT INTO tasks (id, device_id, type, desired_state, payload, revision, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        taskId,
        session.agent_id,
        'terminal_resize',
        'pending',
        JSON.stringify(taskPayload),
        1,
        now,
        now
      ).run();
    } catch (taskError: any) {
      console.error('Task creation error:', taskError);
      return new Response(JSON.stringify({
        success: false,
        error: 'Task creation error',
        details: taskError.message,
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Resize terminal error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error',
      details: error.message,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
