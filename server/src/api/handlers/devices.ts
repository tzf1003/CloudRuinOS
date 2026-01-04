/**
 * 设备管理 API 处理器
 * 处理设备列表、详情、状态等相关请求
 */

import { Env } from '../../index';

/**
 * 获取设备列表
 */
export async function getDevices(request: Request, env: Env): Promise<Response> {
  try {
    // 从数据库查询设备列表
    const stmt = env.DB.prepare(`
      SELECT 
        id,
        enrollment_token,
        public_key,
        platform,
        version,
        last_seen,
        status,
        created_at,
        updated_at
      FROM devices 
      ORDER BY last_seen DESC
    `);
    
    const result = await stmt.all();
    
    const devices = result.results.map((row: any) => ({
      id: row.id,
      deviceId: row.id,
      name: `Device ${row.id.substring(0, 8)}`,
      platform: row.platform,
      version: row.version,
      status: row.status,
      lastSeen: row.last_seen,
      enrolledAt: row.created_at,
      publicKey: row.public_key,
    }));

    return new Response(JSON.stringify({
      success: true,
      devices,
      total: devices.length,
      timestamp: Date.now(),
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Get devices error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to fetch devices',
      message: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * 获取单个设备详情
 */
export async function getDevice(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const deviceId = url.pathname.split('/').pop();
    
    if (!deviceId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Device ID is required',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const stmt = env.DB.prepare(`
      SELECT 
        id,
        enrollment_token,
        public_key,
        platform,
        version,
        last_seen,
        status,
        created_at,
        updated_at
      FROM devices 
      WHERE id = ?
    `);
    
    const result = await stmt.bind(deviceId).first();
    
    if (!result) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Device not found',
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const device = {
      id: result.id,
      deviceId: result.id,
      name: `Device ${(result.id as string).substring(0, 8)}`,
      platform: result.platform,
      version: result.version,
      status: result.status,
      lastSeen: result.last_seen,
      enrolledAt: result.created_at,
      publicKey: result.public_key,
    };

    return new Response(JSON.stringify({
      success: true,
      device,
      timestamp: Date.now(),
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Get device error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to fetch device',
      message: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * 更新设备信息
 */
export async function updateDevice(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const deviceId = url.pathname.split('/').pop();
    
    if (!deviceId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Device ID is required',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const updateData = await request.json() as {
      name?: string;
      status?: string;
      metadata?: any;
    };

    // 构建动态更新语句
    const updateFields: string[] = [];
    const values: any[] = [];
    
    if (updateData.status !== undefined) {
      updateFields.push('status = ?');
      values.push(updateData.status);
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
    
    values.push(deviceId);
    
    const stmt = env.DB.prepare(`
      UPDATE devices 
      SET ${updateFields.join(', ')}, updated_at = ?
      WHERE id = ?
    `);
    
    values.splice(-1, 0, Date.now()); // 在最后一个参数前插入时间戳
    
    const result = await stmt.bind(...values).run();
    
    if ((result as any).changes === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Device not found or no changes made',
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Device updated successfully',
      timestamp: Date.now(),
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Update device error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to update device',
      message: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * 删除设备
 */
export async function deleteDevice(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const deviceId = url.pathname.split('/').pop();
    
    if (!deviceId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Device ID is required',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const stmt = env.DB.prepare('DELETE FROM devices WHERE id = ?');
    const result = await stmt.bind(deviceId).run();
    
    if ((result as any).changes === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Device not found',
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Device deleted successfully',
      timestamp: Date.now(),
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Delete device error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to delete device',
      message: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}