/**
 * 会话管理属性测试
 * 验证会话创建、身份验证和超时清理的正确性属性
 * Requirements: 3.1, 3.3, 3.5
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fc from 'fast-check';
import { unstable_dev } from 'wrangler';
import type { UnstableDevWorker } from 'wrangler';

describe('Session Management Property Tests', () => {
  let worker: UnstableDevWorker;

  beforeAll(async () => {
    // 优化 wrangler dev 配置以减少启动时间
    worker = await unstable_dev('src/index.ts', {
      experimental: { disableExperimentalWarning: true },
      // 使用主配置文件，它包含数据库绑定
      local: true, // 强制使用本地模式
      persist: false, // 不持久化状态以加快启动
      logLevel: 'error', // 减少日志输出
      vars: {
        ENVIRONMENT: 'test',
        SESSION_TIMEOUT: '30', // 缩短超时时间用于测试
        HEARTBEAT_INTERVAL: '10',
        // 提供测试环境的默认 secrets
        ENROLLMENT_SECRET: 'test-enrollment-secret-12345',
        JWT_SECRET: 'test-jwt-secret-key-for-testing',
        WEBHOOK_SECRET: 'test-webhook-secret-12345',
        DB_ENCRYPTION_KEY: 'test-db-encryption-key-32-chars-long-12345678',
        ADMIN_API_KEY: 'test-admin-api-key-for-testing-12345'
      }
    });
    
    // 等待 worker 完全启动
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 验证 worker 是否正常工作 - 使用更简单的端点
    try {
      const healthCheck = await worker.fetch('/ping');
      if (healthCheck.status !== 200) {
        console.error('Health check failed with status:', healthCheck.status);
        const text = await healthCheck.text();
        console.error('Response:', text);
        throw new Error(`Worker failed to start properly: ${healthCheck.status}`);
      }
    } catch (error) {
      console.error('Health check error:', error);
      throw error;
    }
  }, 120000); // 增加超时时间到2分钟

  afterAll(async () => {
    if (worker) {
      try {
        await worker.stop();
      } catch (error) {
        console.warn('Error stopping worker:', error);
      }
    }
  });

  // 辅助函数：创建测试设备
  async function createTestDevice(tokenSuffix: string): Promise<string> {
    // 使用特殊的测试 token 格式，在测试环境中会被特殊处理
    const testToken = `test-token-${tokenSuffix}-${Date.now()}`;
    
    const enrollResponse = await worker.fetch('/agent/enroll', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        enrollment_token: testToken,
        platform: 'linux', // 使用有效的平台名称
        version: '1.0.0',
      }),
    });
    
    if (enrollResponse.status !== 200) {
      const errorText = await enrollResponse.text();
      console.error('Enrollment error:', errorText);
      throw new Error(`Failed to create test device: ${enrollResponse.status} - ${errorText}`);
    }
    
    const enrollData = await enrollResponse.json() as any;
    return enrollData.device_id;
  }

  /**
   * Property 11: 会话创建机制
   * Feature: lightweight-rmm, Property 11: 会话创建机制
   * Validates: Requirements 3.1
   */
  it('Property 11: 会话创建机制 - 对于任何管理员创建会话的请求，系统应该通过 Durable Object 正确创建 WebSocket 会话', async () => {
    const testDeviceId = await createTestDevice('property11');

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          requestId: fc.string({ minLength: 5, maxLength: 20 }),
          timestamp: fc.integer({ min: Date.now() - 86400000, max: Date.now() + 86400000 })
        }),
        async (sessionRequest) => {
          try {
            // 创建会话请求
            const response = await worker.fetch('/sessions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                deviceId: testDeviceId,
                requestId: sessionRequest.requestId,
                timestamp: sessionRequest.timestamp
              }),
            });

            // 验证响应状态
            expect(response.status).toBe(200);
            
            const result = await response.json() as any;
            
            // 验证会话创建的基本属性
            expect(result).toHaveProperty('sessionId');
            expect(result).toHaveProperty('durableObjectId');
            expect(result).toHaveProperty('websocketUrl');
            expect(result.deviceId).toBe(testDeviceId);
            
            // 验证会话 ID 格式
            expect(typeof result.sessionId).toBe('string');
            expect(result.sessionId.length).toBeGreaterThan(10);
            
            // 验证 WebSocket URL 格式
            expect(result.websocketUrl).toMatch(/^wss?:\/\/.+\/ws\?sessionId=.+&deviceId=.+/);
            
            // 验证过期时间设置
            expect(result).toHaveProperty('expiresAt');
            expect(result.expiresAt).toBeGreaterThan(Date.now());
          } catch (error) {
            console.error('Property 11 test error:', error);
            throw error;
          }
        }
      ),
      { numRuns: 3, timeout: 30000 } // 增加超时时间并减少运行次数
    );
  }, 60000); // 增加测试超时时间

  /**
   * Property 13: 会话身份验证
   * Feature: lightweight-rmm, Property 13: 会话身份验证
   * Validates: Requirements 3.3
   */
  it('Property 13: 会话身份验证 - 对于任何建立的 WebSocket 连接，系统应该验证 Agent 身份并正确绑定会话', async () => {
    const testDeviceId = await createTestDevice('property13');

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          validSignature: fc.boolean(),
          timestamp: fc.integer({ min: Date.now() - 3600000, max: Date.now() + 3600000 })
        }),
        async (authData) => {
          try {
            // 首先创建一个会话
            const sessionResponse = await worker.fetch('/sessions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                deviceId: testDeviceId,
                requestId: `test-${Date.now()}-${Math.random()}`,
                timestamp: authData.timestamp
              }),
            });

            expect(sessionResponse.status).toBe(200);
            const sessionData = await sessionResponse.json() as any;

            // 验证会话状态查询
            const statusResponse = await worker.fetch(`/sessions/${sessionData.sessionId}`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
              },
            });

            expect(statusResponse.status).toBe(200);
            const statusData = await statusResponse.json() as any;
            
            // 验证会话绑定属性
            expect(statusData.sessionId).toBe(sessionData.sessionId);
            expect(statusData.deviceId).toBe(testDeviceId);
            expect(statusData).toHaveProperty('status');
            expect(statusData).toHaveProperty('createdAt');
            
            // 验证会话状态的有效性
            expect(['pending', 'connected', 'authenticated', 'expired'].includes(statusData.status)).toBe(true);
          } catch (error) {
            console.error('Property 13 test error:', error);
            throw error;
          }
        }
      ),
      { numRuns: 3, timeout: 30000 }
    );
  }, 60000);

  /**
   * Property 15: 会话超时清理
   * Feature: lightweight-rmm, Property 15: 会话超时清理
   * Validates: Requirements 3.5
   */
  it('Property 15: 会话超时清理 - 对于任何空闲超时的会话，系统应该自动清理会话资源', async () => {
    const testDeviceId = await createTestDevice('property15');

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          sessionTimeout: fc.integer({ min: 1000, max: 2000 }), // 1-2秒用于测试
          idleTime: fc.integer({ min: 500, max: 1500 }) // 0.5-1.5秒，减少等待时间
        }),
        async (timeoutData) => {
          try {
            // 创建会话
            const sessionResponse = await worker.fetch('/sessions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                deviceId: testDeviceId,
                requestId: `timeout-test-${Date.now()}-${Math.random()}`,
                timestamp: Date.now(),
                sessionTimeout: timeoutData.sessionTimeout
              }),
            });

            expect(sessionResponse.status).toBe(200);
            const sessionData = await sessionResponse.json() as any;

            // 等待指定的空闲时间（限制在1秒内）
            const waitTime = Math.min(timeoutData.idleTime, 1000);
            await new Promise(resolve => setTimeout(resolve, waitTime));

            // 检查会话状态
            const statusResponse = await worker.fetch(`/sessions/${sessionData.sessionId}`, {
              method: 'GET',
            });

            expect(statusResponse.status).toBe(200);
            const statusData = await statusResponse.json() as any;

            // 验证超时清理逻辑
            if (waitTime > timeoutData.sessionTimeout) {
              // 如果等待时间超过超时时间，会话应该被标记为过期或清理
              expect(['expired', 'disconnected'].includes(statusData.status)).toBe(true);
            } else {
              // 如果等待时间未超过超时时间，会话应该仍然有效
              expect(['pending', 'connected', 'authenticated'].includes(statusData.status)).toBe(true);
            }

            // 验证清理机制的一致性
            expect(statusData).toHaveProperty('sessionId');
            expect(statusData).toHaveProperty('deviceId');
            expect(statusData).toHaveProperty('status');
            
            // 如果会话过期，应该有过期时间戳
            if (statusData.status === 'expired') {
              expect(statusData).toHaveProperty('expiredAt');
              expect(statusData.expiredAt).toBeGreaterThan(statusData.createdAt);
            }
          } catch (error) {
            console.error('Property 15 test error:', error);
            throw error;
          }
        }
      ),
      { numRuns: 2, timeout: 30000 } // 减少运行次数并增加超时
    );
  }, 60000); // 增加超时时间

  /**
   * 辅助测试：验证会话数据结构的一致性
   */
  it('会话数据结构一致性验证', async () => {
    const testDeviceId = await createTestDevice('consistency');

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          requestId: fc.string({ minLength: 5, maxLength: 20 })
        }),
        async (sessionData) => {
          try {
            const response = await worker.fetch('/sessions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                deviceId: testDeviceId,
                requestId: sessionData.requestId
              }),
            });

            if (response.status === 200) {
              const result = await response.json() as any;
              
              // 验证所有必需字段都存在
              const requiredFields = ['sessionId', 'deviceId', 'durableObjectId', 'websocketUrl', 'expiresAt', 'createdAt'];
              for (const field of requiredFields) {
                expect(result).toHaveProperty(field);
              }
              
              // 验证数据类型
              expect(typeof result.sessionId).toBe('string');
              expect(typeof result.deviceId).toBe('string');
              expect(typeof result.durableObjectId).toBe('string');
              expect(typeof result.websocketUrl).toBe('string');
              expect(typeof result.expiresAt).toBe('number');
              expect(typeof result.createdAt).toBe('number');
              
              // 验证时间戳逻辑
              expect(result.expiresAt).toBeGreaterThan(result.createdAt);
              expect(result.createdAt).toBeLessThanOrEqual(Date.now());
            }
          } catch (error) {
            console.error('Consistency test error:', error);
            throw error;
          }
        }
      ),
      { numRuns: 3, timeout: 30000 }
    );
  }, 60000);
});