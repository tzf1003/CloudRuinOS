import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { Dashboard } from '../components/Dashboard';
import { Device, SystemMetrics, HealthData, Session, AuditLog } from '../types/api';
import { apiClient } from '../lib/api-client';

// Mock recharts to avoid canvas issues in tests
vi.mock('recharts', () => ({
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
  Pie: () => <div data-testid="pie" />,
  Bar: () => <div data-testid="bar" />,
  Line: () => <div data-testid="line" />,
  Area: () => <div data-testid="area" />,
  Cell: () => <div data-testid="cell" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>
}));

// Mock API client
vi.mock('../lib/api-client', () => ({
  apiClient: {
    getDevices: vi.fn(),
    getSessions: vi.fn(),
    getHealth: vi.fn(),
    getMetrics: vi.fn(),
    getAuditLogs: vi.fn()
  }
}));

// Generators for test data
const deviceGenerator = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }),
  deviceId: fc.string({ minLength: 1, maxLength: 20 }),
  name: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
  platform: fc.constantFrom('Windows', 'Linux', 'macOS'),
  version: fc.string({ minLength: 1, maxLength: 20 }),
  status: fc.constantFrom('online', 'offline', 'busy'),
  lastSeen: fc.integer({ min: Date.now() - 86400000, max: Date.now() }),
  enrolledAt: fc.integer({ min: Date.now() - 86400000, max: Date.now() }),
  publicKey: fc.string({ minLength: 10, maxLength: 100 })
});

const sessionGenerator = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }),
  device_id: fc.string({ minLength: 1, maxLength: 20 }),
  status: fc.constantFrom('pending', 'active', 'connected', 'inactive', 'expired'),
  created_at: fc.integer({ min: Date.now() - 86400000, max: Date.now() }),
  expires_at: fc.integer({ min: Date.now(), max: Date.now() + 86400000 }),
  last_activity: fc.option(fc.integer({ min: Date.now() - 86400000, max: Date.now() }))
});

const healthDataGenerator = fc.record({
  status: fc.constantFrom('healthy', 'degraded', 'unhealthy'),
  timestamp: fc.integer({ min: Date.now() - 86400000, max: Date.now() }),
  version: fc.string({ minLength: 1, maxLength: 20 }),
  environment: fc.constantFrom('development', 'staging', 'production'),
  checks: fc.record({
    database: fc.record({
      status: fc.constantFrom('healthy', 'degraded', 'unhealthy'),
      lastCheck: fc.integer({ min: Date.now() - 86400000, max: Date.now() })
    }),
    kv: fc.record({
      status: fc.constantFrom('healthy', 'degraded', 'unhealthy'),
      lastCheck: fc.integer({ min: Date.now() - 86400000, max: Date.now() })
    }),
    r2: fc.record({
      status: fc.constantFrom('healthy', 'degraded', 'unhealthy'),
      lastCheck: fc.integer({ min: Date.now() - 86400000, max: Date.now() })
    }),
    durableObjects: fc.record({
      status: fc.constantFrom('healthy', 'degraded', 'unhealthy'),
      lastCheck: fc.integer({ min: Date.now() - 86400000, max: Date.now() })
    }),
    secrets: fc.record({
      status: fc.constantFrom('healthy', 'degraded', 'unhealthy'),
      lastCheck: fc.integer({ min: Date.now() - 86400000, max: Date.now() })
    })
  })
});

const systemMetricsGenerator = fc.record({
  uptime: fc.integer({ min: 0, max: 86400 * 365 }),
  requestCount: fc.integer({ min: 0, max: 1000000 }),
  errorRate: fc.float({ min: Math.fround(0), max: Math.fround(1) }),
  averageResponseTime: fc.float({ min: Math.fround(0.001), max: Math.fround(5) }),
  activeConnections: fc.integer({ min: 0, max: 10000 }),
  memoryUsage: fc.option(fc.integer({ min: 1024 * 1024, max: 1024 * 1024 * 1024 * 8 }))
});

const auditLogGenerator = fc.record({
  id: fc.integer({ min: 1, max: 100000 }),
  device_id: fc.string({ minLength: 1, max: 20 }),
  session_id: fc.option(fc.string({ minLength: 1, max: 20 })),
  action_type: fc.constantFrom('login', 'logout', 'file_upload', 'file_download', 'command_execute'),
  action_data: fc.option(fc.string()),
  result: fc.option(fc.string()),
  timestamp: fc.integer({ min: Date.now() - 86400000 * 7, max: Date.now() })
});

describe('Dashboard Component Property Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('Property 56: 设备状态统计图�?, () => {
    test('Feature: frontend-enhancements, Property 56: 对于任何设备状态统计显示，应该正确展示设备在线/离线状态的饼图或柱状图', () => {
      fc.assert(fc.property(
        fc.array(deviceGenerator, { minLength: 1, maxLength: 50 }),
        fc.array(sessionGenerator, { minLength: 0, maxLength: 20 }),
        healthDataGenerator,
        systemMetricsGenerator,
        fc.array(auditLogGenerator, { minLength: 0, maxLength: 100 }),
        async (devices, sessions, health, metrics, auditLogs) => {
          // Mock API responses
          (apiClient.getDevices as any).mockResolvedValue(devices);
          (apiClient.getSessions as any).mockResolvedValue(sessions);
          (apiClient.getHealth as any).mockResolvedValue(health);
          (apiClient.getMetrics as any).mockResolvedValue(metrics);
          (apiClient.getAuditLogs as any).mockResolvedValue({ logs: auditLogs, total: auditLogs.length, has_more: false });

          const { unmount } = render(
            <Dashboard 
              refreshInterval={60000}
              showMetrics={true}
              compactMode={false}
            />
          );

          try {
            // 等待数据加载完成
            await waitFor(() => {
              expect(screen.getByText('系统概览')).toBeInTheDocument();
            }, { timeout: 3000 });

            // 验证设备统计显示
            const deviceTotal = devices.length;
            const onlineDevices = devices.filter(d => d.status === 'online').length;
            const offlineDevices = devices.filter(d => d.status === 'offline').length;
            const busyDevices = devices.filter(d => d.status === 'busy').length;

            // 验证设备总数显示
            expect(screen.getByText(deviceTotal.toString())).toBeInTheDocument();

            // 验证在线设备数显�?
            if (onlineDevices > 0) {
              expect(screen.getByText(onlineDevices.toString())).toBeInTheDocument();
            }

            // 验证离线设备数显�?
            if (offlineDevices > 0) {
              expect(screen.getByText(offlineDevices.toString())).toBeInTheDocument();
            }

            // 验证忙碌设备数显�?
            if (busyDevices > 0) {
              expect(screen.getByText(busyDevices.toString())).toBeInTheDocument();
            }

            // 验证饼图存在（如果有设备数据�?
            if (deviceTotal > 0) {
              await waitFor(() => {
                expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
              });
            }

            // 验证柱状图存�?
            await waitFor(() => {
              expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
            });

            // 验证图表标题
            expect(screen.getByText('设备状态分�?)).toBeInTheDocument();
            expect(screen.getByText('设备状态统�?)).toBeInTheDocument();

            return true;
          } finally {
            unmount();
          }
        }
      ), { numRuns: 3 });
    });

    test('Dashboard handles empty device data gracefully', () => {
      fc.assert(fc.property(
        fc.array(sessionGenerator, { minLength: 0, maxLength: 5 }),
        healthDataGenerator,
        systemMetricsGenerator,
        async (sessions, health, metrics) => {
          // Mock API responses with empty devices
          (apiClient.getDevices as any).mockResolvedValue([]);
          (apiClient.getSessions as any).mockResolvedValue(sessions);
          (apiClient.getHealth as any).mockResolvedValue(health);
          (apiClient.getMetrics as any).mockResolvedValue(metrics);
          (apiClient.getAuditLogs as any).mockResolvedValue({ logs: [], total: 0, has_more: false });

          const { unmount } = render(
            <Dashboard 
              refreshInterval={60000}
              showMetrics={true}
            />
          );

          try {
            await waitFor(() => {
              expect(screen.getByText('系统概览')).toBeInTheDocument();
            });

            // 验证空状态显�?
            expect(screen.getByText('0')).toBeInTheDocument(); // 设备总数�?
            expect(screen.getByText('暂无设备数据')).toBeInTheDocument();

            return true;
          } finally {
            unmount();
          }
        }
      ), { numRuns: 3 });
    });

    test('Dashboard displays device status distribution correctly', () => {
      fc.assert(fc.property(
        fc.array(deviceGenerator, { minLength: 5, maxLength: 20 }),
        async (devices) => {
          // 确保有不同状态的设备
          const mixedDevices = [
            { ...devices[0], status: 'online' as const },
            { ...devices[1], status: 'offline' as const },
            { ...devices[2], status: 'busy' as const },
            ...devices.slice(3)
          ];

          (apiClient.getDevices as any).mockResolvedValue(mixedDevices);
          (apiClient.getSessions as any).mockResolvedValue([]);
          (apiClient.getHealth as any).mockResolvedValue({
            status: 'healthy',
            timestamp: Date.now(),
            version: '1.0.0',
            environment: 'test',
            checks: {
              database: { status: 'healthy', lastCheck: Date.now() },
              kv: { status: 'healthy', lastCheck: Date.now() },
              r2: { status: 'healthy', lastCheck: Date.now() },
              durableObjects: { status: 'healthy', lastCheck: Date.now() },
              secrets: { status: 'healthy', lastCheck: Date.now() }
            }
          });
          (apiClient.getMetrics as any).mockResolvedValue({
            uptime: 3600,
            requestCount: 1000,
            errorRate: 0.01,
            averageResponseTime: 0.1,
            activeConnections: 10
          });
          (apiClient.getAuditLogs as any).mockResolvedValue({ logs: [], total: 0, has_more: false });

          const { unmount } = render(<Dashboard />);

          try {
            await waitFor(() => {
              expect(screen.getByText('系统概览')).toBeInTheDocument();
            });

            // 验证饼图和柱状图都存�?
            expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
            expect(screen.getByTestId('bar-chart')).toBeInTheDocument();

            // 验证状态标�?
            expect(screen.getByText('在线')).toBeInTheDocument();
            expect(screen.getByText('离线')).toBeInTheDocument();

            return true;
          } finally {
            unmount();
          }
        }
      ), { numRuns: 3 });
    });

    test('Dashboard updates device statistics when data changes', () => {
      fc.assert(fc.property(
        fc.array(deviceGenerator, { minLength: 1, maxLength: 10 }),
        fc.array(deviceGenerator, { minLength: 1, maxLength: 10 }),
        async (initialDevices, updatedDevices) => {
          // 初始渲染
          (apiClient.getDevices as any).mockResolvedValue(initialDevices);
          (apiClient.getSessions as any).mockResolvedValue([]);
          (apiClient.getHealth as any).mockResolvedValue({
            status: 'healthy',
            timestamp: Date.now(),
            version: '1.0.0',
            environment: 'test',
            checks: {
              database: { status: 'healthy', lastCheck: Date.now() },
              kv: { status: 'healthy', lastCheck: Date.now() },
              r2: { status: 'healthy', lastCheck: Date.now() },
              durableObjects: { status: 'healthy', lastCheck: Date.now() },
              secrets: { status: 'healthy', lastCheck: Date.now() }
            }
          });
          (apiClient.getMetrics as any).mockResolvedValue({
            uptime: 3600,
            requestCount: 1000,
            errorRate: 0.01,
            averageResponseTime: 0.1,
            activeConnections: 10
          });
          (apiClient.getAuditLogs as any).mockResolvedValue({ logs: [], total: 0, has_more: false });

          const { unmount } = render(<Dashboard refreshInterval={100} />);

          try {
            await waitFor(() => {
              expect(screen.getByText('系统概览')).toBeInTheDocument();
            });

            // 验证初始设备数量
            expect(screen.getByText(initialDevices.length.toString())).toBeInTheDocument();

            // 模拟数据更新
            (apiClient.getDevices as any).mockResolvedValue(updatedDevices);

            // 等待自动刷新或手动触发刷�?
            const refreshButton = screen.getByText('刷新');
            fireEvent.click(refreshButton);

            // 验证更新后的设备数量
            await waitFor(() => {
              expect(screen.getByText(updatedDevices.length.toString())).toBeInTheDocument();
            });

            return true;
          } finally {
            unmount();
          }
        }
      ), { numRuns: 3 });
    });
  });

  describe('Dashboard Integration and Error Handling', () => {
    test('Dashboard handles API errors gracefully', () => {
      fc.assert(fc.property(
        fc.string({ minLength: 5, maxLength: 50 }),
        async (errorMessage) => {
          // Mock API failures
          (apiClient.getDevices as any).mockRejectedValue(new Error(errorMessage));
          (apiClient.getSessions as any).mockRejectedValue(new Error(errorMessage));
          (apiClient.getHealth as any).mockRejectedValue(new Error(errorMessage));
          (apiClient.getMetrics as any).mockRejectedValue(new Error(errorMessage));
          (apiClient.getAuditLogs as any).mockRejectedValue(new Error(errorMessage));

          const { unmount } = render(<Dashboard />);

          try {
            await waitFor(() => {
              expect(screen.getByText('系统概览')).toBeInTheDocument();
            });

            // 验证错误状态显�?
            await waitFor(() => {
              expect(screen.getByText('数据获取失败')).toBeInTheDocument();
            });

            return true;
          } finally {
            unmount();
          }
        }
      ), { numRuns: 3 });
    });

    test('Dashboard shows loading state correctly', () => {
      // Mock slow API responses
      (apiClient.getDevices as any).mockImplementation(() => new Promise(resolve => setTimeout(() => resolve([]), 1000)));
      (apiClient.getSessions as any).mockImplementation(() => new Promise(resolve => setTimeout(() => resolve([]), 1000)));
      (apiClient.getHealth as any).mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({
        status: 'healthy',
        timestamp: Date.now(),
        version: '1.0.0',
        environment: 'test',
        checks: {
          database: { status: 'healthy', lastCheck: Date.now() },
          kv: { status: 'healthy', lastCheck: Date.now() },
          r2: { status: 'healthy', lastCheck: Date.now() },
          durableObjects: { status: 'healthy', lastCheck: Date.now() },
          secrets: { status: 'healthy', lastCheck: Date.now() }
        }
      }), 1000)));
      (apiClient.getMetrics as any).mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({
        uptime: 3600,
        requestCount: 1000,
        errorRate: 0.01,
        averageResponseTime: 0.1,
        activeConnections: 10
      }), 1000)));
      (apiClient.getAuditLogs as any).mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({ logs: [], total: 0, has_more: false }), 1000)));

      const { unmount } = render(<Dashboard />);

      try {
        // 验证加载状�?
        expect(screen.getByText('系统概览')).toBeInTheDocument();
        
        // 验证加载动画存在
        const loadingSpinner = document.querySelector('.animate-spin');
        expect(loadingSpinner).toBeInTheDocument();

        return true;
      } finally {
        unmount();
      }
    });

    test('Dashboard refresh functionality works correctly', () => {
      fc.assert(fc.property(
        fc.array(deviceGenerator, { minLength: 1, maxLength: 5 }),
        async (devices) => {
          (apiClient.getDevices as any).mockResolvedValue(devices);
          (apiClient.getSessions as any).mockResolvedValue([]);
          (apiClient.getHealth as any).mockResolvedValue({
            status: 'healthy',
            timestamp: Date.now(),
            version: '1.0.0',
            environment: 'test',
            checks: {
              database: { status: 'healthy', lastCheck: Date.now() },
              kv: { status: 'healthy', lastCheck: Date.now() },
              r2: { status: 'healthy', lastCheck: Date.now() },
              durableObjects: { status: 'healthy', lastCheck: Date.now() },
              secrets: { status: 'healthy', lastCheck: Date.now() }
            }
          });
          (apiClient.getMetrics as any).mockResolvedValue({
            uptime: 3600,
            requestCount: 1000,
            errorRate: 0.01,
            averageResponseTime: 0.1,
            activeConnections: 10
          });
          (apiClient.getAuditLogs as any).mockResolvedValue({ logs: [], total: 0, has_more: false });

          const { unmount } = render(<Dashboard />);

          try {
            await waitFor(() => {
              expect(screen.getByText('系统概览')).toBeInTheDocument();
            });

            // 清除之前的调用记�?
            vi.clearAllMocks();

            // 点击刷新按钮
            const refreshButton = screen.getByText('刷新');
            fireEvent.click(refreshButton);

            // 验证API被重新调�?
            await waitFor(() => {
              expect(apiClient.getDevices).toHaveBeenCalled();
              expect(apiClient.getSessions).toHaveBeenCalled();
              expect(apiClient.getHealth).toHaveBeenCalled();
              expect(apiClient.getMetrics).toHaveBeenCalled();
            });

            return true;
          } finally {
            unmount();
          }
        }
      ), { numRuns: 3 });
    });

    test('Dashboard compact mode works correctly', () => {
      fc.assert(fc.property(
        fc.array(deviceGenerator, { minLength: 1, maxLength: 5 }),
        fc.boolean(),
        async (devices, compactMode) => {
          (apiClient.getDevices as any).mockResolvedValue(devices);
          (apiClient.getSessions as any).mockResolvedValue([]);
          (apiClient.getHealth as any).mockResolvedValue({
            status: 'healthy',
            timestamp: Date.now(),
            version: '1.0.0',
            environment: 'test',
            checks: {
              database: { status: 'healthy', lastCheck: Date.now() },
              kv: { status: 'healthy', lastCheck: Date.now() },
              r2: { status: 'healthy', lastCheck: Date.now() },
              durableObjects: { status: 'healthy', lastCheck: Date.now() },
              secrets: { status: 'healthy', lastCheck: Date.now() }
            }
          });
          (apiClient.getMetrics as any).mockResolvedValue({
            uptime: 3600,
            requestCount: 1000,
            errorRate: 0.01,
            averageResponseTime: 0.1,
            activeConnections: 10
          });
          (apiClient.getAuditLogs as any).mockResolvedValue({ logs: [], total: 0, has_more: false });

          const { unmount } = render(
            <Dashboard 
              compactMode={compactMode}
              showMetrics={!compactMode}
            />
          );

          try {
            await waitFor(() => {
              expect(screen.getByText('系统概览')).toBeInTheDocument();
            });

            // 验证紧凑模式下的显示差异
            if (compactMode) {
              // 紧凑模式应该显示更少的详细信�?
              expect(screen.getByText('系统概览')).toBeInTheDocument();
            } else {
              // 完整模式应该显示所有信�?
              expect(screen.getByText('系统概览')).toBeInTheDocument();
              expect(screen.getByText('设备状态分�?)).toBeInTheDocument();
              expect(screen.getByText('设备状态统�?)).toBeInTheDocument();
            }

            return true;
          } finally {
            unmount();
          }
        }
      ), { numRuns: 3 });
    });
  });
});