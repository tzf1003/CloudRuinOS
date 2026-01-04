/**
 * 设备注册 API 属性测试
 * 验证设备注册的正确性属性
 * Feature: lightweight-rmm, Property 1: 令牌生成时效性
 * Feature: lightweight-rmm, Property 2: 设备注册唯一性  
 * Feature: lightweight-rmm, Property 3: 无效令牌拒绝
 * Validates: Requirements 1.1, 1.2, 1.3
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { enrollDevice, EnrollDeviceRequest, EnrollDeviceResponse } from './enrollment';
import { Env } from '../../index';
import { createKVManager } from '../../storage/kv-manager';
import { generateEnrollmentToken } from '../utils/crypto';

// Mock 环境设置
class MockD1Database {
  private data = new Map<string, any>();
  
  prepare(query: string) {
    return {
      bind: (...params: any[]) => ({
        run: async () => ({ success: true, meta: { changes: 1 } }),
        first: async () => null,
        all: async () => ({ results: [] }),
      }),
    };
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
    SERVER_PUBLIC_KEY: 'test-server-public-key',
  };
}

// 创建测试请求
function createTestRequest(body: EnrollDeviceRequest): Request {
  return new Request('https://test.example.com/agent/enroll', {
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
const platformArbitrary = fc.constantFrom('windows', 'linux', 'macos');
const versionArbitrary = fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[0-9]+\.[0-9]+\.[0-9]+/.test(s) || s === '1.0.0');
const tokenArbitrary = fc.string({ minLength: 16, maxLength: 64 });

const validEnrollRequestArbitrary = fc.record({
  enrollment_token: tokenArbitrary,
  platform: platformArbitrary,
  version: versionArbitrary,
});

// 分离不同类型的无效输入
const emptyTokenArbitrary = fc.constant('');
const invalidFormatTokenArbitrary = fc.oneof(
  fc.string({ maxLength: 15 }),
  fc.constant('invalid-token'),
  fc.constant('expired-token'),
);
const whitespaceTokenArbitrary = fc.string().filter(s => s.trim() === '' && s.length > 0);

describe('Device Enrollment Property Tests', () => {
  let env: Env;
  let mockKv: MockKVNamespace;

  beforeEach(() => {
    env = createTestEnv();
    mockKv = env.KV as any;
    mockKv.clear();
  });

  describe('Property 1: 令牌生成时效性', () => {
    it('should generate tokens with valid format and expiration time', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 60, max: 7200 }), // 过期时间：1分钟到2小时
          fc.option(fc.string({ minLength: 1, maxLength: 50 })), // 创建者
          async (expiresInSeconds, createdBy) => {
            const kvManager = createKVManager(mockKv as any);
            
            // 生成令牌
            const token = await generateEnrollmentToken(kvManager, expiresInSeconds, createdBy || undefined);
            
            // 验证令牌格式
            expect(token).toBeTruthy();
            expect(typeof token).toBe('string');
            expect(token!.length).toBeGreaterThanOrEqual(16);
            
            // 验证令牌可以被检索
            const tokenRecord = await kvManager.getEnrollmentToken(token!);
            expect(tokenRecord).toBeTruthy();
            expect(tokenRecord!.token).toBe(token);
            expect(tokenRecord!.used).toBe(false);
            expect(tokenRecord!.expires_at).toBeGreaterThan(Date.now());
            expect(tokenRecord!.expires_at).toBeLessThanOrEqual(Date.now() + (expiresInSeconds * 1000) + 1000); // 允许1秒误差
            
            if (createdBy) {
              expect(tokenRecord!.created_by).toBe(createdBy);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject expired tokens', async () => {
      await fc.assert(
        fc.asyncProperty(
          tokenArbitrary,
          async (tokenValue) => {
            const kvManager = createKVManager(mockKv as any);
            
            // 创建已过期的令牌（过期时间设为1毫秒前）
            const expiredTime = Date.now() - 1;
            await mockKv.put(
              `enroll:${tokenValue}`,
              JSON.stringify({
                token: tokenValue,
                created_at: expiredTime - 1000,
                expires_at: expiredTime,
                used: false,
              })
            );
            
            // 尝试获取过期令牌
            const tokenRecord = await kvManager.getEnrollmentToken(tokenValue);
            expect(tokenRecord).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 2: 设备注册唯一性', () => {
    it('should not reuse tokens after successful enrollment', async () => {
      await fc.assert(
        fc.asyncProperty(
          validEnrollRequestArbitrary,
          async (requestBody) => {
            const kvManager = createKVManager(mockKv as any);
            
            // 创建有效令牌
            const token = await generateEnrollmentToken(kvManager, 3600);
            requestBody.enrollment_token = token!;
            
            // 第一次注册应该成功
            const request1 = createTestRequest(requestBody);
            const response1 = await enrollDevice(request1, env, {} as ExecutionContext);
            expect(response1.status).toBe(200);
            
            const responseData1: EnrollDeviceResponse = await response1.json();
            expect(responseData1.success).toBe(true);
            
            // 第二次使用相同令牌应该失败
            const request2 = createTestRequest(requestBody);
            const response2 = await enrollDevice(request2, env, {} as ExecutionContext);
            expect(response2.status).toBe(401);
            
            const responseData2: EnrollDeviceResponse = await response2.json();
            expect(responseData2.success).toBe(false);
            expect(responseData2.error_code).toBe('INVALID_TOKEN');
          }
        ),
        { numRuns: 20 } // 减少运行次数
      );
    });

    it('should generate different device IDs for different enrollments', async () => {
      // 简化的唯一性测试，只测试设备ID生成的唯一性
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null), // 不需要输入参数
          async () => {
            const kvManager = createKVManager(mockKv as any);
            
            // 创建两个不同的有效令牌
            const token1 = await generateEnrollmentToken(kvManager, 3600);
            const token2 = await generateEnrollmentToken(kvManager, 3600);
            
            const requestBody1: EnrollDeviceRequest = {
              enrollment_token: token1!,
              platform: 'linux',
              version: '1.0.0',
            };
            
            const requestBody2: EnrollDeviceRequest = {
              enrollment_token: token2!,
              platform: 'windows',
              version: '1.0.0',
            };
            
            // 注册两个设备
            const request1 = createTestRequest(requestBody1);
            const response1 = await enrollDevice(request1, env, {} as ExecutionContext);
            expect(response1.status).toBe(200);
            
            const request2 = createTestRequest(requestBody2);
            const response2 = await enrollDevice(request2, env, {} as ExecutionContext);
            expect(response2.status).toBe(200);
            
            // 验证设备ID不同
            const responseData1: EnrollDeviceResponse = await response1.json();
            const responseData2: EnrollDeviceResponse = await response2.json();
            
            expect(responseData1.success).toBe(true);
            expect(responseData2.success).toBe(true);
            expect(responseData1.device_id).toBeTruthy();
            expect(responseData2.device_id).toBeTruthy();
            expect(responseData1.device_id).not.toBe(responseData2.device_id);
          }
        ),
        { numRuns: 10 } // 减少运行次数以避免超时
      );
    });
  });

  describe('Property 3: 无效令牌拒绝', () => {
    it('should reject requests with empty tokens as missing required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          emptyTokenArbitrary,
          platformArbitrary,
          versionArbitrary,
          async (emptyToken, platform, version) => {
            const requestBody: EnrollDeviceRequest = {
              enrollment_token: emptyToken,
              platform,
              version,
            };
            
            const request = createTestRequest(requestBody);
            const response = await enrollDevice(request, env, {} as ExecutionContext);
            
            // 空令牌被视为缺少必需字段，应该返回400错误
            expect(response.status).toBe(400);
            
            const responseData: EnrollDeviceResponse = await response.json();
            expect(responseData.success).toBe(false);
            expect(responseData.error_code).toBe('INVALID_REQUEST');
            expect(responseData.device_id).toBeUndefined();
            expect(responseData.public_key).toBeUndefined();
            expect(responseData.private_key).toBeUndefined();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should reject requests with invalid token formats', async () => {
      await fc.assert(
        fc.asyncProperty(
          invalidFormatTokenArbitrary,
          platformArbitrary,
          versionArbitrary,
          async (invalidToken, platform, version) => {
            const requestBody: EnrollDeviceRequest = {
              enrollment_token: invalidToken,
              platform,
              version,
            };
            
            const request = createTestRequest(requestBody);
            const response = await enrollDevice(request, env, {} as ExecutionContext);
            
            // 无效格式的令牌应该返回401错误
            expect(response.status).toBe(401);
            
            const responseData: EnrollDeviceResponse = await response.json();
            expect(responseData.success).toBe(false);
            expect(responseData.error_code).toBe('INVALID_TOKEN');
            expect(responseData.device_id).toBeUndefined();
            expect(responseData.public_key).toBeUndefined();
            expect(responseData.private_key).toBeUndefined();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should reject requests with whitespace-only tokens as missing required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          whitespaceTokenArbitrary,
          platformArbitrary,
          versionArbitrary,
          async (whitespaceToken, platform, version) => {
            const requestBody: EnrollDeviceRequest = {
              enrollment_token: whitespaceToken,
              platform,
              version,
            };
            
            const request = createTestRequest(requestBody);
            const response = await enrollDevice(request, env, {} as ExecutionContext);
            
            // 纯空白字符令牌被视为缺少必需字段，应该返回400错误
            expect(response.status).toBe(400);
            
            const responseData: EnrollDeviceResponse = await response.json();
            expect(responseData.success).toBe(false);
            expect(responseData.error_code).toBe('INVALID_REQUEST');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should reject requests with missing required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            // 缺少 enrollment_token
            fc.record({
              platform: platformArbitrary,
              version: versionArbitrary,
            }),
            // 缺少 platform
            fc.record({
              enrollment_token: tokenArbitrary,
              version: versionArbitrary,
            }),
            // 缺少 version
            fc.record({
              enrollment_token: tokenArbitrary,
              platform: platformArbitrary,
            }),
            // 空对象
            fc.constant({})
          ),
          async (incompleteRequest) => {
            const request = createTestRequest(incompleteRequest as EnrollDeviceRequest);
            const response = await enrollDevice(request, env, {} as ExecutionContext);
            
            // 应该返回400错误
            expect(response.status).toBe(400);
            
            const responseData: EnrollDeviceResponse = await response.json();
            expect(responseData.success).toBe(false);
            expect(responseData.error_code).toBe('INVALID_REQUEST');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject requests with invalid platform values when other fields are valid', async () => {
      await fc.assert(
        fc.asyncProperty(
          tokenArbitrary,
          fc.string().filter(s => s.trim() !== '' && !['windows', 'linux', 'macos'].includes(s)), // 非空但无效的平台值
          versionArbitrary,
          async (token, invalidPlatform, version) => {
            const kvManager = createKVManager(mockKv as any);
            
            // 创建有效的令牌以确保平台验证被触发
            const validToken = await generateEnrollmentToken(kvManager, 3600);
            
            const requestBody: EnrollDeviceRequest = {
              enrollment_token: validToken!,
              platform: invalidPlatform as any,
              version,
            };
            
            const request = createTestRequest(requestBody);
            const response = await enrollDevice(request, env, {} as ExecutionContext);
            
            // 应该返回400错误，错误码为INVALID_PLATFORM
            expect(response.status).toBe(400);
            
            const responseData: EnrollDeviceResponse = await response.json();
            expect(responseData.success).toBe(false);
            expect(responseData.error_code).toBe('INVALID_PLATFORM');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should reject requests with empty platform as missing required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          tokenArbitrary,
          fc.constant(''), // 空平台值
          versionArbitrary,
          async (token, emptyPlatform, version) => {
            const requestBody: EnrollDeviceRequest = {
              enrollment_token: token,
              platform: emptyPlatform as any,
              version,
            };
            
            const request = createTestRequest(requestBody);
            const response = await enrollDevice(request, env, {} as ExecutionContext);
            
            // 空平台值被视为缺少必需字段，应该返回400错误
            expect(response.status).toBe(400);
            
            const responseData: EnrollDeviceResponse = await response.json();
            expect(responseData.success).toBe(false);
            expect(responseData.error_code).toBe('INVALID_REQUEST');
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Integration Properties', () => {
    it('should handle concurrent enrollment requests correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(validEnrollRequestArbitrary, { minLength: 2, maxLength: 3 }), // 进一步减少并发数量
          async (requests) => {
            const kvManager = createKVManager(mockKv as any);
            
            // 为每个请求创建有效的令牌
            const tokensPromises = requests.map(() => generateEnrollmentToken(kvManager, 3600));
            const tokens = await Promise.all(tokensPromises);
            
            requests.forEach((req, i) => {
              req.enrollment_token = tokens[i]!;
            });
            
            // 并发处理所有请求
            const enrollmentPromises = requests.map(requestBody => {
              const request = createTestRequest(requestBody);
              return enrollDevice(request, env, {} as ExecutionContext);
            });
            
            const responses = await Promise.all(enrollmentPromises);
            
            // 验证所有请求都成功
            for (const response of responses) {
              expect(response.status).toBe(200);
              const responseData: EnrollDeviceResponse = await response.json();
              expect(responseData.success).toBe(true);
            }
            
            // 验证生成的设备ID都是唯一的
            const deviceIds = new Set<string>();
            for (const response of responses) {
              const responseData: EnrollDeviceResponse = await response.json();
              expect(deviceIds.has(responseData.device_id!)).toBe(false);
              deviceIds.add(responseData.device_id!);
            }
            
            expect(deviceIds.size).toBe(requests.length);
          }
        ),
        { numRuns: 10 } // 大幅减少运行次数，因为并发测试比较耗时
      );
    });
  });
});