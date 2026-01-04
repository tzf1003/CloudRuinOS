/**
 * 注册令牌管理 API 处理器
 * 处理注册令牌的生成、验证和管理
 */

import { Env } from '../../index';
import { generateEnrollmentToken } from '../utils/crypto';
import { CloudflareKVManager } from '../../storage/kv-manager';

/**
 * 生成注册令牌 API 处理器
 * POST /enrollment/token
 */
export async function generateEnrollmentTokenHandler(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body = await request.json().catch(() => ({})) as {
      expiresIn?: number | 'never';
      description?: string;
      createdBy?: string;
      maxUsage?: number;
    };

    // 处理过期时间
    let expiresIn: number;
    let expiresAt: number | null;
    
    if (body.expiresIn === 'never' || body.expiresIn === 0) {
      // 永不过期
      expiresIn = 0;
      expiresAt = null;
    } else {
      expiresIn = body.expiresIn || 3600; // 默认1小时
      if (expiresIn < 60 || expiresIn > 31536000) { // 最大1年
        return new Response(JSON.stringify({
          success: false,
          error: 'Invalid expiration time',
          message: 'Expiration time must be between 60 seconds and 1 year, or "never" for permanent tokens',
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      expiresAt = Date.now() + (expiresIn * 1000);
    }

    const description = body.description?.trim() || '';
    const maxUsage = body.maxUsage || 1;

    // 创建 KV 管理器
    const kvManager = new CloudflareKVManager(env.KV);

    // 生成令牌
    const token = await generateEnrollmentToken(
      kvManager,
      expiresIn,
      body.createdBy || 'console'
    );

    // 同时存储到数据库以支持管理界面
    await env.DB.prepare(`
      INSERT INTO enrollment_tokens (
        token, description, created_by, created_at, expires_at, max_usage
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      token,
      description || null,
      body.createdBy || 'console',
      Date.now(),
      expiresAt,
      maxUsage
    ).run();

    return new Response(JSON.stringify({
      success: true,
      token,
      description,
      expiresAt,
      expiresIn: expiresIn === 0 ? 'never' : expiresIn,
      maxUsage,
      createdBy: body.createdBy || 'console',
      timestamp: Date.now(),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Generate enrollment token error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to generate enrollment token',
      message: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * 获取注册令牌列表 API 处理器
 * GET /enrollment/tokens
 */
export async function getEnrollmentTokensHandler(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const status = url.searchParams.get('status'); // 'active', 'expired', 'used', 'all'
    const search = url.searchParams.get('search')?.trim();

    // 构建查询条件
    let whereClause = '';
    const params: any[] = [];
    
    if (status && status !== 'all') {
      switch (status) {
        case 'active':
          whereClause += ' WHERE is_active = 1 AND (expires_at IS NULL OR expires_at > ?) AND used_at IS NULL';
          params.push(Date.now());
          break;
        case 'expired':
          whereClause += ' WHERE expires_at IS NOT NULL AND expires_at <= ?';
          params.push(Date.now());
          break;
        case 'used':
          whereClause += ' WHERE used_at IS NOT NULL';
          break;
      }
    }
    
    if (search) {
      const searchClause = whereClause ? ' AND' : ' WHERE';
      whereClause += `${searchClause} (description LIKE ? OR token LIKE ? OR created_by LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    // 查询令牌列表
    const stmt = env.DB.prepare(`
      SELECT 
        id,
        token,
        description,
        created_by,
        created_at,
        expires_at,
        used_at,
        used_by_device,
        is_active,
        usage_count,
        max_usage
      FROM enrollment_tokens
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);

    params.push(limit, offset);
    const result = await stmt.bind(...params).all();

    // 获取总数
    const countStmt = env.DB.prepare(`
      SELECT COUNT(*) as total
      FROM enrollment_tokens
      ${whereClause}
    `);

    const countParams = params.slice(0, -2); // 移除 limit 和 offset
    const countResult = await countStmt.bind(...countParams).first();
    const total = (countResult as any)?.total || 0;

    // 处理令牌状态
    const now = Date.now();
    const tokens = result.results.map((row: any) => {
      let tokenStatus = 'active';
      
      if (!row.is_active) {
        tokenStatus = 'disabled';
      } else if (row.used_at) {
        tokenStatus = 'used';
      } else if (row.expires_at && now > row.expires_at) {
        tokenStatus = 'expired';
      }

      return {
        id: row.id,
        token: row.token,
        description: row.description,
        createdBy: row.created_by,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        usedAt: row.used_at,
        usedByDevice: row.used_by_device,
        isActive: Boolean(row.is_active),
        usageCount: row.usage_count,
        maxUsage: row.max_usage,
        status: tokenStatus,
        isExpired: row.expires_at ? now > row.expires_at : false,
        isPermanent: !row.expires_at,
      };
    });

    return new Response(JSON.stringify({
      success: true,
      tokens,
      total,
      limit,
      offset,
      timestamp: Date.now(),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Get enrollment tokens error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to get enrollment tokens',
      message: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * 验证注册令牌 API 处理器
 * GET /enrollment/token/:token
 */
export async function validateEnrollmentTokenHandler(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const token = url.pathname.split('/').pop();

    if (!token) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing token',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 创建 KV 管理器
    const kvManager = new CloudflareKVManager(env.KV);

    // 获取令牌记录
    const tokenRecord = await kvManager.getEnrollmentToken(token);

    if (!tokenRecord) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Token not found or expired',
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 检查是否已使用
    if (tokenRecord.used) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Token already used',
        usedBy: tokenRecord.device_id,
        usedAt: tokenRecord.used_at,
      }), {
        status: 410,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 检查是否过期
    const now = Date.now();
    if (tokenRecord.expires_at && now > tokenRecord.expires_at) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Token expired',
        expiredAt: tokenRecord.expires_at,
      }), {
        status: 410,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      token: tokenRecord.token,
      description: tokenRecord.description,
      createdAt: tokenRecord.created_at,
      expiresAt: tokenRecord.expires_at,
      createdBy: tokenRecord.created_by,
      valid: true,
      timestamp: now,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Validate enrollment token error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to validate enrollment token',
      message: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * 更新注册令牌 API 处理器
 * PUT /enrollment/token/:id
 */
export async function updateEnrollmentTokenHandler(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const tokenId = url.pathname.split('/').pop();

    if (!tokenId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing token ID',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json() as {
      description?: string;
      isActive?: boolean;
    };

    // 构建更新字段
    const updateFields: string[] = [];
    const values: any[] = [];
    
    if (body.description !== undefined) {
      updateFields.push('description = ?');
      values.push(body.description.trim() || null);
    }
    
    if (body.isActive !== undefined) {
      updateFields.push('is_active = ?');
      values.push(body.isActive ? 1 : 0);
    }
    
    if (updateFields.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No fields to update',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    values.push(tokenId);
    
    const stmt = env.DB.prepare(`
      UPDATE enrollment_tokens 
      SET ${updateFields.join(', ')}
      WHERE id = ?
    `);
    
    const result = await stmt.bind(...values).run();
    
    if ((result as any).changes === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Token not found',
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Token updated successfully',
      timestamp: Date.now(),
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Update enrollment token error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to update enrollment token',
      message: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * 删除注册令牌 API 处理器
 * DELETE /enrollment/token/:id
 */
export async function deleteEnrollmentTokenHandler(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const tokenId = url.pathname.split('/').pop();

    if (!tokenId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing token ID',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 获取令牌信息以便从 KV 中删除
    const tokenInfo = await env.DB.prepare(
      'SELECT token FROM enrollment_tokens WHERE id = ?'
    ).bind(tokenId).first();

    if (!tokenInfo) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Token not found',
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 从数据库删除
    const stmt = env.DB.prepare('DELETE FROM enrollment_tokens WHERE id = ?');
    const result = await stmt.bind(tokenId).run();
    
    if ((result as any).changes === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Token not found',
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Token deleted successfully',
      timestamp: Date.now(),
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Delete enrollment token error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to delete enrollment token',
      message: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}