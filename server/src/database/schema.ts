/**
 * 数据库 Schema 类型定义
 * 对应 migrations/0001_initial_schema.sql 中的表结构
 * 提供类型安全的数据库操作接口
 */

// ============= 设备表 (devices) =============

/**
 * 设备状态枚举
 */
export type DeviceStatus = 'online' | 'offline' | 'error';

/**
 * 设备平台枚举
 */
export type DevicePlatform = 'windows' | 'linux' | 'macos';

/**
 * 设备表记录
 */
export interface DeviceRow {
  /** 设备唯一标识符 */
  id: string;
  /** 注册时使用的令牌（可选，注册后可清空） */
  enrollment_token: string | null;
  /** Ed25519 公钥，用于验证设备签名 */
  public_key: string;
  /** 设备平台 (windows/linux/macos) */
  platform: DevicePlatform;
  /** Agent 版本号 */
  version: string;
  /** 最后心跳时间戳 (Unix timestamp) */
  last_seen: number;
  /** 设备状态 (online/offline/error) */
  status: DeviceStatus;
  /** 创建时间戳 */
  created_at: number;
  /** 更新时间戳 */
  updated_at: number;
}

/**
 * 创建设备所需的参数
 */
export interface DeviceInsert {
  id: string;
  enrollment_token?: string | null;
  public_key: string;
  platform: DevicePlatform;
  version: string;
  last_seen: number;
  status?: DeviceStatus;
  created_at: number;
  updated_at: number;
}

/**
 * 更新设备的可选参数
 */
export interface DeviceUpdate {
  enrollment_token?: string | null;
  public_key?: string;
  platform?: DevicePlatform;
  version?: string;
  last_seen?: number;
  status?: DeviceStatus;
  updated_at?: number;
}

// ============= 注册令牌表 (enrollment_tokens) =============

/**
 * 注册令牌表记录
 */
export interface EnrollmentTokenRow {
  /** 自增主键 */
  id: number;
  /** 令牌字符串 */
  token: string;
  /** 令牌描述 */
  description: string | null;
  /** 创建者 */
  created_by: string;
  /** 创建时间戳 */
  created_at: number;
  /** 过期时间戳 (NULL 表示永不过期) */
  expires_at: number | null;
  /** 使用时间戳 */
  used_at: number | null;
  /** 使用该令牌的设备 ID */
  used_by_device: string | null;
  /** 是否激活 */
  is_active: boolean;
  /** 使用次数 */
  usage_count: number;
  /** 最大使用次数 (NULL 表示无限制) */
  max_usage: number;
}

/**
 * 创建注册令牌所需的参数
 */
export interface EnrollmentTokenInsert {
  token: string;
  description?: string | null;
  created_by?: string;
  created_at: number;
  expires_at?: number | null;
  max_usage?: number;
}

/**
 * 更新注册令牌的可选参数
 */
export interface EnrollmentTokenUpdate {
  description?: string | null;
  expires_at?: number | null;
  used_at?: number | null;
  used_by_device?: string | null;
  is_active?: boolean;
  usage_count?: number;
  max_usage?: number;
}

// ============= 会话表 (sessions) =============

/**
 * 会话状态枚举
 */
export type SessionStatus = 'active' | 'inactive' | 'expired' | 'connected' | 'pending';

/**
 * 会话表记录
 */
export interface SessionRow {
  /** 会话唯一标识符 */
  id: string;
  /** 关联的设备 ID */
  device_id: string;
  /** Durable Object 实例 ID */
  durable_object_id: string;
  /** 会话状态 (active/inactive/expired) */
  status: SessionStatus;
  /** 会话创建时间 */
  created_at: number;
  /** 会话过期时间 */
  expires_at: number;
  /** 最后活动时间 */
  last_activity: number | null;
}

/**
 * 创建会话所需的参数
 */
export interface SessionInsert {
  id: string;
  device_id: string;
  durable_object_id: string;
  status?: SessionStatus;
  created_at: number;
  expires_at: number;
  last_activity?: number | null;
}

/**
 * 更新会话的可选参数
 */
export interface SessionUpdate {
  status?: SessionStatus;
  expires_at?: number;
  last_activity?: number | null;
}

// ============= 审计日志表 (audit_logs) =============

/**
 * 审计操作类型枚举
 */
export type AuditActionType = 
  | 'register'
  | 'heartbeat'
  | 'command'
  | 'file_op'
  | 'session'
  | 'device_enrollment'
  | 'device_heartbeat'
  | 'command_execution'
  | 'file_operation'
  | 'session_created'
  | 'session_closed'
  | 'security_event';

/**
 * 审计结果枚举
 */
export type AuditResult = 'success' | 'error' | 'timeout' | 'failed';

/**
 * 审计日志表记录
 */
export interface AuditLogRow {
  /** 自增主键 */
  id: number;
  /** 操作相关的设备 ID */
  device_id: string;
  /** 操作相关的会话 ID（可选） */
  session_id: string | null;
  /** 操作类型 */
  action_type: AuditActionType;
  /** 操作详细数据 (JSON 格式) */
  action_data: string | null;
  /** 操作结果 */
  result: AuditResult | null;
  /** 错误信息（如果有） */
  error_message: string | null;
  /** 操作时间戳 */
  timestamp: number;
  /** 客户端 IP 地址 */
  ip_address: string | null;
  /** 客户端 User-Agent */
  user_agent: string | null;
}

/**
 * 创建审计日志所需的参数
 */
export interface AuditLogInsert {
  device_id: string;
  session_id?: string | null;
  action_type: AuditActionType;
  action_data?: string | null;
  result?: AuditResult | null;
  error_message?: string | null;
  timestamp: number;
  ip_address?: string | null;
  user_agent?: string | null;
}

// ============= 文件操作记录表 (file_operations) =============

/**
 * 文件操作类型枚举
 */
export type FileOperationType = 'list' | 'get' | 'put' | 'delete';

/**
 * 文件操作状态枚举
 */
export type FileOperationStatus = 'success' | 'error' | 'pending';

/**
 * 文件操作记录表
 */
export interface FileOperationRow {
  /** 自增主键 */
  id: number;
  /** 操作的设备 ID */
  device_id: string;
  /** 操作的会话 ID */
  session_id: string | null;
  /** 操作类型 (list/get/put/delete) */
  operation_type: FileOperationType;
  /** 文件路径 */
  file_path: string;
  /** 文件大小（字节） */
  file_size: number | null;
  /** 文件校验和 (SHA-256) */
  checksum: string | null;
  /** 操作状态 */
  status: FileOperationStatus;
  /** 错误信息（如果有） */
  error_message: string | null;
  /** 操作时间戳 */
  timestamp: number;
  /** 操作耗时（毫秒） */
  duration_ms: number | null;
}

/**
 * 创建文件操作记录所需的参数
 */
export interface FileOperationInsert {
  device_id: string;
  session_id?: string | null;
  operation_type: FileOperationType;
  file_path: string;
  file_size?: number | null;
  checksum?: string | null;
  status: FileOperationStatus;
  error_message?: string | null;
  timestamp: number;
  duration_ms?: number | null;
}

// ============= 查询辅助类型 =============

/**
 * 分页参数
 */
export interface PaginationParams {
  limit?: number;
  offset?: number;
}

/**
 * 排序参数
 */
export interface SortParams<T extends string = string> {
  sortBy?: T;
  sortOrder?: 'asc' | 'desc';
}

/**
 * 设备查询过滤器
 */
export interface DeviceQueryFilter extends PaginationParams, SortParams<'created_at' | 'last_seen' | 'status'> {
  status?: DeviceStatus;
  platform?: DevicePlatform;
  search?: string;
}

/**
 * 会话查询过滤器
 */
export interface SessionQueryFilter extends PaginationParams, SortParams<'created_at' | 'expires_at' | 'last_activity'> {
  device_id?: string;
  status?: SessionStatus;
}

/**
 * 审计日志查询过滤器
 */
export interface AuditLogQueryFilter extends PaginationParams, SortParams<'timestamp'> {
  device_id?: string;
  session_id?: string;
  action_type?: AuditActionType;
  result?: AuditResult;
  start_time?: number;
  end_time?: number;
  search?: string;
}

/**
 * 注册令牌查询过滤器
 */
export interface EnrollmentTokenQueryFilter extends PaginationParams, SortParams<'created_at' | 'expires_at'> {
  is_active?: boolean;
  search?: string;
  status?: 'active' | 'expired' | 'used' | 'all';
}

// ============= 数据库操作接口 =============

/**
 * 查询结果包装器
 */
export interface QueryResult<T> {
  results: T[];
  success: boolean;
  meta?: {
    duration: number;
    changes: number;
    last_row_id: number;
  };
}

/**
 * 分页查询结果
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// ============= 类型转换辅助 =============

/**
 * 将数据库行转换为 API 响应格式 (snake_case -> camelCase)
 */
export type RowToApi<T> = {
  [K in keyof T as K extends string 
    ? K extends `${infer A}_${infer B}` 
      ? `${A}${Capitalize<B>}` 
      : K 
    : K
  ]: T[K];
};

/**
 * Device 行转 API 格式
 */
export type DeviceApi = RowToApi<DeviceRow>;

/**
 * Session 行转 API 格式
 */
export type SessionApi = RowToApi<SessionRow>;

/**
 * AuditLog 行转 API 格式
 */
export type AuditLogApi = RowToApi<AuditLogRow>;
