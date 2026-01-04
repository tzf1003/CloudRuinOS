import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor, cleanup } from '@testing-library/react'
import fc from 'fast-check'
import { useHealthMonitor } from '../hooks/useHealthMonitor'
import { apiClient } from '../lib/api-client'
import { HealthData, SystemMetrics } from '../types/api'

// Mock the API client
vi.mock('../lib/api-client', () => ({
  apiClient: {
    getHealthWithDetails: vi.fn(),
  }
}))

// Mock timers
vi.useFakeTimers()

describe('useHealthMonitor Property Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.clearAllTimers()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllTimers()
  })

  /**
   * Property 6: 健康状态实时更�?
   * Feature: frontend-enhancements, Property 6: 健康状态实时更�?
   * Validates: Requirements 1.6
   */
  test('Property 6: Health status real-time updates', async () => {
    fc.assert(fc.asyncProperty(
      fc.record({
        refreshInterval: fc.integer({ min: 1000, max: 60000 }),
        autoRefresh: fc.boolean(),
        retryOnError: fc.boolean(),
        maxRetries: fc.integer({ min: 1, max: 5 })
      }),
      fc.array(fc.record({
        health: fc.record({
          status: fc.constantFrom('healthy', 'degraded', 'unhealthy'),
          timestamp: fc.integer({ min: Date.now() - 86400000, max: Date.now() }),
          version: fc.string({ minLength: 1, maxLength: 20 }),
          environment: fc.constantFrom('development', 'staging', 'production'),
          checks: fc.record({
            database: fc.record({
              status: fc.constantFrom('healthy', 'degraded', 'unhealthy'),
              lastCheck: fc.integer({ min: Date.now() - 86400000, max: Date.now() })
            })
          })
        }),
        readiness: fc.record({
          status: fc.string(),
          timestamp: fc.integer({ min: Date.now() - 86400000, max: Date.now() })
        }),
        liveness: fc.record({
          status: fc.string(),
          timestamp: fc.integer({ min: Date.now() - 86400000, max: Date.now() })
        }),
        metrics: fc.record({
          uptime: fc.integer({ min: 0, max: 86400000 }),
          requestCount: fc.integer({ min: 0, max: 1000000 }),
          errorRate: fc.float({ min: 0, max: 1, noNaN: true }),
          averageResponseTime: fc.integer({ min: 1, max: 5000 }),
          activeConnections: fc.integer({ min: 0, max: 10000 })
        }),
        errors: fc.array(fc.record({
          endpoint: fc.string(),
          error: fc.string()
        }))
      }), { minLength: 1, maxLength: 3 }),
      async (config, healthUpdates) => {
        // Property: Health monitor should handle real-time updates correctly
        let callCount = 0
        
        // Mock API responses for each update
        vi.mocked(apiClient.getHealthWithDetails).mockImplementation(async () => {
          const update = healthUpdates[callCount % healthUpdates.length]
          callCount++
          return update
        })

        const { result } = renderHook(() => useHealthMonitor(config))

        // Property: Initial state should be correct
        expect(result.current.health).toBeNull()
        expect(result.current.loading).toBe(false)
        expect(result.current.error).toBeNull()

        // Trigger initial fetch
        await act(async () => {
          await result.current.refresh()
        })

        // Property: After refresh, should have health data
        expect(result.current.health).not.toBeNull()
        expect(result.current.health?.status).toBe(healthUpdates[0].health.status)
        expect(result.current.lastUpdate).toBeGreaterThan(0)

        // Property: If auto-refresh is enabled, should update automatically
        if (config.autoRefresh) {
          const initialCallCount = callCount
          
          // Fast-forward time to trigger interval
          await act(async () => {
            vi.advanceTimersByTime(config.refreshInterval)
            await vi.runAllTimersAsync()
          })

          // Property: Should have made additional API calls
          expect(callCount).toBeGreaterThan(initialCallCount)
        }

        // Property: Manual refresh should always work
        const beforeRefreshCallCount = callCount
        await act(async () => {
          await result.current.refresh()
        })
        expect(callCount).toBe(beforeRefreshCallCount + 1)

        return true
      }
    ), { numRuns: 3 })
  })

  /**
   * Property 7: 健康检查错误处�?
   * Feature: frontend-enhancements, Property 7: 健康检查错误处�?
   * Validates: Requirements 1.7
   */
  test('Property 7: Health check error handling', async () => {
    fc.assert(fc.asyncProperty(
      fc.record({
        retryOnError: fc.boolean(),
        maxRetries: fc.integer({ min: 1, max: 5 }),
        retryDelay: fc.integer({ min: 100, max: 5000 })
      }),
      fc.array(fc.oneof(
        fc.record({
          type: fc.constant('success'),
          data: fc.record({
            health: fc.record({
              status: fc.constantFrom('healthy', 'degraded', 'unhealthy'),
              timestamp: fc.integer(),
              version: fc.string(),
              environment: fc.string(),
              checks: fc.record({})
            }),
            readiness: fc.record({ status: fc.string(), timestamp: fc.integer() }),
            liveness: fc.record({ status: fc.string(), timestamp: fc.integer() }),
            metrics: fc.record({
              uptime: fc.integer({ min: 0 }),
              requestCount: fc.integer({ min: 0 }),
              errorRate: fc.float({ min: 0, max: 1, noNaN: true }),
              averageResponseTime: fc.integer({ min: 1 }),
              activeConnections: fc.integer({ min: 0 })
            }),
            errors: fc.array(fc.record({ endpoint: fc.string(), error: fc.string() }))
          })
        }),
        fc.record({
          type: fc.constant('error'),
          error: fc.string({ minLength: 1 })
        })
      ), { minLength: 1, maxLength: 10 }),
      async (config, responses) => {
        // Property: Error handling should be robust and follow retry logic
        let callCount = 0
        
        // Mock API responses with mix of success and errors
        vi.mocked(apiClient.getHealthWithDetails).mockImplementation(async () => {
          const response = responses[callCount % responses.length]
          callCount++
          
          if (response.type === 'error') {
            throw new Error(response.error)
          } else {
            return response.data
          }
        })

        const { result } = renderHook(() => useHealthMonitor(config))

        // Property: Initial state should be error-free
        expect(result.current.error).toBeNull()
        expect(result.current.retryCount).toBe(0)

        // Trigger refresh and handle potential errors
        await act(async () => {
          await result.current.refresh()
        })

        const firstResponse = responses[0]
        
        if (firstResponse.type === 'success') {
          // Property: Successful response should clear errors
          expect(result.current.error).toBeNull()
          expect(result.current.health).not.toBeNull()
          expect(result.current.isConnected).toBe(true)
          expect(result.current.retryCount).toBe(0)
        } else {
          // Property: Error response should set error state
          expect(result.current.error).not.toBeNull()
          expect(result.current.isConnected).toBe(false)
          
          // Property: Retry count should be incremented
          if (config.retryOnError) {
            expect(result.current.retryCount).toBeGreaterThan(0)
            expect(result.current.retryCount).toBeLessThanOrEqual(config.maxRetries)
          }
        }

        // Property: Reset should clear all error states
        await act(async () => {
          result.current.reset()
        })

        expect(result.current.error).toBeNull()
        expect(result.current.retryCount).toBe(0)
        expect(result.current.health).toBeNull()
        expect(result.current.lastUpdate).toBeNull()

        return true
      }
    ), { numRuns: 3 })
  })

  /**
   * Property: Polling behavior consistency
   * Feature: frontend-enhancements, Property: Polling behavior consistency
   * Validates: Requirements 1.6, 1.7
   */
  test('Property: Polling behavior consistency', async () => {
    fc.assert(fc.asyncProperty(
      fc.record({
        refreshInterval: fc.integer({ min: 1000, max: 10000 }),
        autoRefresh: fc.boolean()
      }),
      async (config) => {
        // Property: Polling should start/stop consistently
        const mockHealthData = {
          health: {
            status: 'healthy' as const,
            timestamp: Date.now(),
            version: '1.0.0',
            environment: 'test',
            checks: {
              database: { status: 'healthy' as const, lastCheck: Date.now() },
              kv: { status: 'healthy' as const, lastCheck: Date.now() },
              r2: { status: 'healthy' as const, lastCheck: Date.now() },
              durableObjects: { status: 'healthy' as const, lastCheck: Date.now() },
              secrets: { status: 'healthy' as const, lastCheck: Date.now() }
            }
          },
          readiness: { status: 'ready', timestamp: Date.now() },
          liveness: { status: 'alive', timestamp: Date.now() },
          metrics: {
            uptime: 3600,
            requestCount: 100,
            errorRate: 0.01,
            averageResponseTime: 200,
            activeConnections: 5
          },
          errors: []
        }

        vi.mocked(apiClient.getHealthWithDetails).mockResolvedValue(mockHealthData)

        const { result } = renderHook(() => useHealthMonitor(config))

        // Property: Auto-refresh behavior should match configuration
        if (config.autoRefresh) {
          // Should start polling automatically
          await act(async () => {
            vi.advanceTimersByTime(100) // Small delay to let effect run
          })
          
          // Property: Should have made initial call
          expect(vi.mocked(apiClient.getHealthWithDetails)).toHaveBeenCalled()
        }

        // Property: Manual start/stop should work regardless of auto-refresh
        const initialCallCount = vi.mocked(apiClient.getHealthWithDetails).mock.calls.length

        await act(async () => {
          result.current.startPolling()
        })

        // Property: Starting polling should trigger immediate fetch
        expect(vi.mocked(apiClient.getHealthWithDetails).mock.calls.length).toBeGreaterThan(initialCallCount)

        await act(async () => {
          result.current.stopPolling()
        })

        // Property: Stopping should prevent further calls
        const callCountAfterStop = vi.mocked(apiClient.getHealthWithDetails).mock.calls.length
        
        await act(async () => {
          vi.advanceTimersByTime(config.refreshInterval * 2)
        })

        // Property: No additional calls should be made after stopping
        expect(vi.mocked(apiClient.getHealthWithDetails).mock.calls.length).toBe(callCountAfterStop)

        return true
      }
    ), { numRuns: 3 })
  })
})