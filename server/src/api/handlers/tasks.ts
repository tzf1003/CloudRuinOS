/**
 * 任务管理 API 处理器
 * 
 * 提供任务的创建、查询、取消等功能
 */

import { Env } from '../../index';
import { createAuditService } from '../utils/audit';

export interface CreateTaskRequest {
  device_id: string;
  type: 'config_update' | 'cmd_exec';
  payload: any;
}

export interface CreateTaskResponse {
  success: boolean;
  task_id?: string;
  error?: string;
}

export interface GetTaskResponse {
  success: boolean;
  task?: {
    task_id: string;
    device_id: string;
    type: string;
    desired_state: string;
    payload: any;
    revision: number;
    created_at: number;
    updated_at: number;
    agent_state?: string;
    agent_progress?: number;
    agent_error?: string;
    output?: string;
  };
  error?: string;
}

export interface ListTasksResponse {
  success: boolean;
  tasks?: Array<{
    task_id: string;
    device_id: string;
    type: string;
    desired_state: string;
    revision: number;
    created_at: number;
    updated_at: number;
    agent_state?: string;
    agent_progress?: number;
  }>;
  total?: number;
  error?: string;
}

export interface CancelTaskResponse {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * 创建任务
 * POST /admin/tasks
 */
export async function createTask(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  try {
    const body = await request.json() as CreateTaskRequest;

    // 验证必需字段
    if (!body.device_id || !body.type || !body.payload) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required fields: device_id, type, payload',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 验证任务类型
    if (body.type !== 'config_update' && body.type !== 'cmd_exec') {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid task type. Must be config_update or cmd_exec',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 生成任务 ID
    const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    // 插入任务到数据库
    await env.DB.prepare(`
      INSERT INTO tasks (id, device_id, type, desired_state, payload, revision, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      taskId,
      body.device_id,
      body.type,
      'pending',
      JSON.stringify(body.payload),
      1,
      now,
      now
    ).run();

    // 记录审计日志
    const auditService = createAuditService(env);
    await auditService.logEvent(
      'command_execute',
      body.device_id,
      null,
      {
        command_execute: {
          command: `task_created:${body.type}`,
          args: [taskId],
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

    const response: CreateTaskResponse = {
      success: true,
      task_id: taskId,
    };

    return new Response(JSON.stringify(response), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Create task error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * 获取任务详情
 * GET /admin/tasks/:taskId
 */
export async function getTask(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  taskId: string
): Promise<Response> {
  try {
    // 查询任务
    const task = await env.DB.prepare(`
      SELECT * FROM tasks WHERE id = ?
    `).bind(taskId).first();

    if (!task) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Task not found',
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 查询任务状态
    const taskState = await env.DB.prepare(`
      SELECT * FROM task_states WHERE task_id = ?
    `).bind(taskId).first();

    // 查询任务输出
    const { results: logs } = await env.DB.prepare(`
      SELECT content FROM task_logs WHERE task_id = ? ORDER BY created_at ASC
    `).bind(taskId).all();

    const output = logs ? logs.map((log: any) => log.content).join('') : '';

    const response: GetTaskResponse = {
      success: true,
      task: {
        task_id: task.id as string,
        device_id: task.device_id as string,
        type: task.type as string,
        desired_state: task.desired_state as string,
        payload: JSON.parse(task.payload as string),
        revision: task.revision as number,
        created_at: task.created_at as number,
        updated_at: task.updated_at as number,
        agent_state: taskState?.state as string | undefined,
        agent_progress: taskState?.progress as number | undefined,
        agent_error: taskState?.error as string | undefined,
        output,
      },
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Get task error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * 列出设备的任务
 * GET /admin/devices/:deviceId/tasks
 */
export async function listDeviceTasks(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  deviceId: string
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    // 查询任务列表
    const { results: tasks } = await env.DB.prepare(`
      SELECT t.*, ts.state as agent_state, ts.progress as agent_progress
      FROM tasks t
      LEFT JOIN task_states ts ON t.id = ts.task_id
      WHERE t.device_id = ?
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(deviceId, limit, offset).all();

    // 查询总数
    const total = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM tasks WHERE device_id = ?
    `).bind(deviceId).first();

    const response: ListTasksResponse = {
      success: true,
      tasks: (tasks || []).map((task: any) => ({
        task_id: task.id,
        device_id: task.device_id,
        type: task.type,
        desired_state: task.desired_state,
        revision: task.revision,
        created_at: task.created_at,
        updated_at: task.updated_at,
        agent_state: task.agent_state,
        agent_progress: task.agent_progress,
      })),
      total: (total as any)?.count || 0,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('List tasks error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * 取消任务
 * POST /admin/tasks/:taskId/cancel
 */
export async function cancelTask(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  taskId: string
): Promise<Response> {
  try {
    // 查询任务
    const task = await env.DB.prepare(`
      SELECT * FROM tasks WHERE id = ?
    `).bind(taskId).first();

    if (!task) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Task not found',
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 更新任务状态为 canceled，增加 revision
    const newRevision = (task.revision as number) + 1;
    const now = Date.now();

    await env.DB.prepare(`
      UPDATE tasks 
      SET desired_state = 'canceled', revision = ?, updated_at = ?
      WHERE id = ?
    `).bind(newRevision, now, taskId).run();

    // 记录审计日志
    const auditService = createAuditService(env);
    await auditService.logEvent(
      'command_execute',
      task.device_id as string,
      null,
      {
        command_execute: {
          command: 'task_canceled',
          args: [taskId, newRevision.toString()],
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

    const response: CancelTaskResponse = {
      success: true,
      message: `Task ${taskId} canceled (revision ${newRevision})`,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Cancel task error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
