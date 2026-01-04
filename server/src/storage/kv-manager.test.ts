/**
 * KV 存储管理器测试
 * 验证 KV 存储结构定义和基本操作
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  KVKeyGenerator,
  TTLCalculator,
  NonceRecord,
  RateLimitRecord,
  SessionCache,
  EnrollmentTokenRecord,
  DeviceCache,
} from '../types/kv-storage';

// Mock KV Namespace for testing
class MockKVNamespace {
  private storage = new Map<string, { value: string; expiration?: number }>();

  async get(key: string, options?: any): Promise<any> {
    const item = this.storage.get(key);
    if (!item) return null;
    
    if (item.expiration && Date.now() > item.expiration) {
      this.storage.delete(key);
      return null;
    }
    
    const type = typeof options === 'string' ? options : options?.type || 'text';
    
    switch (type) {
      case 'json':
        return JSON.parse(item.value);
      case 'arrayBuffer':
        return new TextEncoder().encode(item.value).buffer;
      case 'stream':
        return new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(item.value));
            controller.close();
          }
        });
      default:
        return item.value;
    }
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    const expiration = options?.expirationTtl ? Date.now() + (options.expirationTtl * 1000) : undefined;
    this.storage.set(key, { value, expiration });
  }

  async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }

  async list(): Promise<any> {
    return { keys: [] };
  }

  clear(): void {
    this.storage.clear();
  }

  size(): number {
    return this.storage.size;
  }
}

describe('KV Storage Structure Tests', () => {
  let mockKV: MockKVNamespace;

  beforeEach(() => {
    mockKV = new MockKVNamespace();
  });

  describe('KVKeyGenerator', () => {
    it('should generate correct nonce keys', () => {
      const key = KVKeyGenerator.nonce('device123', 'nonce456');
      expect(key).toBe('nonce:device123:nonce456');
    });

    it('should generate correct rate limit keys', () => {
      const key = KVKeyGenerator.rateLimit('device123', '/api/heartbeat');
      expect(key).toBe('rate:device123:/api/heartbeat');
    });

    it('should generate correct session cache keys', () => {
      const key = KVKeyGenerator.sessionCache('session123');
      expect(key).toBe('session:session123');
    });

    it('should generate correct enrollment token keys', () => {
      const key = KVKeyGenerator.enrollmentToken('token123');
      expect(key).toBe('enroll:token123');
    });

    it('should generate correct device cache keys', () => {
      const key = KVKeyGenerator.deviceCache('device123');
      expect(key).toBe('device:device123');
    });
  });

  describe('TTLCalculator', () => {
    it('should return correct TTL values', () => {
      expect(TTLCalculator.getNonceTTL()).toBe(300);
      expect(TTLCalculator.getRateLimitTTL()).toBe(3600);
      expect(TTLCalculator.getSessionCacheTTL()).toBe(1800);
      expect(TTLCalculator.getEnrollmentTokenTTL()).toBe(3600);
      expect(TTLCalculator.getDeviceCacheTTL()).toBe(300);
    });

    it('should calculate expiration timestamps correctly', () => {
      const ttl = 300;
      const expiration = TTLCalculator.getExpirationTimestamp(ttl);
      const expected = Date.now() + (ttl * 1000);
      
      // Allow for small timing differences
      expect(Math.abs(expiration - expected)).toBeLessThan(100);
    });

    it('should correctly identify expired timestamps', () => {
      const pastTimestamp = Date.now() - 1000;
      const futureTimestamp = Date.now() + 1000;
      
      expect(TTLCalculator.isExpired(pastTimestamp)).toBe(true);
      expect(TTLCalculator.isExpired(futureTimestamp)).toBe(false);
    });
  });

  describe('Data Structure Validation', () => {
    it('should validate NonceRecord structure', async () => {
      const record: NonceRecord = {
        device_id: 'device123',
        timestamp: Date.now(),
        used: false,
        request_hash: 'hash123',
      };

      const key = KVKeyGenerator.nonce(record.device_id, 'nonce123');
      await mockKV.put(key, JSON.stringify(record), { expirationTtl: 300 });

      const retrieved = await mockKV.get(key);
      expect(retrieved).not.toBeNull();
      
      const parsed: NonceRecord = JSON.parse(retrieved!);
      expect(parsed.device_id).toBe(record.device_id);
      expect(parsed.used).toBe(false);
      expect(parsed.request_hash).toBe(record.request_hash);
    });

    it('should validate RateLimitRecord structure', async () => {
      const record: RateLimitRecord = {
        count: 5,
        window_start: Date.now(),
        device_id: 'device123',
        endpoint: '/api/heartbeat',
        last_request: Date.now(),
      };

      const key = KVKeyGenerator.rateLimit(record.device_id, record.endpoint!);
      await mockKV.put(key, JSON.stringify(record), { expirationTtl: 3600 });

      const retrieved = await mockKV.get(key);
      expect(retrieved).not.toBeNull();
      
      const parsed: RateLimitRecord = JSON.parse(retrieved!);
      expect(parsed.count).toBe(5);
      expect(parsed.device_id).toBe(record.device_id);
      expect(parsed.endpoint).toBe(record.endpoint);
    });

    it('should validate SessionCache structure', async () => {
      const record: SessionCache = {
        device_id: 'device123',
        durable_object_id: 'do123',
        last_activity: Date.now(),
        status: 'active',
        websocket_connected: true,
        created_at: Date.now(),
      };

      const key = KVKeyGenerator.sessionCache('session123');
      await mockKV.put(key, JSON.stringify(record), { expirationTtl: 1800 });

      const retrieved = await mockKV.get(key);
      expect(retrieved).not.toBeNull();
      
      const parsed: SessionCache = JSON.parse(retrieved!);
      expect(parsed.device_id).toBe(record.device_id);
      expect(parsed.status).toBe('active');
      expect(parsed.websocket_connected).toBe(true);
    });

    it('should validate EnrollmentTokenRecord structure', async () => {
      const record: EnrollmentTokenRecord = {
        token: 'token123',
        created_at: Date.now(),
        expires_at: Date.now() + 3600000,
        used: false,
        created_by: 'admin',
      };

      const key = KVKeyGenerator.enrollmentToken(record.token);
      await mockKV.put(key, JSON.stringify(record), { expirationTtl: 3600 });

      const retrieved = await mockKV.get(key);
      expect(retrieved).not.toBeNull();
      
      const parsed: EnrollmentTokenRecord = JSON.parse(retrieved!);
      expect(parsed.token).toBe(record.token);
      expect(parsed.used).toBe(false);
      expect(parsed.created_by).toBe('admin');
    });

    it('should validate DeviceCache structure', async () => {
      const record: DeviceCache = {
        id: 'device123',
        status: 'online',
        last_seen: Date.now(),
        platform: 'linux',
        version: '1.0.0',
        public_key: 'pubkey123',
        cached_at: Date.now(),
      };

      const key = KVKeyGenerator.deviceCache(record.id);
      await mockKV.put(key, JSON.stringify(record), { expirationTtl: 300 });

      const retrieved = await mockKV.get(key);
      expect(retrieved).not.toBeNull();
      
      const parsed: DeviceCache = JSON.parse(retrieved!);
      expect(parsed.id).toBe(record.id);
      expect(parsed.status).toBe('online');
      expect(parsed.platform).toBe('linux');
    });
  });

  describe('TTL and Expiration', () => {
    it('should handle TTL expiration correctly', async () => {
      const record: NonceRecord = {
        device_id: 'device123',
        timestamp: Date.now(),
        used: false,
      };

      const key = KVKeyGenerator.nonce(record.device_id, 'nonce123');
      
      // Set with very short TTL (simulate expiration by manipulating time)
      await mockKV.put(key, JSON.stringify(record), { expirationTtl: 1 });
      
      // Immediately check - should exist
      let retrieved = await mockKV.get(key);
      expect(retrieved).not.toBeNull();
      
      // Wait for expiration (simulate by advancing time)
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Should be expired now
      retrieved = await mockKV.get(key);
      expect(retrieved).toBeNull();
    });

    it('should handle different TTL values for different record types', async () => {
      const nonceKey = KVKeyGenerator.nonce('device123', 'nonce123');
      const sessionKey = KVKeyGenerator.sessionCache('session123');
      
      await mockKV.put(nonceKey, JSON.stringify({ test: 'nonce' }), { 
        expirationTtl: TTLCalculator.getNonceTTL() 
      });
      
      await mockKV.put(sessionKey, JSON.stringify({ test: 'session' }), { 
        expirationTtl: TTLCalculator.getSessionCacheTTL() 
      });
      
      // Both should exist initially
      expect(await mockKV.get(nonceKey)).not.toBeNull();
      expect(await mockKV.get(sessionKey)).not.toBeNull();
      
      // Verify they have different TTL values
      expect(TTLCalculator.getNonceTTL()).toBe(300);
      expect(TTLCalculator.getSessionCacheTTL()).toBe(1800);
    });
  });
});