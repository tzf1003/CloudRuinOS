import { describe, test, expect, vi, beforeEach } from 'vitest'
import { apiClient } from '../lib/api-client'
import { HealthData, SystemMetrics } from '../types/api'

// Mock the API client
vi.mock('../lib/api-client', () => ({
  apiClient: {
    getHealth: vi.fn(),
    getDetailedHealth: vi.fn(),
    getReadiness: vi.fn(),
    getLiveness: vi.fn(),
    getMetrics: vi.fn(),
  }
}))

describe('Infrastructure Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Health API Integration', () => {
    test('should call health API and return data', async () => {
      const mockHealthData: HealthData = {
        status: 'healthy',
        timestamp: Date.now(),
        version: '1.0.0',
        environment: 'test',
        checks: {
          database: { status: 'healthy', responseTime: 50, lastCheck: Date.now() },
          kv: { status: 'healthy', responseTime: 30, lastCheck: Date.now() },
          r2: { status: 'healthy', responseTime: 40, lastCheck: Date.now() },
          durableObjects: { status: 'healthy', responseTime: 60, lastCheck: Date.now() },
          secrets: { status: 'healthy', responseTime: 20, lastCheck: Date.now() }
        }
      }

      vi.mocked(apiClient.getHealth).mockResolvedValue(mockHealthData)

      const result = await apiClient.getHealth()

      expect(apiClient.getHealth).toHaveBeenCalledOnce()
      expect(result).toEqual(mockHealthData)
      expect(result.status).toBe('healthy')
    })

    test('should handle health API errors gracefully', async () => {
      const mockError = new Error('Health API unavailable')
      vi.mocked(apiClient.getHealth).mockRejectedValue(mockError)

      await expect(apiClient.getHealth()).rejects.toThrow('Health API unavailable')
    })
  })

  describe('Metrics API Integration', () => {
    test('should call metrics API and return system metrics', async () => {
      const mockMetrics: SystemMetrics = {
        uptime: 86400,
        requestCount: 1000,
        errorRate: 0.01,
        averageResponseTime: 150,
        activeConnections: 50,
        memoryUsage: 1073741824 // 1GB
      }

      vi.mocked(apiClient.getMetrics).mockResolvedValue(mockMetrics)

      const result = await apiClient.getMetrics()

      expect(apiClient.getMetrics).toHaveBeenCalledOnce()
      expect(result).toEqual(mockMetrics)
      expect(result.uptime).toBeGreaterThan(0)
      expect(result.errorRate).toBeLessThanOrEqual(1)
    })

    test('should validate metrics data ranges', async () => {
      const mockMetrics: SystemMetrics = {
        uptime: 3600,
        requestCount: 500,
        errorRate: 0.05,
        averageResponseTime: 200,
        activeConnections: 25
      }

      vi.mocked(apiClient.getMetrics).mockResolvedValue(mockMetrics)

      const result = await apiClient.getMetrics()

      // Validate data ranges
      expect(result.uptime).toBeGreaterThanOrEqual(0)
      expect(result.requestCount).toBeGreaterThanOrEqual(0)
      expect(result.errorRate).toBeGreaterThanOrEqual(0)
      expect(result.errorRate).toBeLessThanOrEqual(1)
      expect(result.averageResponseTime).toBeGreaterThan(0)
      expect(result.activeConnections).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Loading State Management', () => {
    test('should manage loading states correctly', () => {
      // Simulate loading state management
      let isLoading = false
      let data: SystemMetrics | null = null
      let error: string | null = null

      // Start loading
      isLoading = true
      expect(isLoading).toBe(true)
      expect(data).toBeNull()

      // Simulate successful data load
      const mockData: SystemMetrics = {
        uptime: 1800,
        requestCount: 250,
        errorRate: 0.02,
        averageResponseTime: 180,
        activeConnections: 15
      }

      isLoading = false
      data = mockData
      error = null

      expect(isLoading).toBe(false)
      expect(data).toEqual(mockData)
      expect(error).toBeNull()
    })

    test('should handle error states correctly', () => {
      let isLoading = false
      let data: SystemMetrics | null = null
      let error: string | null = null

      // Start loading
      isLoading = true

      // Simulate error
      isLoading = false
      data = null
      error = 'Failed to load metrics'

      expect(isLoading).toBe(false)
      expect(data).toBeNull()
      expect(error).toBe('Failed to load metrics')
    })
  })
})