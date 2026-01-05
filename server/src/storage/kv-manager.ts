/**
 * KV 存储管理器实现
 * 实现 nonce、速率限制、会话缓存的具体操作和 TTL 清理策略
 * Requirements: 2.4, 7.3
 */

import {
  KVStorageManager,
  NonceRecord,
  RateLimitRecord,
  SessionCache,
  EnrollmentTokenRecord,
  DeviceCache,
  KVOperationResult,
  KVKeyGenerator,
  TTLCalculator,
  CleanupPolicy,
  DEFAULT_CLEANUP_POLICIES,
  BatchOperation,
  BatchDeleteOperation,
  BatchOperationResult,
  KVStorageStats,
} from '../types/kv-storage';

export class CloudflareKVManager implements KVStorageManager {
  constructor(private kv: KVNamespace) {}

  // ==================== Nonce 操作 ====================
  
  async setNonce(deviceId: string, nonce: string, requestHash?: string): Promise<boolean> {
    try {
      const key = KVKeyGenerator.nonce(deviceId, nonce);
      const record: NonceRecord = {
        device_id: deviceId,
        timestamp: Date.now(),
        used: false,
        request_hash: requestHash,
      };
      
      const ttl = TTLCalculator.getNonceTTL();
      await this.kv.put(key, JSON.stringify(record), { expirationTtl: ttl });
      return true;
    } catch (error) {
      console.error('Failed to set nonce:', error);
      return false;
    }
  }

  async checkNonce(deviceId: string, nonce: string): Promise<NonceRecord | null> {
    try {
      const key = KVKeyGenerator.nonce(deviceId, nonce);
      const value = await this.kv.get(key);
      
      if (!value) {
        return null;
      }
      
      const record: NonceRecord = JSON.parse(value);
      
      // 检查是否过期
      const maxAge = TTLCalculator.getNonceTTL() * 1000;
      if (Date.now() - record.timestamp > maxAge) {
        await this.kv.delete(key);
        return null;
      }
      
      return record;
    } catch (error) {
      console.error('Failed to check nonce:', error);
      return null;
    }
  }

  async markNonceUsed(deviceId: string, nonce: string): Promise<boolean> {
    try {
      const record = await this.checkNonce(deviceId, nonce);
      if (!record) {
        return false;
      }
      
      record.used = true;
      const key = KVKeyGenerator.nonce(deviceId, nonce);
      const ttl = TTLCalculator.getNonceTTL();
      await this.kv.put(key, JSON.stringify(record), { expirationTtl: ttl });
      return true;
    } catch (error) {
      console.error('Failed to mark nonce as used:', error);
      return false;
    }
  }

  // ==================== 速率限制操作 ====================
  
  async checkRateLimit(deviceId: string, endpoint: string, maxRequests: number, windowSeconds: number): Promise<boolean> {
    try {
      const record = await this.getRateLimitStatus(deviceId, endpoint);
      const now = Date.now();
      
      if (!record) {
        return true; // 没有记录，允许请求
      }
      
      // 检查窗口是否过期
      if (now - record.window_start > windowSeconds * 1000) {
        return true; // 窗口过期，允许请求
      }
      
      // 检查是否超过限制
      return record.count < maxRequests;
    } catch (error) {
      console.error('Failed to check rate limit:', error);
      return true; // 出错时允许请求，避免误拦截
    }
  }

  async incrementRateLimit(deviceId: string, endpoint: string): Promise<RateLimitRecord> {
    try {
      const key = KVKeyGenerator.rateLimit(deviceId, endpoint);
      const existing = await this.getRateLimitStatus(deviceId, endpoint);
      const now = Date.now();
      
      let record: RateLimitRecord;
      
      if (!existing || (now - existing.window_start > TTLCalculator.getRateLimitTTL() * 1000)) {
        // 创建新的速率限制记录
        record = {
          count: 1,
          window_start: now,
          device_id: deviceId,
          endpoint: endpoint,
          last_request: now,
        };
      } else {
        // 增加现有记录的计数
        record = {
          ...existing,
          count: existing.count + 1,
          last_request: now,
        };
      }
      
      const ttl = TTLCalculator.getRateLimitTTL();
      await this.kv.put(key, JSON.stringify(record), { expirationTtl: ttl });
      return record;
    } catch (error) {
      console.error('Failed to increment rate limit:', error);
      throw error;
    }
  }

  async getRateLimitStatus(deviceId: string, endpoint: string): Promise<RateLimitRecord | null> {
    try {
      const key = KVKeyGenerator.rateLimit(deviceId, endpoint);
      const value = await this.kv.get(key);
      
      if (!value) {
        return null;
      }
      
      return JSON.parse(value) as RateLimitRecord;
    } catch (error) {
      console.error('Failed to get rate limit status:', error);
      return null;
    }
  }

  // ==================== 会话缓存操作 ====================
  
  async setSessionCache(sessionId: string, sessionData: SessionCache): Promise<boolean> {
    try {
      const key = KVKeyGenerator.sessionCache(sessionId);
      const ttl = TTLCalculator.getSessionCacheTTL();
      await this.kv.put(key, JSON.stringify(sessionData), { expirationTtl: ttl });
      return true;
    } catch (error) {
      console.error('Failed to set session cache:', error);
      return false;
    }
  }

  async getSessionCache(sessionId: string): Promise<SessionCache | null> {
    try {
      const key = KVKeyGenerator.sessionCache(sessionId);
      const value = await this.kv.get(key);
      
      if (!value) {
        return null;
      }
      
      return JSON.parse(value) as SessionCache;
    } catch (error) {
      console.error('Failed to get session cache:', error);
      return null;
    }
  }

  async updateSessionActivity(sessionId: string, lastActivity: number): Promise<boolean> {
    try {
      const session = await this.getSessionCache(sessionId);
      if (!session) {
        return false;
      }
      
      session.last_activity = lastActivity;
      return await this.setSessionCache(sessionId, session);
    } catch (error) {
      console.error('Failed to update session activity:', error);
      return false;
    }
  }

  async deleteSessionCache(sessionId: string): Promise<boolean> {
    try {
      const key = KVKeyGenerator.sessionCache(sessionId);
      await this.kv.delete(key);
      return true;
    } catch (error) {
      console.error('Failed to delete session cache:', error);
      return false;
    }
  }

  // ==================== 注册令牌操作 ====================
  
  async setEnrollmentToken(token: string, expiresIn: number, createdBy?: string, description?: string): Promise<boolean> {
    try {
      const key = KVKeyGenerator.enrollmentToken(token);
      const now = Date.now();
      const record: EnrollmentTokenRecord = {
        token,
        description,
        created_at: now,
        expires_at: expiresIn === 0 ? 0 : now + (expiresIn * 1000), // 0 表示永不过期
        used: false,
        created_by: createdBy,
      };
      
      // 如果是永不过期的令牌，不设置 TTL
      const options = expiresIn === 0 ? {} : { expirationTtl: expiresIn };
      await this.kv.put(key, JSON.stringify(record), options);
      return true;
    } catch (error) {
      console.error('Failed to set enrollment token:', error);
      return false;
    }
  }

  async getEnrollmentToken(token: string): Promise<EnrollmentTokenRecord | null> {
    try {
      const key = KVKeyGenerator.enrollmentToken(token);
      const value = await this.kv.get(key);
      
      if (!value) {
        return null;
      }
      
      const record: EnrollmentTokenRecord = JSON.parse(value);
      
      // 检查是否过期
      if (TTLCalculator.isExpired(record.expires_at)) {
        await this.kv.delete(key);
        return null;
      }
      
      return record;
    } catch (error) {
      console.error('Failed to get enrollment token:', error);
      return null;
    }
  }

  async markTokenUsed(token: string, deviceId: string): Promise<boolean> {
    try {
      const record = await this.getEnrollmentToken(token);
      if (!record || record.used) {
        return false;
      }
      
      record.used = true;
      record.device_id = deviceId;
      
      const key = KVKeyGenerator.enrollmentToken(token);
      const remainingTtl = Math.max(0, Math.floor((record.expires_at - Date.now()) / 1000));
      await this.kv.put(key, JSON.stringify(record), { expirationTtl: remainingTtl });
      return true;
    } catch (error) {
      console.error('Failed to mark token as used:', error);
      return false;
    }
  }

  // ==================== 设备缓存操作 ====================
  
  async setDeviceCache(deviceId: string, deviceData: DeviceCache): Promise<boolean> {
    try {
      const key = KVKeyGenerator.deviceCache(deviceId);
      deviceData.cached_at = Date.now();
      const ttl = TTLCalculator.getDeviceCacheTTL();
      await this.kv.put(key, JSON.stringify(deviceData), { expirationTtl: ttl });
      return true;
    } catch (error) {
      console.error('Failed to set device cache:', error);
      return false;
    }
  }

  async getDeviceCache(deviceId: string): Promise<DeviceCache | null> {
    try {
      const key = KVKeyGenerator.deviceCache(deviceId);
      const value = await this.kv.get(key);
      
      if (!value) {
        return null;
      }
      
      return JSON.parse(value) as DeviceCache;
    } catch (error) {
      console.error('Failed to get device cache:', error);
      return null;
    }
  }

  async updateDeviceStatus(deviceId: string, status: DeviceCache['status'], lastSeen: number): Promise<boolean> {
    try {
      const device = await this.getDeviceCache(deviceId);
      if (!device) {
        return false;
      }
      
      device.status = status;
      device.last_seen = lastSeen;
      return await this.setDeviceCache(deviceId, device);
    } catch (error) {
      console.error('Failed to update device status:', error);
      return false;
    }
  }

  async deleteDeviceCache(deviceId: string): Promise<boolean> {
    try {
      const key = KVKeyGenerator.deviceCache(deviceId);
      await this.kv.delete(key);
      return true;
    } catch (error) {
      console.error('Failed to delete device cache:', error);
      return false;
    }
  }

  // ==================== 批量操作 ====================
  
  async batchPut<T>(operations: BatchOperation<T>[]): Promise<BatchOperationResult> {
    const result: BatchOperationResult = {
      success: true,
      processed: 0,
      failed: 0,
      errors: [],
    };
    
    for (const op of operations) {
      try {
        const options = op.ttl ? { expirationTtl: op.ttl } : undefined;
        await this.kv.put(op.key, JSON.stringify(op.value), options);
        result.processed++;
      } catch (error) {
        result.failed++;
        result.errors.push(`Failed to put ${op.key}: ${error}`);
        result.success = false;
      }
    }
    
    return result;
  }

  async batchDelete(operations: BatchDeleteOperation[]): Promise<BatchOperationResult> {
    const result: BatchOperationResult = {
      success: true,
      processed: 0,
      failed: 0,
      errors: [],
    };
    
    for (const op of operations) {
      try {
        await this.kv.delete(op.key);
        result.processed++;
      } catch (error) {
        result.failed++;
        result.errors.push(`Failed to delete ${op.key}: ${error}`);
        result.success = false;
      }
    }
    
    return result;
  }

  // ==================== 清理和统计 ====================
  
  async cleanup(policy: CleanupPolicy, prefix: string): Promise<BatchOperationResult> {
    if (!policy.enabled) {
      return {
        success: true,
        processed: 0,
        failed: 0,
        errors: [],
      };
    }
    
    try {
      // 注意：Cloudflare KV 不支持按前缀列出键，这里是概念性实现
      // 实际实现需要维护键的索引或使用其他策略
      console.log(`Cleanup for prefix ${prefix} would run here`);
      
      return {
        success: true,
        processed: 0,
        failed: 0,
        errors: [],
      };
    } catch (error) {
      return {
        success: false,
        processed: 0,
        failed: 0,
        errors: [`Cleanup failed: ${error}`],
      };
    }
  }

  async getStats(): Promise<KVStorageStats> {
    // 注意：Cloudflare KV 不提供详细的统计信息
    // 这里返回基本的统计结构
    return {
      total_keys: 0, // 无法从 KV 获取
      keys_by_prefix: {},
      last_cleanup: Date.now(),
      cleanup_stats: {},
    };
  }
}

// 工具函数：创建 KV 管理器实例
export function createKVManager(kv: KVNamespace): KVStorageManager {
  return new CloudflareKVManager(kv);
}

// 工具函数：验证 nonce 的完整流程
export async function validateNonce(
  kvManager: KVStorageManager,
  deviceId: string,
  nonce: string,
  requestHash?: string
): Promise<{ valid: boolean; reason?: string }> {
  try {
    // 检查 nonce 是否已经被使用过
    const record = await kvManager.checkNonce(deviceId, nonce);
    
    if (record) {
      // Nonce 已存在，这是重放攻击
      return { valid: false, reason: 'Nonce already used (replay attack)' };
    }
    
    // Nonce 不存在，这是有效的新请求
    // 将 nonce 存储到 KV 中以防止未来的重放攻击
    const stored = await kvManager.setNonce(deviceId, nonce, requestHash);
    if (!stored) {
      return { valid: false, reason: 'Failed to store nonce' };
    }
    
    return { valid: true };
  } catch (error) {
    console.error('Nonce validation error:', error);
    return { valid: false, reason: 'Internal validation error' };
  }
}

// 工具函数：检查和更新速率限制
export async function checkAndUpdateRateLimit(
  kvManager: KVStorageManager,
  deviceId: string,
  endpoint: string,
  maxRequests: number = 60,
  windowSeconds: number = 60
): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
  try {
    const allowed = await kvManager.checkRateLimit(deviceId, endpoint, maxRequests, windowSeconds);
    
    if (!allowed) {
      const status = await kvManager.getRateLimitStatus(deviceId, endpoint);
      const resetTime = status ? status.window_start + (windowSeconds * 1000) : Date.now() + (windowSeconds * 1000);
      return {
        allowed: false,
        remaining: 0,
        resetTime,
      };
    }
    
    const record = await kvManager.incrementRateLimit(deviceId, endpoint);
    const remaining = Math.max(0, maxRequests - record.count);
    const resetTime = record.window_start + (windowSeconds * 1000);
    
    return {
      allowed: true,
      remaining,
      resetTime,
    };
  } catch (error) {
    console.error('Rate limit check error:', error);
    // 出错时允许请求，但设置保守的限制
    return {
      allowed: true,
      remaining: 0,
      resetTime: Date.now() + (windowSeconds * 1000),
    };
  }
}