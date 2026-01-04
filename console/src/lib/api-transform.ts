/**
 * API 响应转换工具
 * 将服务端返回的 snake_case 字段统一转换为 camelCase
 */

import type {
  Device,
  Session,
  AuditLog,
  FileInfo,
  CommandResult,
  AuditFilters,
  AuditResponse,
  SessionCreateResponse,
} from '../types/api';

// ============= 通用转换函数 =============

/**
 * 将对象的 snake_case 键转换为 camelCase
 */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * 将对象的 camelCase 键转换为 snake_case
 */
export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * 递归转换对象键为 camelCase
 */
export function transformKeysToCamelCase<T>(obj: any): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => transformKeysToCamelCase(item)) as T;
  }
  
  if (typeof obj === 'object') {
    const result: Record<string, any> = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const camelKey = snakeToCamel(key);
        result[camelKey] = transformKeysToCamelCase(obj[key]);
      }
    }
    return result as T;
  }
  
  return obj;
}

/**
 * 递归转换对象键为 snake_case (用于发送请求)
 */
export function transformKeysToSnakeCase<T>(obj: any): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => transformKeysToSnakeCase(item)) as T;
  }
  
  if (typeof obj === 'object') {
    const result: Record<string, any> = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const snakeKey = camelToSnake(key);
        result[snakeKey] = transformKeysToSnakeCase(obj[key]);
      }
    }
    return result as T;
  }
  
  return obj;
}

// ============= 类型特定的转换函数 =============

/**
 * 转换设备数据
 */
export function transformDevice(raw: any): Device {
  return {
    id: raw.id,
    deviceId: raw.deviceId || raw.device_id,
    name: raw.name,
    platform: raw.platform,
    version: raw.version,
    status: raw.status,
    lastSeen: raw.lastSeen || raw.last_seen,
    enrolledAt: raw.enrolledAt || raw.enrolled_at,
    publicKey: raw.publicKey || raw.public_key,
    createdAt: raw.createdAt || raw.created_at,
    updatedAt: raw.updatedAt || raw.updated_at,
  };
}

/**
 * 转换会话数据
 */
export function transformSession(raw: any): Session {
  return {
    id: raw.id,
    deviceId: raw.deviceId || raw.device_id,
    durableObjectId: raw.durableObjectId || raw.durable_object_id,
    status: raw.status,
    createdAt: raw.createdAt || raw.created_at,
    expiresAt: raw.expiresAt || raw.expires_at,
    lastActivity: raw.lastActivity || raw.last_activity,
    devicePlatform: raw.devicePlatform || raw.device_platform,
    deviceVersion: raw.deviceVersion || raw.device_version,
  };
}

/**
 * 转换审计日志数据
 */
export function transformAuditLog(raw: any): AuditLog {
  return {
    id: raw.id,
    deviceId: raw.deviceId || raw.device_id,
    sessionId: raw.sessionId || raw.session_id,
    actionType: raw.actionType || raw.action_type,
    actionData: raw.actionData || raw.action_data,
    result: raw.result,
    timestamp: raw.timestamp,
  };
}

/**
 * 转换文件信息
 */
export function transformFileInfo(raw: any): FileInfo {
  return {
    name: raw.name,
    path: raw.path,
    size: raw.size,
    isDirectory: raw.isDirectory ?? raw.is_directory ?? false,
    modified: raw.modified,
    permissions: raw.permissions,
  };
}

/**
 * 转换命令结果
 */
export function transformCommandResult(raw: any): CommandResult {
  return {
    id: raw.id,
    command: raw.command,
    exitCode: raw.exitCode ?? raw.exit_code ?? 0,
    stdout: raw.stdout || '',
    stderr: raw.stderr || '',
    timestamp: raw.timestamp,
  };
}

/**
 * 转换审计响应
 */
export function transformAuditResponse(raw: any): AuditResponse {
  return {
    logs: (raw.logs || []).map(transformAuditLog),
    total: raw.total || 0,
    hasMore: raw.hasMore ?? raw.has_more ?? false,
  };
}

/**
 * 转换会话创建响应
 */
export function transformSessionCreateResponse(raw: any): SessionCreateResponse {
  return {
    sessionId: raw.sessionId || raw.session_id,
    websocketUrl: raw.websocketUrl || raw.websocket_url,
    expiresAt: raw.expiresAt || raw.expires_at,
  };
}

/**
 * 将 AuditFilters 转换为请求参数 (snake_case)
 */
export function transformAuditFiltersToRequest(filters: AuditFilters): Record<string, any> {
  const result: Record<string, any> = {};
  
  if (filters.deviceId) result.device_id = filters.deviceId;
  if (filters.actionType) result.action_type = filters.actionType;
  if (filters.startTime) result.start_time = filters.startTime;
  if (filters.endTime) result.end_time = filters.endTime;
  if (filters.limit) result.limit = filters.limit;
  if (filters.offset) result.offset = filters.offset;
  if (filters.severity) result.severity = filters.severity;
  if (filters.search) result.search = filters.search;
  
  return result;
}

// ============= 批量转换函数 =============

export function transformDevices(raw: any[]): Device[] {
  return raw.map(transformDevice);
}

export function transformSessions(raw: any[]): Session[] {
  return raw.map(transformSession);
}

export function transformAuditLogs(raw: any[]): AuditLog[] {
  return raw.map(transformAuditLog);
}

export function transformFileInfos(raw: any[]): FileInfo[] {
  return raw.map(transformFileInfo);
}
