/**
 * 数据库 Schema 类型定义
 * 对应 D1 数据库中的表结构
 */

// 设备表类型
export interface Device {
  id: string;
  enrollment_token?: string;
  public_key: string;
  platform: 'windows' | 'linux' | 'macos';
  version: string;
  last_seen: number;
  status: 'online' | 'offline' | 'error';
  created_at: number;
  updated_at: number;
}

// 设备创建输入类型
export interface CreateDeviceInput {
  id: string;
  enrollment_token?: string;
  public_key: string;
  platform: Device['platform'];
  version: string;
}

// 设备更新输入类型
export interface UpdateDeviceInput {
  last_seen?: number;
  status?: Device['status'];
  version?: string;
}

// 会话表类型
export interface Session {
  id: string;
  device_id: string;
  durable_object_id: string;
  status: 'active' | 'inactive' | 'expired';
  created_at: number;
  expires_at: number;
  last_activity?: number;
}

// 会话创建输入类型
export interface CreateSessionInput {
  id: string;
  device_id: string;
  durable_object_id: string;
  expires_at: number;
}

// 会话更新输入类型
export interface UpdateSessionInput {
  status?: Session['status'];
  last_activity?: number;
  expires_at?: number;
}

// 审计日志表类型
export interface AuditLog {
  id: number;
  device_id: string;
  session_id?: string;
  action_type: 'register' | 'heartbeat' | 'command' | 'file_op' | 'session';
  action_data?: string; // JSON 字符串
  result: 'success' | 'error' | 'timeout';
  error_message?: string;
  timestamp: number;
  ip_address?: string;
  user_agent?: string;
}

// 审计日志创建输入类型
export interface CreateAuditLogInput {
  device_id: string;
  session_id?: string;
  action_type: AuditLog['action_type'];
  action_data?: Record<string, any>; // 将被序列化为 JSON
  result: AuditLog['result'];
  error_message?: string;
  ip_address?: string;
  user_agent?: string;
}

// 审计日志查询过滤器
export interface AuditLogFilters {
  device_id?: string;
  session_id?: string;
  action_type?: AuditLog['action_type'];
  result?: AuditLog['result'];
  start_time?: number;
  end_time?: number;
  limit?: number;
  offset?: number;
}

// 文件操作记录表类型
export interface FileOperation {
  id: number;
  device_id: string;
  session_id?: string;
  operation_type: 'list' | 'get' | 'put' | 'delete';
  file_path: string;
  file_size?: number;
  checksum?: string;
  status: 'success' | 'error' | 'pending';
  error_message?: string;
  timestamp: number;
  duration_ms?: number;
}

// 文件操作创建输入类型
export interface CreateFileOperationInput {
  device_id: string;
  session_id?: string;
  operation_type: FileOperation['operation_type'];
  file_path: string;
  file_size?: number;
  checksum?: string;
  status: FileOperation['status'];
  error_message?: string;
  duration_ms?: number;
}

// 文件操作查询过滤器
export interface FileOperationFilters {
  device_id?: string;
  session_id?: string;
  operation_type?: FileOperation['operation_type'];
  status?: FileOperation['status'];
  start_time?: number;
  end_time?: number;
  limit?: number;
  offset?: number;
}

// 数据库查询结果类型
export interface QueryResult<T> {
  results: T[];
  success: boolean;
  meta: {
    duration: number;
    rows_read: number;
    rows_written: number;
  };
}

// 分页查询结果类型
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}