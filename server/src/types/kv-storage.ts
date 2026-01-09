/**
 * KV 存储结构定义
 * 定义 nonce、速率限制、会话缓存的数据结构和 TTL 策略
 * Requirements: 2.4, 7.3
 */

// KV 存储键前缀常量
export const KV_PREFIXES = {
  NONCE: 'nonce:',
  RATE_LIMIT: 'rate:',
  SESSION_CACHE: 'session:',
  ENROLLMENT_TOKEN: 'enroll:',
  DEVICE_CACHE: 'device:',
  COMMAND_QUEUE: 'cmd:',
} as const;

// TTL 常量 (秒)
export const TTL_SECONDS = {
  NONCE: 300,           // 5 分钟 - nonce 防重放窗口
  RATE_LIMIT: 3600,     // 1 小时 - 速率限制窗口
  SESSION_CACHE: 1800,  // 30 分钟 - 会话缓存
  ENROLLMENT_TOKEN: 3600, // 1 小时 - 注册令牌有效期
  DEVICE_CACHE: 300,    // 5 分钟 - 设备信息缓存
  COMMAND_QUEUE: 86400, // 24 小时 - 命令队列有效期
} as const;

// Nonce 防重放记录
export interface NonceRecord {
  device_id: string;
  timestamp: number;
  used: boolean;
  request_hash?: string; // 请求内容的哈希，用于额外验证
}

// 速率限制记录
export interface RateLimitRecord {
  count: number;
  window_start: number;
  device_id: string;
  endpoint?: string; // 可选：区分不同端点的速率限制
  last_request: number;
}

// 会话缓存记录
export interface SessionCache {
  device_id: string;
  durable_object_id: string;
  last_activity: number;
  status: 'active' | 'inactive' | 'expired';
  websocket_connected: boolean;
  created_at: number;
}

// 注册令牌记录
export interface EnrollmentTokenRecord {
  token: string;
  description?: string;
  created_at: number;
  expires_at: number;
  used: boolean;
  used_at?: number;
  device_id?: string; // 使用后记录关联的设备 ID
  created_by?: string; // 创建者标识
}

// 设备缓存记录 (用于快速查询设备状态)
export interface DeviceCache {
  id: string;
  status: 'online' | 'offline' | 'error';
  last_seen: number;
  platform: string;
  version: string;
  public_key: string;
  cached_at: number;
}

// 命令类型定义
export type CommandType = 'execute' | 'file_op' | 'config_update' | 'upgrade' | 'script';

// 命令状态
export type CommandStatus = 'pending' | 'delivered' | 'executing' | 'completed' | 'failed' | 'expired';

// 命令优先级
export type CommandPriority = 'low' | 'normal' | 'high' | 'urgent';

// 命令记录
export interface CommandRecord {
  id: string;
  device_id: string;
  type: CommandType;
  priority: CommandPriority;
  payload: Record<string, any>;
  status: CommandStatus;
  created_at: number;
  expires_at: number;
  delivered_at?: number;
  completed_at?: number;
  result?: any;
  error?: string;
  created_by?: string;
  retry_count: number;
  max_retries: number;
}

// 设备命令队列索引
export interface CommandQueueIndex {
  device_id: string;
  command_ids: string[];
  updated_at: number;
}

// KV 操作结果类型
export interface KVOperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  cached_at?: number;
}

// KV 存储管理器接口
export interface KVStorageManager {
  // Nonce 操作
  setNonce(deviceId: string, nonce: string, requestHash?: string): Promise<boolean>;
  checkNonce(deviceId: string, nonce: string): Promise<NonceRecord | null>;
  markNonceUsed(deviceId: string, nonce: string): Promise<boolean>;
  
  // 速率限制操作
  checkRateLimit(deviceId: string, endpoint: string, maxRequests: number, windowSeconds: number): Promise<boolean>;
  incrementRateLimit(deviceId: string, endpoint: string): Promise<RateLimitRecord>;
  getRateLimitStatus(deviceId: string, endpoint: string): Promise<RateLimitRecord | null>;
  // 优化：合并检查和更新操作
  checkAndIncrementRateLimit(deviceId: string, endpoint: string, maxRequests: number, windowSeconds: number): Promise<{ allowed: boolean; record: RateLimitRecord; remaining: number }>;
  
  // 会话缓存操作
  setSessionCache(sessionId: string, sessionData: SessionCache): Promise<boolean>;
  getSessionCache(sessionId: string): Promise<SessionCache | null>;
  updateSessionActivity(sessionId: string, lastActivity: number): Promise<boolean>;
  deleteSessionCache(sessionId: string): Promise<boolean>;
  
  // 注册令牌操作
  setEnrollmentToken(token: string, expiresIn: number, createdBy?: string, description?: string): Promise<boolean>;
  getEnrollmentToken(token: string): Promise<EnrollmentTokenRecord | null>;
  markTokenUsed(token: string, deviceId: string): Promise<boolean>;
  
  // 设备缓存操作
  setDeviceCache(deviceId: string, deviceData: DeviceCache): Promise<boolean>;
  getDeviceCache(deviceId: string): Promise<DeviceCache | null>;
  updateDeviceStatus(deviceId: string, status: DeviceCache['status'], lastSeen: number): Promise<boolean>;
  deleteDeviceCache(deviceId: string): Promise<boolean>;
  
  // 命令队列操作
  enqueueCommand(command: CommandRecord): Promise<boolean>;
  getDeviceCommands(deviceId: string, limit?: number): Promise<CommandRecord[]>;
  getCommand(commandId: string): Promise<CommandRecord | null>;
  updateCommandStatus(commandId: string, status: CommandStatus, result?: any, error?: string): Promise<boolean>;
  deleteCommand(commandId: string): Promise<boolean>;
  cleanExpiredCommands(deviceId: string): Promise<number>;
}

// KV 键生成工具函数
export class KVKeyGenerator {
  static nonce(deviceId: string, nonce: string): string {
    return `${KV_PREFIXES.NONCE}${deviceId}:${nonce}`;
  }
  
  static rateLimit(deviceId: string, endpoint: string): string {
    return `${KV_PREFIXES.RATE_LIMIT}${deviceId}:${endpoint}`;
  }
  
  static sessionCache(sessionId: string): string {
    return `${KV_PREFIXES.SESSION_CACHE}${sessionId}`;
  }
  
  static enrollmentToken(token: string): string {
    return `${KV_PREFIXES.ENROLLMENT_TOKEN}${token}`;
  }
  
  static deviceCache(deviceId: string): string {
    return `${KV_PREFIXES.DEVICE_CACHE}${deviceId}`;
  }
  
  static command(commandId: string): string {
    return `${KV_PREFIXES.COMMAND_QUEUE}${commandId}`;
  }
  
  static commandQueueIndex(deviceId: string): string {
    return `${KV_PREFIXES.COMMAND_QUEUE}index:${deviceId}`;
  }
}

// TTL 计算工具函数
export class TTLCalculator {
  static getNonceTTL(): number {
    return TTL_SECONDS.NONCE;
  }
  
  static getRateLimitTTL(): number {
    return TTL_SECONDS.RATE_LIMIT;
  }
  
  static getSessionCacheTTL(): number {
    return TTL_SECONDS.SESSION_CACHE;
  }
  
  static getEnrollmentTokenTTL(): number {
    return TTL_SECONDS.ENROLLMENT_TOKEN;
  }
  
  static getDeviceCacheTTL(): number {
    return TTL_SECONDS.DEVICE_CACHE;
  }
  
  static getCommandQueueTTL(): number {
    return TTL_SECONDS.COMMAND_QUEUE;
  }
  
  // 计算过期时间戳
  static getExpirationTimestamp(ttlSeconds: number): number {
    return Date.now() + (ttlSeconds * 1000);
  }
  
  // 检查是否过期
  static isExpired(timestamp: number): boolean {
    return Date.now() > timestamp;
  }
}

// 清理策略配置
export interface CleanupPolicy {
  enabled: boolean;
  interval_seconds: number;
  batch_size: number;
  max_age_seconds: number;
}

// 默认清理策略
export const DEFAULT_CLEANUP_POLICIES: Record<string, CleanupPolicy> = {
  nonce: {
    enabled: true,
    interval_seconds: 300,  // 每 5 分钟清理一次
    batch_size: 100,
    max_age_seconds: TTL_SECONDS.NONCE,
  },
  rate_limit: {
    enabled: true,
    interval_seconds: 3600, // 每小时清理一次
    batch_size: 50,
    max_age_seconds: TTL_SECONDS.RATE_LIMIT,
  },
  session_cache: {
    enabled: true,
    interval_seconds: 600,  // 每 10 分钟清理一次
    batch_size: 20,
    max_age_seconds: TTL_SECONDS.SESSION_CACHE,
  },
  enrollment_token: {
    enabled: true,
    interval_seconds: 1800, // 每 30 分钟清理一次
    batch_size: 10,
    max_age_seconds: TTL_SECONDS.ENROLLMENT_TOKEN,
  },
  device_cache: {
    enabled: true,
    interval_seconds: 300,  // 每 5 分钟清理一次
    batch_size: 100,
    max_age_seconds: TTL_SECONDS.DEVICE_CACHE,
  },
};

// 批量操作类型
export interface BatchOperation<T> {
  key: string;
  value: T;
  ttl?: number;
}

export interface BatchDeleteOperation {
  key: string;
}

// 批量操作结果
export interface BatchOperationResult {
  success: boolean;
  processed: number;
  failed: number;
  errors: string[];
}

// KV 存储统计信息
export interface KVStorageStats {
  total_keys: number;
  keys_by_prefix: Record<string, number>;
  memory_usage_bytes?: number;
  last_cleanup: number;
  cleanup_stats: Record<string, {
    last_run: number;
    keys_cleaned: number;
    errors: number;
  }>;
}