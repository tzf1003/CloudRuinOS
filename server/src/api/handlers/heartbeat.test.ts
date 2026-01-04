/**
 * 心跳机制属性测试
 * 验证心跳机制的正确性属性
 * Feature: lightweight-rmm, Property 7: 心跳时间戳更新
 * Feature: lightweight-rmm, Property 8: 签名验证机制
 * Feature: lightweight-rmm, Property 9: 重放攻击防护
 * Validates: Requirements 2.2, 2.3, 2.4
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { heartbeat, HeartbeatRequest, HeartbeatResponse } from './heartbeat';
import { Env } from '../../index';
import { createKVManager } from '../../storage/kv-manager';
import { generateEd25519KeyPair, createEd25519Signature, generateNonce, Ed25519KeyPair } from '../utils/crypto';
import { createDevice } from '../utils/database';
import { CreateDeviceInput } from '../../types/database';

// Mock 环境设置
class MockD1Database {
  private devices = new Map<string, any>();
  private auditLogs: any[] = [];
  
  prepare(query: string) {
    return {
      bind: (...params: any[]) => ({
        run: async () => {
          if (query.includes('INSERT INTO devices')) {
            const [id, enrollment_token, public_key, platform, version, last_seen, status, created_at, updated_at] = params;
            this.devices.set(id, {
              id, enrollment_token, public_key, platform, version, last_seen, status, created_at, updated_at
            });
          } else if (query.includes('UPDATE devices')) {
            // 简化的更新逻辑
            const deviceId = params[params.length - 1];
            const device = this.devices.get(deviceId);
            if (device) {
              if (params.length >= 2) device.last_seen = params[0];
              if (params.length >= 3) device.status = params[1];
              if (params.length >= 4) device.version = params[2];
              device.updated_at = Date.now();
            }
          } else if (query.includes('INSERT INTO audit_logs')) {
            this.auditLogs.push({
              device_id: params[0],
              action_type: params[2],
              result: params[4],
            });
          }
          return { success: true, meta: { changes: 1 } };
        },
        first: async () => {
          if (query.includes('SELECT * FROM devices WHERE id = ?')) {
            return this.devices.get(params[0]) || null;
          }
          return null;
        },
        all: async () => ({ results: [] }),
      }),
    };
  }

  clear(): void {
    this.devices.clear();
    this.auditLogs.length = 0; // Clear array
  }

  getDevice(id: string) {
    return this.devices.get(id);
  }
}

class MockKVNamespace {
  private storage = new Map<string, { value: string; expiration?: number }>();

  async get(key: string): Promise<string | null> {
    const item = this.storage.get(key);
    if (!item) return null;
    
    if (item.expiration && Date.now() > item.expiration) {
      this.storage.delete(key);
      return null;
    }
    
    return item.value;
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    const expiration = options?.expirationTtl ? Date.now() + (options.expirationTtl * 1000) : undefined;
    this.storage.set(key, { value, expiration });
  }

  async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }

  clear(): void {
    this.storage.clear();
  }
}

// 测试环境设置
function createTestEnv(): Env {
  return {
    DB: new MockD1Database() as any,
    KV: new MockKVNamespace() as any,
    R2: {} as any,
    SESSION_DO: {} as any,
    ENVIRONMENT: 'test',
    API_VERSION: 'v1',
    MAX_FILE_SIZE: '10485760',
    SESSION_TIMEOUT: '1800',
    HEARTBEAT_INTERVAL: '60',
    NONCE_WINDOW: '300',
    ENROLLMENT_SECRET: 'test-secret',
    JWT_SECRET: 'test-jwt-secret',
    WEBHOOK_SECRET: 'test-webhook-secret',
    DB_ENCRYPTION_KEY: 'test-db-encryption-key-32-chars-long-12345678',
    ADMIN_API_KEY: 'test-admin-api-key',
  };
}

// 创建测试请求
function createTestRequest(body: HeartbeatRequest): Request {
  return new Request('https://test.example.com/agent/heartbeat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '192.168.1.100',
      'User-Agent': 'RMM-Agent/1.0.0',
    },
    body: JSON.stringify(body),
  });
}

// Fast-check 生成器
const deviceIdArbitrary = fc.constantFrom('test-device-1', 'test-device-2', 'test-device-3'); // 使用预定义的有效设备ID
const timestampArbitrary = fc.integer({ min: Date.now() - 300000, max: Date.now() + 300000 }); // ±5分钟
// 生成简单的字母数字nonce，避免Base64编码问题
const nonceArbitrary = fc.string({ 
  minLength: 16, 
  maxLength: 32,
  unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split(''))
});
const protocolVersionArbitrary = fc.constantFrom('1.0', '1.1', '2.0');
const platformArbitrary = fc.constantFrom('windows', 'linux', 'macos');
const versionArbitrary = fc.oneof(
  fc.constantFrom('1.0.0', '1.1.0', '2.0.0', '1.2.3', '0.1.0'),
  fc.tuple(
    fc.integer({ min: 0, max: 9 }),
    fc.integer({ min: 0, max: 9 }),
    fc.integer({ min: 0, max: 9 })
  ).map(([major, minor, patch]) => `${major}.${minor}.${patch}`)
);

const systemInfoArbitrary = fc.record({
  platform: platformArbitrary,
  version: versionArbitrary,
  uptime: fc.integer({ min: 0, max: 86400000 }), // 最多1天
  cpu_usage: fc.option(fc.float({ min: 0, max: 100 }), { nil: undefined }),
  memory_usage: fc.option(fc.float({ min: 0, max: 100 }), { nil: undefined }),
  disk_usage: fc.option(fc.float({ min: 0, max: 100 }), { nil: undefined }),
});

describe('Heartbeat Mechanism Property Tests', () => {
  let env: Env;
  let mockDb: MockD1Database;
  let mockKv: MockKVNamespace;
  let deviceKeyPairs: Map<string, Ed25519KeyPair>;

  beforeEach(async () => {
    env = createTestEnv();
    mockDb = env.DB as any;
    mockKv = env.KV as any;
    mockDb.clear();
    mockKv.clear();
    
    // 预先创建所有测试设备
    deviceKeyPairs = new Map();
    const testDevices = ['test-device-1', 'test-device-2', 'test-device-3'];
    
    for (const deviceId of testDevices) {
      const keyPair = await generateEd25519KeyPair();
      if (!keyPair) throw new Error('Failed to generate key pair');
      deviceKeyPairs.set(deviceId, keyPair);
      await createTestDevice(deviceId, keyPair.publicKey);
    }
  });

  // 辅助函数：创建测试设备
  async function createTestDevice(deviceId: string, publicKey: string): Promise<void> {
    const deviceInput: CreateDeviceInput = {
      id: deviceId,
      public_key: publicKey,
      platform: 'linux',
      version: '1.0.0',
    };
    
    await createDevice(env.DB, deviceInput);
  }

  // 辅助函数：创建有效的心跳请求
  async function createValidHeartbeatRequest(
    deviceId: string,
    privateKey: string,
    timestamp?: number,
    nonce?: string,
    systemInfo?: any
  ): Promise<HeartbeatRequest> {
    const ts = timestamp || Date.now();
    // 使用简单的字母数字nonce，避免Base64编码问题
    const n = nonce || Math.random().toString(36).substring(2, 18);
    const sysInfo = systemInfo || {
      platform: 'linux',
      version: '1.0.0',
      uptime: 3600000,
    };

    const signatureData = {
      device_id: deviceId,
      timestamp: ts,
      nonce: n,
      protocol_version: '1.0',
      system_info: sysInfo,
    };

    const signature = await createEd25519Signature(privateKey, JSON.stringify(signatureData));

    return {
      device_id: deviceId,
      timestamp: ts,
      nonce: n,
      protocol_version: '1.0',
      signature: signature!,
      system_info: sysInfo,
    };
  }

  describe('Property 7: 心跳时间戳更新', () => {
    it('should update device last_seen timestamp for valid heartbeats', async () => {
      await fc.assert(
        fc.asyncProperty(
          deviceIdArbitrary,
          systemInfoArbitrary,
          async (deviceId, systemInfo) => {
            // 清理KV存储以避免速率限制干扰
            mockKv.clear();
            
            // 获取预创建的密钥对
            const keyPair = deviceKeyPairs.get(deviceId);
            if (!keyPair) throw new Error(`Key pair not found for device ${deviceId}`);

            // 记录初始状态
            const initialDevice = mockDb.getDevice(deviceId);
            const initialLastSeen = initialDevice?.last_seen || 0;

            // 等待一小段时间确保时间戳不同
            await new Promise(resolve => setTimeout(resolve, 10));

            // 创建有效的心跳请求
            const heartbeatRequest = await createValidHeartbeatRequest(
              deviceId,
              keyPair.privateKey,
              Date.now(),
              Math.random().toString(36).substring(2, 18), // 简单的字母数字nonce
              systemInfo
            );

            const request = createTestRequest(heartbeatRequest);
            const response = await heartbeat(request, env, {} as ExecutionContext);

            // 验证响应成功
            expect(response.status).toBe(200);
            const responseData: HeartbeatResponse = await response.json();
            expect(responseData.status).toBe('ok');

            // 验证设备时间戳已更新
            const updatedDevice = mockDb.getDevice(deviceId);
            expect(updatedDevice).toBeTruthy();
            expect(updatedDevice.last_seen).toBeGreaterThan(initialLastSeen);
            expect(updatedDevice.status).toBe('online');
            
            // 验证系统信息已更新
            if (systemInfo.version) {
              expect(updatedDevice.version).toBe(systemInfo.version);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should maintain consistent timestamps across multiple heartbeats', async () => {
      await fc.assert(
        fc.asyncProperty(
          deviceIdArbitrary,
          fc.array(systemInfoArbitrary, { minLength: 2, maxLength: 3 }), // 减少数量避免速率限制
          async (deviceId, systemInfos) => {
            // 清理KV存储以避免速率限制干扰
            mockKv.clear();
            
            // 获取预创建的密钥对
            const keyPair = deviceKeyPairs.get(deviceId);
            if (!keyPair) throw new Error(`Key pair not found for device ${deviceId}`);

            const timestamps: number[] = [];

            // 发送多个心跳
            for (const systemInfo of systemInfos) {
              await new Promise(resolve => setTimeout(resolve, 50)); // 增加延迟避免速率限制

              const heartbeatRequest = await createValidHeartbeatRequest(
                deviceId,
                keyPair.privateKey,
                Date.now(),
                Math.random().toString(36).substring(2, 18), // 简单的字母数字nonce
                systemInfo
              );

              const request = createTestRequest(heartbeatRequest);
              const response = await heartbeat(request, env, {} as ExecutionContext);

              expect(response.status).toBe(200);

              const device = mockDb.getDevice(deviceId);
              timestamps.push(device.last_seen);
            }

            // 验证时间戳是递增的
            for (let i = 1; i < timestamps.length; i++) {
              expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
            }
          }
        ),
        { numRuns: 20 } // 减少运行次数避免速率限制
      );
    });
  });

  describe('Property 8: 签名验证机制', () => {
    it('should accept valid signatures and reject invalid ones', async () => {
      await fc.assert(
        fc.asyncProperty(
          deviceIdArbitrary,
          timestampArbitrary,
          nonceArbitrary,
          systemInfoArbitrary,
          fc.boolean(), // 是否使用有效签名
          async (deviceId, timestamp, nonce, systemInfo, useValidSignature) => {
            // 清理KV存储以避免速率限制和nonce冲突
            mockKv.clear();
            
            // 获取预创建的密钥对
            const keyPair = deviceKeyPairs.get(deviceId);
            if (!keyPair) throw new Error(`Key pair not found for device ${deviceId}`);

            let signature: string;
            if (useValidSignature) {
              // 创建有效签名
              const signatureData = {
                device_id: deviceId,
                timestamp,
                nonce,
                protocol_version: '1.0',
                system_info: systemInfo,
              };
              signature = await createEd25519Signature(keyPair.privateKey, JSON.stringify(signatureData)) || '';
            } else {
              // 创建无效签名
              signature = 'invalid-signature-' + Math.random().toString(36);
            }

            const heartbeatRequest: HeartbeatRequest = {
              device_id: deviceId,
              timestamp,
              nonce,
              protocol_version: '1.0',
              signature,
              system_info: systemInfo,
            };

            const request = createTestRequest(heartbeatRequest);
            const response = await heartbeat(request, env, {} as ExecutionContext);

            if (useValidSignature) {
              // 有效签名应该成功（除非时间戳超出范围）
              const timeDiff = Math.abs(Date.now() - timestamp);
              if (timeDiff <= 5 * 60 * 1000) { // 5分钟窗口
                expect(response.status).toBe(200);
                const responseData: HeartbeatResponse = await response.json();
                expect(responseData.status).toBe('ok');
              } else {
                expect(response.status).toBe(401);
              }
            } else {
              // 无效签名应该被拒绝
              expect(response.status).toBe(401);
              const responseData: HeartbeatResponse = await response.json();
              expect(responseData.status).toBe('error');
              expect(responseData.error_code).toBe('INVALID_SIGNATURE');
            }
          }
        ),
        { numRuns: 30 } // 减少运行次数避免速率限制
      );
    });

    it('should reject requests with tampered data', async () => {
      await fc.assert(
        fc.asyncProperty(
          deviceIdArbitrary,
          systemInfoArbitrary,
          async (deviceId, systemInfo) => {
            // 清理KV存储以避免速率限制和nonce冲突
            mockKv.clear();
            
            // 获取预创建的密钥对
            const keyPair = deviceKeyPairs.get(deviceId);
            if (!keyPair) throw new Error(`Key pair not found for device ${deviceId}`);

            const timestamp = Date.now();
            const nonce = generateNonce();

            // 创建有效签名
            const originalData = {
              device_id: deviceId,
              timestamp,
              nonce,
              protocol_version: '1.0',
              system_info: systemInfo,
            };
            const signature = await createEd25519Signature(keyPair.privateKey, JSON.stringify(originalData));

            // 篡改数据（修改时间戳）
            const tamperedRequest: HeartbeatRequest = {
              device_id: deviceId,
              timestamp: timestamp + 1000, // 篡改时间戳
              nonce,
              protocol_version: '1.0',
              signature: signature!,
              system_info: systemInfo,
            };

            const request = createTestRequest(tamperedRequest);
            const response = await heartbeat(request, env, {} as ExecutionContext);

            // 篡改的请求应该被拒绝
            expect(response.status).toBe(401);
            const responseData: HeartbeatResponse = await response.json();
            expect(responseData.status).toBe('error');
            expect(responseData.error_code).toBe('INVALID_SIGNATURE');
          }
        ),
        { numRuns: 30 } // 减少运行次数避免速率限制
      );
    });
  });

  describe('Property 9: 重放攻击防护', () => {
    it('should reject duplicate nonces from the same device', async () => {
      await fc.assert(
        fc.asyncProperty(
          deviceIdArbitrary,
          nonceArbitrary,
          systemInfoArbitrary,
          async (deviceId, nonce, systemInfo) => {
            // 清理KV存储以避免速率限制干扰
            mockKv.clear();
            
            // 获取预创建的密钥对
            const keyPair = deviceKeyPairs.get(deviceId);
            if (!keyPair) throw new Error(`Key pair not found for device ${deviceId}`);

            // 创建第一个心跳请求
            const heartbeatRequest1 = await createValidHeartbeatRequest(
              deviceId,
              keyPair.privateKey,
              Date.now(),
              nonce,
              systemInfo
            );

            // 发送第一个请求
            const request1 = createTestRequest(heartbeatRequest1);
            const response1 = await heartbeat(request1, env, {} as ExecutionContext);

            // 第一个请求应该成功
            expect(response1.status).toBe(200);

            // 创建第二个心跳请求（使用相同的 nonce）
            const heartbeatRequest2 = await createValidHeartbeatRequest(
              deviceId,
              keyPair.privateKey,
              Date.now(),
              nonce, // 相同的 nonce
              systemInfo
            );

            // 发送第二个请求
            const request2 = createTestRequest(heartbeatRequest2);
            const response2 = await heartbeat(request2, env, {} as ExecutionContext);

            // 第二个请求应该被拒绝（重放攻击）
            expect(response2.status).toBe(401);
            const responseData2: HeartbeatResponse = await response2.json();
            expect(responseData2.status).toBe('error');
            expect(responseData2.error_code).toBe('REPLAY_ATTACK');
          }
        ),
        { numRuns: 30 } // 减少运行次数避免速率限制
      );
    });

    it('should allow different nonces from the same device', async () => {
      await fc.assert(
        fc.asyncProperty(
          deviceIdArbitrary,
          fc.array(nonceArbitrary, { minLength: 2, maxLength: 3 }).filter(nonces => {
            // 确保所有 nonce 都是唯一的
            return new Set(nonces).size === nonces.length;
          }),
          systemInfoArbitrary,
          async (deviceId, nonces, systemInfo) => {
            // 清理KV存储以避免速率限制干扰
            mockKv.clear();
            
            // 获取预创建的密钥对
            const keyPair = deviceKeyPairs.get(deviceId);
            if (!keyPair) throw new Error(`Key pair not found for device ${deviceId}`);

            // 发送多个使用不同 nonce 的心跳请求
            for (const nonce of nonces) {
              await new Promise(resolve => setTimeout(resolve, 50)); // 避免时间戳冲突和速率限制

              const heartbeatRequest = await createValidHeartbeatRequest(
                deviceId,
                keyPair.privateKey,
                Date.now(),
                nonce,
                systemInfo
              );

              const request = createTestRequest(heartbeatRequest);
              const response = await heartbeat(request, env, {} as ExecutionContext);

              // 每个请求都应该成功
              expect(response.status).toBe(200);
              const responseData: HeartbeatResponse = await response.json();
              expect(responseData.status).toBe('ok');
            }
          }
        ),
        { numRuns: 20 } // 减少运行次数避免速率限制
      );
    });
  });

  describe('Integration Properties', () => {
    it('should handle rate limiting correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 65, max: 80 }), // 减少请求数避免测试超时
          async (requestCount) => {
            // 清理KV存储
            mockKv.clear();
            
            // 使用预创建的设备
            const deviceId = 'test-device-1';
            const keyPair = deviceKeyPairs.get(deviceId);
            if (!keyPair) throw new Error(`Key pair not found for device ${deviceId}`);

            let successCount = 0;
            let rateLimitedCount = 0;
            let otherErrorCount = 0;

            // 发送大量请求
            for (let i = 0; i < requestCount; i++) {
              const heartbeatRequest = await createValidHeartbeatRequest(
                deviceId,
                keyPair.privateKey,
                Date.now(),
                Math.random().toString(36).substring(2, 18) + i, // 确保 nonce 唯一
                { platform: 'linux', version: '1.0.0', uptime: i * 1000 }
              );

              const request = createTestRequest(heartbeatRequest);
              const response = await heartbeat(request, env, {} as ExecutionContext);

              if (response.status === 200) {
                successCount++;
              } else if (response.status === 429) {
                rateLimitedCount++;
              } else {
                otherErrorCount++;
              }
            }

            // 验证速率限制生效
            expect(successCount).toBeLessThanOrEqual(60); // 最多60个成功请求
            expect(rateLimitedCount).toBeGreaterThan(0); // 应该有被限制的请求
            expect(successCount + rateLimitedCount + otherErrorCount).toBe(requestCount);
          }
        ),
        { numRuns: 5 } // 大幅减少运行次数，因为这个测试比较耗时
      );
    });
  });
});