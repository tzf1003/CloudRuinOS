/**
 * 审计日志 API 处理器
 * 实现审计日志查询功能
 * Requirements: 9.5
 */

import { Env } from '../../index';
import { getAuditLogs } from '../utils/database';
import { AuditLogFilters } from '../../types/database';

/**
 * 审计日志查询 API 处理器
 * GET /audit
 */
export async function getAuditLogsHandler(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const searchParams = url.searchParams;

    // 解析查询参数
    const filters: AuditLogFilters = {
      device_id: searchParams.get('device_id') || undefined,
      session_id: searchParams.get('session_id') || undefined,
      action_type: searchParams.get('action_type') as any || undefined,
      result: searchParams.get('result') as any || undefined,
      start_time: searchParams.get('start_time') ? parseInt(searchParams.get('start_time')!) : undefined,
      end_time: searchParams.get('end_time') ? parseInt(searchParams.get('end_time')!) : undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 100,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0,
    };

    // 验证参数
    if (filters.limit !== undefined && (filters.limit < 1 || filters.limit > 1000)) {
      return new Response(JSON.stringify({
        error: 'Invalid limit parameter. Must be between 1 and 1000.',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (filters.offset !== undefined && filters.offset < 0) {
      return new Response(JSON.stringify({
        error: 'Invalid offset parameter. Must be non-negative.',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 查询审计日志
    const result = await getAuditLogs(env.DB, filters);

    // 处理 action_data 字段，将 JSON 字符串解析为对象
    const processedData = result.data.map(log => ({
      ...log,
      action_data: log.action_data ? JSON.parse(log.action_data) : null,
    }));

    return new Response(JSON.stringify({
      success: true,
      data: processedData,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        has_more: result.has_more,
      },
      filters: filters,
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });

  } catch (error) {
    console.error('Audit logs query error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error',
      message: 'Failed to query audit logs',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}