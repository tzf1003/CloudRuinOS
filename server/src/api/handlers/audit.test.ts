/**
 * 审计日志查询 API 属性测试
 * Property 38: 审计日志查询
 * Validates: Requirements 9.5
 */

import fc from 'fast-check';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { getAuditLogsHandler } from './audit';
import { createAuditLog, getAuditLogs } from '../utils/database';
import { AuditLogFilters } from '../../types/database';

// Mock environment for testing
const mockEnv = {
  DB: {
    prepare: vi.fn(),
    batch: vi.fn(),
    dump: vi.fn(),
    exec: vi.fn(),
  },
  KV: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
  },
  R2: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
  },
} as any;

const mockCtx = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
} as any;

// Mock database functions
vi.mock('../utils/database', () => ({
  getAuditLogs: vi.fn(),
}));

const mockGetAuditLogs = getAuditLogs as any;

describe('Audit Query API Property Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Property 38: 审计日志查询
   * 验证审计日志查询 API 的正确性
   */
  describe('Property 38: Audit log query', () => {
    it('should handle valid query parameters correctly', async () => {
      await fc.assert(fc.asyncProperty(
        fc.record({
          device_id: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
          session_id: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
          action_type: fc.option(fc.constantFrom('register', 'heartbeat', 'command', 'file_op', 'session')),
          result: fc.option(fc.constantFrom('success', 'error')),
          start_time: fc.option(fc.integer({ min: 1000000000, max: 2000000000 })),
          end_time: fc.option(fc.integer({ min: 1000000000, max: 2000000000 })),
          limit: fc.option(fc.integer({ min: 1, max: 1000 })),
          offset: fc.option(fc.integer({ min: 0, max: 10000 })),
        }),
        async (filters) => {
          // Mock successful database response
          const mockResult = {
            data: [],
            total: 0,
            page: 1,
            limit: filters.limit || 100,
            has_more: false,
          };
          mockGetAuditLogs.mockResolvedValue(mockResult);

          // Build query string
          const params = new URLSearchParams();
          Object.entries(filters).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
              params.append(key, value.toString());
            }
          });

          const request = new Request(`https://example.com/audit?${params.toString()}`);
          const response = await getAuditLogsHandler(request, mockEnv, mockCtx);

          expect(response.status).toBe(200);
          
          const responseData = await response.json();
          expect(responseData.success).toBe(true);
          expect(responseData.data).toEqual([]);
          expect(responseData.pagination).toEqual({
            total: 0,
            page: 1,
            limit: filters.limit || 100,
            has_more: false,
          });

          // Verify database was called with correct filters
          expect(mockGetAuditLogs).toHaveBeenCalledWith(
            mockEnv.DB,
            expect.objectContaining({
              device_id: filters.device_id || undefined,
              session_id: filters.session_id || undefined,
              action_type: filters.action_type || undefined,
              result: filters.result || undefined,
              start_time: filters.start_time || undefined,
              end_time: filters.end_time || undefined,
              limit: filters.limit || 100,
              offset: filters.offset || 0,
            })
          );
        }
      ), { numRuns: 100 });
    });

    it('should reject invalid limit parameters', async () => {
      await fc.assert(fc.asyncProperty(
        fc.integer().filter(n => n < 1 || n > 1000),
        async (invalidLimit) => {
          const request = new Request(`https://example.com/audit?limit=${invalidLimit}`);
          const response = await getAuditLogsHandler(request, mockEnv, mockCtx);

          expect(response.status).toBe(400);
          
          const responseData = await response.json();
          expect(responseData.error).toContain('Invalid limit parameter');
        }
      ), { numRuns: 50 });
    });

    it('should reject invalid offset parameters', async () => {
      await fc.assert(fc.asyncProperty(
        fc.integer({ max: -1 }),
        async (invalidOffset) => {
          const request = new Request(`https://example.com/audit?offset=${invalidOffset}`);
          const response = await getAuditLogsHandler(request, mockEnv, mockCtx);

          expect(response.status).toBe(400);
          
          const responseData = await response.json();
          expect(responseData.error).toContain('Invalid offset parameter');
        }
      ), { numRuns: 50 });
    });

    it('should handle database errors gracefully', async () => {
      await fc.assert(fc.asyncProperty(
        fc.record({
          device_id: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
          limit: fc.option(fc.integer({ min: 1, max: 100 })),
        }),
        async (filters) => {
          // Mock database error
          mockGetAuditLogs.mockRejectedValue(new Error('Database connection failed'));

          const params = new URLSearchParams();
          Object.entries(filters).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
              params.append(key, value.toString());
            }
          });

          const request = new Request(`https://example.com/audit?${params.toString()}`);
          const response = await getAuditLogsHandler(request, mockEnv, mockCtx);

          expect(response.status).toBe(500);
          
          const responseData = await response.json();
          expect(responseData.success).toBe(false);
          expect(responseData.error).toBe('Internal server error');
        }
      ), { numRuns: 50 });
    });

    it('should properly parse and return action_data JSON', async () => {
      await fc.assert(fc.asyncProperty(
        fc.array(fc.record({
          id: fc.integer({ min: 1 }),
          device_id: fc.string({ minLength: 1, maxLength: 50 }),
          action_type: fc.constantFrom('register', 'heartbeat', 'command', 'file_op', 'session'),
          action_data: fc.option(fc.jsonValue()),
          result: fc.constantFrom('success', 'error'),
          timestamp: fc.integer({ min: 1000000000, max: 2000000000 }),
        }), { minLength: 0, maxLength: 10 }),
        async (mockLogs) => {
          // Convert action_data to JSON strings as they would be stored in DB
          const dbLogs = mockLogs.map(log => ({
            ...log,
            action_data: log.action_data !== null && log.action_data !== undefined 
              ? JSON.stringify(log.action_data) 
              : null,
          }));

          const mockResult = {
            data: dbLogs,
            total: dbLogs.length,
            page: 1,
            limit: 100,
            has_more: false,
          };
          mockGetAuditLogs.mockResolvedValue(mockResult as any);

          const request = new Request('https://example.com/audit');
          const response = await getAuditLogsHandler(request, mockEnv, mockCtx);

          expect(response.status).toBe(200);
          
          const responseData = await response.json();
          expect(responseData.success).toBe(true);
          
          // Verify action_data is properly parsed back to objects
          responseData.data.forEach((log: any, index: number) => {
            if (mockLogs[index].action_data !== null && mockLogs[index].action_data !== undefined) {
              expect(log.action_data).toEqual(mockLogs[index].action_data);
            } else {
              expect(log.action_data).toBeNull();
            }
          });
        }
      ), { numRuns: 50 });
    });

    it('should maintain pagination consistency', async () => {
      await fc.assert(fc.asyncProperty(
        fc.record({
          total: fc.integer({ min: 0, max: 1000 }),
          limit: fc.integer({ min: 1, max: 100 }),
          offset: fc.integer({ min: 0, max: 500 }),
        }),
        async ({ total, limit, offset }) => {
          const mockResult = {
            data: [],
            total,
            page: Math.floor(offset / limit) + 1,
            limit,
            has_more: offset + limit < total,
          };
          mockGetAuditLogs.mockResolvedValue(mockResult);

          const request = new Request(`https://example.com/audit?limit=${limit}&offset=${offset}`);
          const response = await getAuditLogsHandler(request, mockEnv, mockCtx);

          expect(response.status).toBe(200);
          
          const responseData = await response.json();
          expect(responseData.pagination.total).toBe(total);
          expect(responseData.pagination.limit).toBe(limit);
          expect(responseData.pagination.page).toBe(Math.floor(offset / limit) + 1);
          expect(responseData.pagination.has_more).toBe(offset + limit < total);
        }
      ), { numRuns: 100 });
    });

    it('should include proper cache headers', async () => {
      await fc.assert(fc.asyncProperty(
        fc.constant({}),
        async () => {
          mockGetAuditLogs.mockResolvedValue({
            data: [],
            total: 0,
            page: 1,
            limit: 100,
            has_more: false,
          });

          const request = new Request('https://example.com/audit');
          const response = await getAuditLogsHandler(request, mockEnv, mockCtx);

          expect(response.status).toBe(200);
          expect(response.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate');
          expect(response.headers.get('Content-Type')).toBe('application/json');
        }
      ), { numRuns: 20 });
    });
  });
});