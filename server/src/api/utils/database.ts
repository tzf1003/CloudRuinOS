/**
 * 数据库操作工具函数
 * 实现设备、会话、审计日志等数据库操作
 * Requirements: 1.4, 9.1, 9.2, 9.3, 9.4
 */

import {
  Device,
  CreateDeviceInput,
  UpdateDeviceInput,
  Session,
  CreateSessionInput,
  UpdateSessionInput,
  AuditLog,
  CreateAuditLogInput,
  AuditLogFilters,
  FileOperation,
  CreateFileOperationInput,
  FileOperationFilters,
  QueryResult,
  PaginatedResult,
} from '../../types/database';

// ==================== 设备操作 ====================

/**
 * 创建设备记录
 */
export async function createDevice(db: D1Database, input: CreateDeviceInput): Promise<boolean> {
  try {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO devices (
        id, enrollment_token, public_key, platform, version, 
        last_seen, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = await stmt.bind(
      input.id,
      input.enrollment_token || null,
      input.public_key,
      input.platform,
      input.version,
      now, // last_seen
      'online', // status
      now, // created_at
      now  // updated_at
    ).run();

    return result.success;
  } catch (error) {
    console.error('Failed to create device:', error);
    return false;
  }
}

/**
 * 根据 ID 获取设备
 */
export async function getDeviceById(db: D1Database, deviceId: string): Promise<Device | null> {
  try {
    const stmt = db.prepare('SELECT * FROM devices WHERE id = ?');
    const result = await stmt.bind(deviceId).first<Device>();
    return result || null;
  } catch (error) {
    console.error('Failed to get device by ID:', error);
    return null;
  }
}

/**
 * 更新设备信息
 */
export async function updateDevice(
  db: D1Database,
  deviceId: string,
  input: UpdateDeviceInput
): Promise<boolean> {
  try {
    const updates: string[] = [];
    const values: any[] = [];

    if (input.last_seen !== undefined) {
      updates.push('last_seen = ?');
      values.push(input.last_seen);
    }

    if (input.status !== undefined) {
      updates.push('status = ?');
      values.push(input.status);
    }

    if (input.version !== undefined) {
      updates.push('version = ?');
      values.push(input.version);
    }

    if (updates.length === 0) {
      return true; // 没有更新
    }

    updates.push('updated_at = ?');
    values.push(Date.now());
    values.push(deviceId);

    const stmt = db.prepare(`
      UPDATE devices SET ${updates.join(', ')} WHERE id = ?
    `);

    const result = await stmt.bind(...values).run();
    return result.success;
  } catch (error) {
    console.error('Failed to update device:', error);
    return false;
  }
}

/**
 * 获取所有设备列表
 */
export async function getAllDevices(
  db: D1Database,
  limit: number = 100,
  offset: number = 0
): Promise<PaginatedResult<Device>> {
  try {
    // 获取总数
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM devices');
    const countResult = await countStmt.first<{ count: number }>();
    const total = countResult?.count || 0;

    // 获取数据
    const dataStmt = db.prepare(`
      SELECT * FROM devices 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `);
    const dataResult = await dataStmt.bind(limit, offset).all<Device>();

    return {
      data: dataResult.results || [],
      total,
      page: Math.floor(offset / limit) + 1,
      limit,
      has_more: offset + limit < total,
    };
  } catch (error) {
    console.error('Failed to get all devices:', error);
    return {
      data: [],
      total: 0,
      page: 1,
      limit,
      has_more: false,
    };
  }
}

// ==================== 会话操作 ====================

/**
 * 创建会话记录
 */
export async function createSession(db: D1Database, input: CreateSessionInput): Promise<boolean> {
  try {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO sessions (
        id, device_id, durable_object_id, status, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = await stmt.bind(
      input.id,
      input.device_id,
      input.durable_object_id,
      'active',
      now,
      input.expires_at
    ).run();

    return result.success;
  } catch (error) {
    console.error('Failed to create session:', error);
    return false;
  }
}

/**
 * 根据 ID 获取会话
 */
export async function getSessionById(db: D1Database, sessionId: string): Promise<Session | null> {
  try {
    const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
    const result = await stmt.bind(sessionId).first<Session>();
    return result || null;
  } catch (error) {
    console.error('Failed to get session by ID:', error);
    return null;
  }
}

/**
 * 更新会话信息
 */
export async function updateSession(
  db: D1Database,
  sessionId: string,
  input: UpdateSessionInput
): Promise<boolean> {
  try {
    const updates: string[] = [];
    const values: any[] = [];

    if (input.status !== undefined) {
      updates.push('status = ?');
      values.push(input.status);
    }

    if (input.last_activity !== undefined) {
      updates.push('last_activity = ?');
      values.push(input.last_activity);
    }

    if (input.expires_at !== undefined) {
      updates.push('expires_at = ?');
      values.push(input.expires_at);
    }

    if (updates.length === 0) {
      return true; // 没有更新
    }

    values.push(sessionId);

    const stmt = db.prepare(`
      UPDATE sessions SET ${updates.join(', ')} WHERE id = ?
    `);

    const result = await stmt.bind(...values).run();
    return result.success;
  } catch (error) {
    console.error('Failed to update session:', error);
    return false;
  }
}

/**
 * 获取设备的活跃会话
 */
export async function getActiveSessionsByDevice(
  db: D1Database,
  deviceId: string
): Promise<Session[]> {
  try {
    const stmt = db.prepare(`
      SELECT * FROM sessions 
      WHERE device_id = ? AND status = 'active' AND expires_at > ?
      ORDER BY created_at DESC
    `);

    const result = await stmt.bind(deviceId, Date.now()).all<Session>();
    return result.results || [];
  } catch (error) {
    console.error('Failed to get active sessions by device:', error);
    return [];
  }
}

// ==================== 审计日志操作 ====================

/**
 * 创建审计日志记录
 */
export async function createAuditLog(db: D1Database, input: CreateAuditLogInput): Promise<boolean> {
  try {
    const stmt = db.prepare(`
      INSERT INTO audit_logs (
        device_id, session_id, action_type, action_data, result, 
        error_message, timestamp, ip_address, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = await stmt.bind(
      input.device_id,
      input.session_id || null,
      input.action_type,
      input.action_data ? JSON.stringify(input.action_data) : null,
      input.result,
      input.error_message || null,
      Date.now(),
      input.ip_address || null,
      input.user_agent || null
    ).run();

    return result.success;
  } catch (error) {
    console.error('Failed to create audit log:', error);
    return false;
  }
}

/**
 * 查询审计日志
 */
export async function getAuditLogs(
  db: D1Database,
  filters: AuditLogFilters = {}
): Promise<PaginatedResult<AuditLog>> {
  try {
    const conditions: string[] = [];
    const values: any[] = [];

    // 构建查询条件
    if (filters.device_id) {
      conditions.push('device_id = ?');
      values.push(filters.device_id);
    }

    if (filters.session_id) {
      conditions.push('session_id = ?');
      values.push(filters.session_id);
    }

    if (filters.action_type) {
      conditions.push('action_type = ?');
      values.push(filters.action_type);
    }

    if (filters.result) {
      conditions.push('result = ?');
      values.push(filters.result);
    }

    if (filters.start_time) {
      conditions.push('timestamp >= ?');
      values.push(filters.start_time);
    }

    if (filters.end_time) {
      conditions.push('timestamp <= ?');
      values.push(filters.end_time);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit || 100;
    const offset = filters.offset || 0;

    // 获取总数
    const countStmt = db.prepare(`SELECT COUNT(*) as count FROM audit_logs ${whereClause}`);
    const countResult = await countStmt.bind(...values).first<{ count: number }>();
    const total = countResult?.count || 0;

    // 获取数据
    const dataStmt = db.prepare(`
      SELECT * FROM audit_logs ${whereClause}
      ORDER BY timestamp DESC 
      LIMIT ? OFFSET ?
    `);
    const dataResult = await dataStmt.bind(...values, limit, offset).all<AuditLog>();

    return {
      data: dataResult.results || [],
      total,
      page: Math.floor(offset / limit) + 1,
      limit,
      has_more: offset + limit < total,
    };
  } catch (error) {
    console.error('Failed to get audit logs:', error);
    return {
      data: [],
      total: 0,
      page: 1,
      limit: filters.limit || 100,
      has_more: false,
    };
  }
}

// ==================== 文件操作记录 ====================

/**
 * 创建文件操作记录
 */
export async function createFileOperation(
  db: D1Database,
  input: CreateFileOperationInput
): Promise<boolean> {
  try {
    const stmt = db.prepare(`
      INSERT INTO file_operations (
        device_id, session_id, operation_type, file_path, file_size,
        checksum, status, error_message, timestamp, duration_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = await stmt.bind(
      input.device_id,
      input.session_id || null,
      input.operation_type,
      input.file_path,
      input.file_size || null,
      input.checksum || null,
      input.status,
      input.error_message || null,
      Date.now(),
      input.duration_ms || null
    ).run();

    return result.success;
  } catch (error) {
    console.error('Failed to create file operation record:', error);
    return false;
  }
}

/**
 * 查询文件操作记录
 */
export async function getFileOperations(
  db: D1Database,
  filters: FileOperationFilters = {}
): Promise<PaginatedResult<FileOperation>> {
  try {
    const conditions: string[] = [];
    const values: any[] = [];

    // 构建查询条件
    if (filters.device_id) {
      conditions.push('device_id = ?');
      values.push(filters.device_id);
    }

    if (filters.session_id) {
      conditions.push('session_id = ?');
      values.push(filters.session_id);
    }

    if (filters.operation_type) {
      conditions.push('operation_type = ?');
      values.push(filters.operation_type);
    }

    if (filters.status) {
      conditions.push('status = ?');
      values.push(filters.status);
    }

    if (filters.start_time) {
      conditions.push('timestamp >= ?');
      values.push(filters.start_time);
    }

    if (filters.end_time) {
      conditions.push('timestamp <= ?');
      values.push(filters.end_time);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit || 100;
    const offset = filters.offset || 0;

    // 获取总数
    const countStmt = db.prepare(`SELECT COUNT(*) as count FROM file_operations ${whereClause}`);
    const countResult = await countStmt.bind(...values).first<{ count: number }>();
    const total = countResult?.count || 0;

    // 获取数据
    const dataStmt = db.prepare(`
      SELECT * FROM file_operations ${whereClause}
      ORDER BY timestamp DESC 
      LIMIT ? OFFSET ?
    `);
    const dataResult = await dataStmt.bind(...values, limit, offset).all<FileOperation>();

    return {
      data: dataResult.results || [],
      total,
      page: Math.floor(offset / limit) + 1,
      limit,
      has_more: offset + limit < total,
    };
  } catch (error) {
    console.error('Failed to get file operations:', error);
    return {
      data: [],
      total: 0,
      page: 1,
      limit: filters.limit || 100,
      has_more: false,
    };
  }
}

// ==================== 清理操作 ====================

/**
 * 清理过期会话
 */
export async function cleanupExpiredSessions(db: D1Database): Promise<number> {
  try {
    const stmt = db.prepare(`
      UPDATE sessions 
      SET status = 'expired' 
      WHERE expires_at < ? AND status = 'active'
    `);

    const result = await stmt.bind(Date.now()).run();
    return result.meta?.changes || 0;
  } catch (error) {
    console.error('Failed to cleanup expired sessions:', error);
    return 0;
  }
}

/**
 * 清理旧的审计日志（保留指定天数）
 */
export async function cleanupOldAuditLogs(db: D1Database, retentionDays: number = 90): Promise<number> {
  try {
    const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    const stmt = db.prepare('DELETE FROM audit_logs WHERE timestamp < ?');

    const result = await stmt.bind(cutoffTime).run();
    return result.meta?.changes || 0;
  } catch (error) {
    console.error('Failed to cleanup old audit logs:', error);
    return 0;
  }
}

/**
 * 清理旧的文件操作记录（保留指定天数）
 */
export async function cleanupOldFileOperations(db: D1Database, retentionDays: number = 30): Promise<number> {
  try {
    const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    const stmt = db.prepare('DELETE FROM file_operations WHERE timestamp < ?');

    const result = await stmt.bind(cutoffTime).run();
    return result.meta?.changes || 0;
  } catch (error) {
    console.error('Failed to cleanup old file operations:', error);
    return 0;
  }
}

// ==================== 统计查询 ====================

/**
 * 获取设备统计信息
 */
export async function getDeviceStats(db: D1Database): Promise<{
  total: number;
  online: number;
  offline: number;
  error: number;
}> {
  try {
    const stmt = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as online,
        SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) as offline,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error
      FROM devices
    `);

    const result = await stmt.first<{
      total: number;
      online: number;
      offline: number;
      error: number;
    }>();

    return result || { total: 0, online: 0, offline: 0, error: 0 };
  } catch (error) {
    console.error('Failed to get device stats:', error);
    return { total: 0, online: 0, offline: 0, error: 0 };
  }
}

/**
 * 获取会话统计信息
 */
export async function getSessionStats(db: D1Database): Promise<{
  total: number;
  active: number;
  inactive: number;
  expired: number;
}> {
  try {
    const stmt = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) as inactive,
        SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expired
      FROM sessions
    `);

    const result = await stmt.first<{
      total: number;
      active: number;
      inactive: number;
      expired: number;
    }>();

    return result || { total: 0, active: 0, inactive: 0, expired: 0 };
  } catch (error) {
    console.error('Failed to get session stats:', error);
    return { total: 0, active: 0, inactive: 0, expired: 0 };
  }
}