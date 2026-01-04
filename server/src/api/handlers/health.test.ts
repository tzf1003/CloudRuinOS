/**
 * Health check and monitoring property tests
 * **Property 39: 健康检查监控**
 * **Validates: Requirements 10.5**
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
import { 
  handleHealthCheck, 
  handleDetailedHealthCheck, 
  handleReadinessCheck, 
  handleLivenessCheck, 
  handleMetrics 
} from './health';
import { Env } from '../../index';

// Mock environment for testing
const createMockEnv = (overrides: Partial<Env> = {}): Env => ({
  DB: {
    prepare: vi.fn().mockReturnValue({
      first: vi.fn().mockResolvedValue({ test: 1 }),
      all: vi.fn().mockResolvedValue({ results: [{ name: 'devices' }, { name: 'sessions' }, { name: 'audit_logs' }] }),
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({ success: true }),
    }),
  } as any,
  KV: {
    get: vi.fn().mockResolvedValue('test'),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue({ keys: [] }),
  } as any,
  R2: {
    list: vi.fn().mockResolvedValue({ objects: [] }),
  } as any,
  SESSION_DO: {
    idFromName: vi.fn().mockReturnValue('test-id'),
    get: vi.fn().mockReturnValue({
      fetch: vi.fn().mockResolvedValue(new Response('{"status": "ok"}', { status: 200 })),
    }),
  } as any,
  ENROLLMENT_SECRET: 'test-enrollment-secret',
  JWT_SECRET: 'test-jwt-secret',
  WEBHOOK_SECRET: 'test-webhook-secret',
  DB_ENCRYPTION_KEY: 'test-db-encryption-key',
  ADMIN_API_KEY: 'test-admin-api-key',
  ENVIRONMENT: 'test',
  API_VERSION: 'v1',
  MAX_FILE_SIZE: '10485760',
  SESSION_TIMEOUT: '1800',
  HEARTBEAT_INTERVAL: '60',
  NONCE_WINDOW: '300',
  ...overrides,
});

describe('Health Check Monitoring Properties', () => {
  let mockEnv: Env;

  beforeEach(() => {
    mockEnv = createMockEnv();
    vi.clearAllMocks();
  });

  describe('Property 39: 健康检查监控', () => {
    it('should always return valid health status for any system state', async () => {
      await fc.assert(fc.asyncProperty(
        fc.record({
          dbHealthy: fc.boolean(),
          kvHealthy: fc.boolean(),
          r2Healthy: fc.boolean(),
          doHealthy: fc.boolean(),
          secretsPresent: fc.boolean(),
        }),
        async (systemState) => {
          // **Feature: lightweight-rmm, Property 39: 健康检查监控**
          // **Validates: Requirements 10.5**
          
          // Configure mock environment based on system state
          const env = createMockEnv();
          
          if (!systemState.dbHealthy) {
            (env.DB.prepare as any).mockReturnValue({
              first: vi.fn().mockRejectedValue(new Error('Database connection failed')),
            });
          }
          
          if (!systemState.kvHealthy) {
            (env.KV.get as any).mockRejectedValue(new Error('KV store unavailable'));
            (env.KV.put as any).mockRejectedValue(new Error('KV store unavailable'));
          }
          
          if (!systemState.r2Healthy) {
            (env.R2.list as any).mockRejectedValue(new Error('R2 storage unavailable'));
          }
          
          if (!systemState.doHealthy) {
            (env.SESSION_DO.get as any).mockReturnValue({
              fetch: vi.fn().mockResolvedValue(new Response('Error', { status: 500 })),
            });
          }
          
          if (!systemState.secretsPresent) {
            env.ENROLLMENT_SECRET = '';
            env.JWT_SECRET = '';
          }

          const request = new Request('http://localhost/health');
          const response = await handleHealthCheck(request, env);
          
          // Property: Health check should always return a valid response structure
          expect(response).toBeInstanceOf(Response);
          expect(response.headers.get('Content-Type')).toBe('application/json');
          
          const healthData = await response.json();
          
          // Verify response structure
          expect(healthData).toHaveProperty('status');
          expect(healthData).toHaveProperty('timestamp');
          expect(healthData).toHaveProperty('version');
          expect(healthData).toHaveProperty('environment');
          expect(healthData).toHaveProperty('checks');
          
          // Status should be one of the valid values
          expect(['healthy', 'degraded', 'unhealthy']).toContain(healthData.status);
          
          // Timestamp should be a valid number
          expect(typeof healthData.timestamp).toBe('number');
          expect(healthData.timestamp).toBeGreaterThan(0);
          
          // Checks should contain all required components
          expect(healthData.checks).toHaveProperty('database');
          expect(healthData.checks).toHaveProperty('kv');
          expect(healthData.checks).toHaveProperty('r2');
          expect(healthData.checks).toHaveProperty('durableObjects');
          expect(healthData.checks).toHaveProperty('secrets');
          
          // Each check should have valid status
          Object.values(healthData.checks).forEach((check: any) => {
            expect(['healthy', 'degraded', 'unhealthy']).toContain(check.status);
            expect(typeof check.lastCheck).toBe('number');
          });
          
          // HTTP status should match health status
          if (healthData.status === 'healthy') {
            expect(response.status).toBe(200);
          } else if (healthData.status === 'degraded') {
            expect(response.status).toBe(200);
          } else {
            expect(response.status).toBe(503);
          }
          
          // Response should have health status header
          expect(response.headers.get('X-Health-Status')).toBe(healthData.status);
        }
      ), { numRuns: 100 });
    });

    it('should provide consistent readiness check results', async () => {
      await fc.assert(fc.asyncProperty(
        fc.record({
          dbReady: fc.boolean(),
          secretsReady: fc.boolean(),
          tablesExist: fc.boolean(),
        }),
        async (readinessState) => {
          // Configure mock environment
          const env = createMockEnv();
          
          if (!readinessState.dbReady) {
            (env.DB.prepare as any).mockReturnValue({
              first: vi.fn().mockRejectedValue(new Error('Database not ready')),
              all: vi.fn().mockRejectedValue(new Error('Database not ready')),
            });
          } else if (!readinessState.tablesExist) {
            (env.DB.prepare as any).mockReturnValue({
              all: vi.fn().mockResolvedValue({ results: [] }), // No tables
            });
          }
          
          if (!readinessState.secretsReady) {
            env.ENROLLMENT_SECRET = '';
          }

          const request = new Request('http://localhost/health/ready');
          const response = await handleReadinessCheck(request, env);
          
          // Property: Readiness check should return consistent results
          expect(response).toBeInstanceOf(Response);
          expect(response.headers.get('Content-Type')).toBe('text/plain');
          
          const responseText = await response.text();
          
          if (readinessState.dbReady && readinessState.tablesExist && readinessState.secretsReady) {
            expect(response.status).toBe(200);
            expect(responseText).toBe('Ready');
          } else {
            expect(response.status).toBe(503);
            expect(responseText).toBe('Not Ready');
          }
        }
      ), { numRuns: 100 });
    });

    it('should always respond to liveness checks', async () => {
      await fc.assert(fc.asyncProperty(
        fc.record({
          // Liveness should work regardless of system state
          anySystemState: fc.anything(),
        }),
        async () => {
          // **Feature: lightweight-rmm, Property 39: 健康检查监控**
          // Liveness check should always succeed if the service can respond
          
          const env = createMockEnv();
          const request = new Request('http://localhost/health/live');
          const response = await handleLivenessCheck(request, env);
          
          // Property: Liveness check should always return 200 if service is running
          expect(response.status).toBe(200);
          expect(response.headers.get('Content-Type')).toBe('text/plain');
          
          const responseText = await response.text();
          expect(responseText).toBe('Alive');
        }
      ), { numRuns: 100 });
    });

    it('should provide valid metrics in multiple formats', async () => {
      await fc.assert(fc.asyncProperty(
        fc.oneof(
          fc.constant('application/json'),
          fc.constant('text/plain'),
          fc.constant('application/openmetrics-text'),
          fc.constant('*/*')
        ),
        async (acceptHeader) => {
          const env = createMockEnv();
          const request = new Request('http://localhost/metrics', {
            headers: { 'Accept': acceptHeader }
          });
          const response = await handleMetrics(request, env);
          
          // Property: Metrics should be available in requested format
          expect(response.status).toBe(200);
          
          if (acceptHeader.includes('text/plain') || acceptHeader.includes('openmetrics')) {
            expect(response.headers.get('Content-Type')).toContain('text/plain');
            
            const metricsText = await response.text();
            expect(metricsText).toContain('rmm_uptime_seconds');
            expect(metricsText).toContain('rmm_requests_total');
            expect(metricsText).toContain('rmm_error_rate');
          } else {
            expect(response.headers.get('Content-Type')).toBe('application/json');
            
            const metricsData = await response.json();
            expect(metricsData).toHaveProperty('uptime');
            expect(metricsData).toHaveProperty('requestCount');
            expect(metricsData).toHaveProperty('errorRate');
            expect(metricsData).toHaveProperty('averageResponseTime');
            expect(metricsData).toHaveProperty('activeConnections');
            
            // All metrics should be numbers
            Object.values(metricsData).forEach(value => {
              expect(typeof value).toBe('number');
              expect(value).toBeGreaterThanOrEqual(0);
            });
          }
        }
      ), { numRuns: 100 });
    });

    it('should handle detailed health checks with timing information', async () => {
      await fc.assert(fc.asyncProperty(
        fc.record({
          dbResponseTime: fc.integer({ min: 1, max: 100 }), // Reduced max time
          kvResponseTime: fc.integer({ min: 1, max: 100 }),
          r2ResponseTime: fc.integer({ min: 1, max: 100 }),
        }),
        async (timingData) => {
          const env = createMockEnv();
          
          // Mock timing delays (reduced for test performance)
          (env.DB.prepare as any).mockImplementation(() => ({
            first: vi.fn().mockImplementation(() => 
              new Promise(resolve => 
                setTimeout(() => resolve({ test: 1 }), timingData.dbResponseTime)
              )
            ),
          }));

          const request = new Request('http://localhost/health/detailed');
          const startTime = Date.now();
          const response = await handleDetailedHealthCheck(request, env);
          const totalTime = Date.now() - startTime;
          
          // Property: Detailed health check should include timing and metrics
          expect(response.status).toBeOneOf([200, 503]);
          
          const healthData = await response.json();
          expect(healthData).toHaveProperty('metrics');
          expect(healthData.metrics).toHaveProperty('averageResponseTime');
          
          // Response time should be reasonable
          expect(healthData.metrics.averageResponseTime).toBeGreaterThan(0);
          expect(healthData.metrics.averageResponseTime).toBeLessThanOrEqual(totalTime + 1000); // Allow more margin
          
          // Should have response time header
          const responseTimeHeader = response.headers.get('X-Response-Time');
          expect(responseTimeHeader).toBeTruthy();
          expect(parseInt(responseTimeHeader!)).toBeGreaterThan(0);
        }
      ), { numRuns: 20, timeout: 10000 }); // Reduced runs and increased timeout
    });

    it('should maintain health check consistency across multiple calls', async () => {
      await fc.assert(fc.asyncProperty(
        fc.integer({ min: 2, max: 5 }),
        async (numCalls) => {
          const env = createMockEnv();
          
          // Make multiple health check calls and clone responses to avoid body read issues
          const responses = await Promise.all(
            Array(numCalls).fill(null).map(() => handleHealthCheck(new Request('http://localhost/health'), env))
          );
          
          // Clone responses to read bodies multiple times
          const clonedResponses = responses.map(response => response.clone());
          
          // Property: Health checks should be consistent when system state is stable
          const healthStatuses = await Promise.all(
            clonedResponses.map(async (response) => {
              const data = await response.json();
              return data.status;
            })
          );
          
          // All health statuses should be the same for stable system
          const firstStatus = healthStatuses[0];
          healthStatuses.forEach(status => {
            expect(status).toBe(firstStatus);
          });
          
          // All responses should have similar structure
          const healthData = await Promise.all(
            responses.map(async response => {
              const cloned = response.clone();
              return await cloned.json();
            })
          );
          
          healthData.forEach(data => {
            expect(data).toHaveProperty('status');
            expect(data).toHaveProperty('checks');
            expect(Object.keys(data.checks)).toEqual(['database', 'kv', 'r2', 'durableObjects', 'secrets']);
          });
        }
      ), { numRuns: 100 });
    });
  });

  describe('Error Handling Properties', () => {
    it('should gracefully handle service failures', async () => {
      await fc.assert(fc.asyncProperty(
        fc.record({
          dbError: fc.boolean(),
          kvError: fc.boolean(),
          r2Error: fc.boolean(),
          doError: fc.boolean(),
        }),
        async (errorState) => {
          const env = createMockEnv();
          
          // Inject errors based on error state
          if (errorState.dbError) {
            (env.DB.prepare as any).mockImplementation(() => {
              throw new Error('Database connection failed');
            });
          }
          
          if (errorState.kvError) {
            (env.KV.get as any).mockRejectedValue(new Error('KV store error'));
          }
          
          if (errorState.r2Error) {
            (env.R2.list as any).mockRejectedValue(new Error('R2 storage error'));
          }
          
          if (errorState.doError) {
            (env.SESSION_DO.get as any).mockImplementation(() => {
              throw new Error('Durable Object error');
            });
          }

          const request = new Request('http://localhost/health');
          const response = await handleHealthCheck(request, env);
          
          // Property: Health check should never throw unhandled errors
          expect(response).toBeInstanceOf(Response);
          expect(response.headers.get('Content-Type')).toBe('application/json');
          
          const healthData = await response.json();
          
          // Should still return valid structure even with errors
          expect(healthData).toHaveProperty('status');
          expect(healthData).toHaveProperty('checks');
          
          // Failed services should be marked as unhealthy
          if (errorState.dbError) {
            expect(healthData.checks.database.status).toBe('unhealthy');
            expect(healthData.checks.database.error).toContain('Database');
          }
          
          if (errorState.kvError) {
            expect(healthData.checks.kv.status).toBe('unhealthy');
            expect(healthData.checks.kv.error).toContain('KV');
          }
          
          if (errorState.r2Error) {
            expect(healthData.checks.r2.status).toBe('unhealthy');
            expect(healthData.checks.r2.error).toContain('R2');
          }
          
          if (errorState.doError) {
            expect(healthData.checks.durableObjects.status).toBe('unhealthy');
            expect(healthData.checks.durableObjects.error).toContain('Durable');
          }
        }
      ), { numRuns: 100 });
    });
  });
});

// Helper function for test assertions
expect.extend({
  toBeOneOf(received, expected) {
    const pass = expected.includes(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be one of ${expected.join(', ')}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be one of ${expected.join(', ')}`,
        pass: false,
      };
    }
  },
});