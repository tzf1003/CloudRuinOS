import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { HealthDashboard } from '../components/HealthDashboard';
import { MetricsChart } from '../components/MetricsChart';
import { HealthData, SystemMetrics, HealthStatus } from '../types/api';

// Mock recharts to avoid canvas issues in tests
vi.mock('recharts', () => ({
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  Area: () => <div data-testid="area" />,
  Bar: () => <div data-testid="bar" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  Brush: () => <div data-testid="brush" />
}));

// Generators for test data
const healthStatusGenerator = fc.record({
  status: fc.constantFrom('healthy', 'degraded', 'unhealthy'),
  responseTime: fc.option(fc.integer({ min: 1, max: 5000 })),
  error: fc.option(fc.string()),
  lastCheck: fc.integer({ min: Date.now() - 86400000, max: Date.now() })
});

const healthDataGenerator = fc.record({
  status: fc.constantFrom('healthy', 'degraded', 'unhealthy'),
  timestamp: fc.integer({ min: Date.now() - 86400000, max: Date.now() }),
  version: fc.string({ minLength: 1, maxLength: 20 }),
  environment: fc.constantFrom('development', 'staging', 'production'),
  checks: fc.record({
    database: healthStatusGenerator,
    kv: healthStatusGenerator,
    r2: healthStatusGenerator,
    durableObjects: healthStatusGenerator,
    secrets: healthStatusGenerator
  })
});

const systemMetricsGenerator = fc.record({
  uptime: fc.integer({ min: 0, max: 86400 * 365 }),
  requestCount: fc.integer({ min: 0, max: 1000000 }),
  errorRate: fc.float({ min: 0, max: 1 }),
  averageResponseTime: fc.float({ min: 1, max: 5000 }),
  activeConnections: fc.integer({ min: 0, max: 10000 }),
  memoryUsage: fc.option(fc.integer({ min: 1024 * 1024, max: 1024 * 1024 * 1024 * 8 }))
});

const metricsArrayGenerator = fc.array(systemMetricsGenerator, { minLength: 1, maxLength: 100 });

describe('Health Monitoring Components Property Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('Property 55: 指标数据可视�?, () => {
    test('Feature: frontend-enhancements, Property 55: 对于任何系统指标显示，应该使用图表组件正确可视化 Prometheus 指标数据', () => {
      fc.assert(fc.property(
        metricsArrayGenerator,
        fc.constantFrom('1h', '6h', '24h', '7d'),
        fc.constantFrom('line', 'area', 'bar'),
        (metrics, timeRange, chartType) => {
          const { container, unmount } = render(
            <MetricsChart
              metrics={metrics}
              timeRange={timeRange}
              chartType={chartType}
              showLegend={true}
            />
          );

          try {
            // 验证图表容器存在
            const chartContainer = screen.getByTestId('responsive-container');
            expect(chartContainer).toBeInTheDocument();

            // 验证根据图表类型渲染正确的图表组�?
            switch (chartType) {
              case 'line':
                expect(screen.getByTestId('line-chart')).toBeInTheDocument();
                break;
              case 'area':
                expect(screen.getByTestId('area-chart')).toBeInTheDocument();
                break;
              case 'bar':
                expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
                break;
            }

            // 验证图表基本元素存在
            expect(screen.getByTestId('x-axis')).toBeInTheDocument();
            expect(screen.getByTestId('y-axis')).toBeInTheDocument();
            expect(screen.getByTestId('grid')).toBeInTheDocument();

            // 验证时间范围选择器显示正确的�?
            const timeRangeText = timeRange === '1h' ? '1小时' : 
                                 timeRange === '6h' ? '6小时' : 
                                 timeRange === '24h' ? '24小时' : '7�?;
            expect(container.textContent).toContain(timeRangeText);

            return true;
          } finally {
            unmount();
          }
        }
      ), { numRuns: 3 });
    });

    test('MetricsChart handles empty data gracefully', () => {
      fc.assert(fc.property(
        fc.constantFrom('1h', '6h', '24h', '7d'),
        fc.constantFrom('line', 'area', 'bar'),
        (timeRange, chartType) => {
          const { unmount } = render(
            <MetricsChart
              metrics={[]}
              timeRange={timeRange}
              chartType={chartType}
            />
          );

          try {
            // 验证空状态显�?
            expect(screen.getByText('暂无指标数据')).toBeInTheDocument();
            expect(screen.getByText('等待系统收集性能指标数据...')).toBeInTheDocument();

            return true;
          } finally {
            unmount();
          }
        }
      ), { numRuns: 3 });
    });
  });

  describe('Property 59: 图表实时更新', () => {
    test('Feature: frontend-enhancements, Property 59: 对于任何数据更新，Dashboard 应该实时更新图表数据和视觉效�?, () => {
      fc.assert(fc.property(
        metricsArrayGenerator,
        metricsArrayGenerator,
        fc.constantFrom('line', 'area', 'bar'),
        (initialMetrics, updatedMetrics, chartType) => {
          const { rerender, unmount } = render(
            <MetricsChart
              metrics={initialMetrics}
              timeRange="1h"
              chartType={chartType}
            />
          );

          try {
            // 验证初始渲染
            expect(screen.getByTestId('responsive-container')).toBeInTheDocument();

            // 更新数据
            rerender(
              <MetricsChart
                metrics={updatedMetrics}
                timeRange="1h"
                chartType={chartType}
              />
            );

            // 验证图表仍然正确渲染（实时更新）
            expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
            
            // 验证数据点数量更�?
            const dataPointsText = screen.getByText(/数据�?/);
            expect(dataPointsText.textContent).toContain(updatedMetrics.length.toString());

            return true;
          } finally {
            unmount();
          }
        }
      ), { numRuns: 3 });
    });

    test('HealthDashboard updates when health data changes', () => {
      fc.assert(fc.property(
        healthDataGenerator,
        systemMetricsGenerator,
        healthDataGenerator,
        systemMetricsGenerator,
        (initialHealth, initialMetrics, updatedHealth, updatedMetrics) => {
          const { rerender, unmount } = render(
            <HealthDashboard
              health={initialHealth}
              metrics={initialMetrics}
              showMetrics={true}
            />
          );

          try {
            // 验证初始状�?
            expect(screen.getByText('系统健康监控')).toBeInTheDocument();

            // 更新数据
            rerender(
              <HealthDashboard
                health={updatedHealth}
                metrics={updatedMetrics}
                showMetrics={true}
              />
            );

            // 验证更新后的状态显�?
            const statusText = updatedHealth.status === 'healthy' ? '系统正常' :
                             updatedHealth.status === 'degraded' ? '系统降级' : '系统异常';
            expect(screen.getByText(statusText)).toBeInTheDocument();

            return true;
          } finally {
            unmount();
          }
        }
      ), { numRuns: 3 });
    });
  });

  describe('Property 60: 图表交互功能', () => {
    test('Feature: frontend-enhancements, Property 60: 对于任何图表用户交互，应该支持图表缩放、筛选和详情查看', () => {
      fc.assert(fc.property(
        metricsArrayGenerator.filter(metrics => metrics.length > 5), // 确保有足够数据进行交�?
        fc.constantFrom('line', 'area', 'bar'),
        (metrics, chartType) => {
          const mockOnTimeRangeChange = vi.fn();
          const mockOnChartTypeChange = vi.fn();

          const { unmount } = render(
            <MetricsChart
              metrics={metrics}
              timeRange="1h"
              chartType={chartType}
              onTimeRangeChange={mockOnTimeRangeChange}
              onChartTypeChange={mockOnChartTypeChange}
            />
          );

          try {
            // 验证交互控件存在
            const timeRangeSelector = screen.getByDisplayValue('1小时');
            expect(timeRangeSelector).toBeInTheDocument();

            // 测试时间范围变更
            fireEvent.change(timeRangeSelector, { target: { value: '6h' } });
            expect(mockOnTimeRangeChange).toHaveBeenCalledWith('6h');

            // 验证图表类型切换按钮存在
            const chartTypeButtons = screen.getAllByRole('button').filter(btn => 
              btn.textContent?.includes('折线�?) || 
              btn.textContent?.includes('面积�?) || 
              btn.textContent?.includes('柱状�?)
            );
            expect(chartTypeButtons.length).toBeGreaterThan(0);

            // 测试图表类型切换
            if (chartTypeButtons.length > 0) {
              fireEvent.click(chartTypeButtons[0]);
              expect(mockOnChartTypeChange).toHaveBeenCalled();
            }

            // 验证指标选择器存�?
            const metricButtons = screen.getAllByRole('button').filter(btn =>
              btn.textContent?.includes('响应时间') ||
              btn.textContent?.includes('错误�?) ||
              btn.textContent?.includes('活跃连接') ||
              btn.textContent?.includes('请求�?)
            );
            expect(metricButtons.length).toBeGreaterThan(0);

            // 验证重置缩放按钮存在
            expect(screen.getByText('重置缩放')).toBeInTheDocument();

            return true;
          } finally {
            unmount();
          }
        }
      ), { numRuns: 3 });
    });

    test('Chart supports fullscreen toggle', () => {
      fc.assert(fc.property(
        metricsArrayGenerator,
        (metrics) => {
          const { unmount } = render(
            <MetricsChart
              metrics={metrics}
              timeRange="1h"
              chartType="line"
            />
          );

          try {
            // 查找全屏按钮
            const fullscreenButton = screen.getByTitle('全屏显示');
            expect(fullscreenButton).toBeInTheDocument();

            // 点击全屏按钮
            fireEvent.click(fullscreenButton);

            // 验证按钮文本变为退出全�?
            expect(screen.getByTitle('退出全�?)).toBeInTheDocument();

            return true;
          } finally {
            unmount();
          }
        }
      ), { numRuns: 3 });
    });

    test('HealthDashboard supports refresh functionality', () => {
      fc.assert(fc.property(
        healthDataGenerator,
        systemMetricsGenerator,
        (health, metrics) => {
          const mockOnRefresh = vi.fn();

          const { unmount } = render(
            <HealthDashboard
              health={health}
              metrics={metrics}
              onRefresh={mockOnRefresh}
            />
          );

          try {
            // 查找刷新按钮
            const refreshButton = screen.getByText('刷新');
            expect(refreshButton).toBeInTheDocument();

            // 点击刷新按钮
            fireEvent.click(refreshButton);
            expect(mockOnRefresh).toHaveBeenCalled();

            return true;
          } finally {
            unmount();
          }
        }
      ), { numRuns: 3 });
    });

    test('HealthDashboard compact mode works correctly', () => {
      fc.assert(fc.property(
        healthDataGenerator,
        systemMetricsGenerator,
        (health, metrics) => {
          const { rerender, unmount } = render(
            <HealthDashboard
              health={health}
              metrics={metrics}
              compactMode={false}
            />
          );

          try {
            // 验证完整模式显示详细信息
            expect(screen.getByText('系统健康监控')).toBeInTheDocument();
            expect(screen.getByText('系统组件状�?)).toBeInTheDocument();

            // 切换到紧凑模�?
            rerender(
              <HealthDashboard
                health={health}
                metrics={metrics}
                compactMode={true}
              />
            );

            // 验证紧凑模式显示简化信�?
            const statusText = health.status === 'healthy' ? '系统正常' :
                             health.status === 'degraded' ? '系统降级' : '系统异常';
            expect(screen.getByText(statusText)).toBeInTheDocument();

            return true;
          } finally {
            unmount();
          }
        }
      ), { numRuns: 3 });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('HealthDashboard handles null health data gracefully', () => {
      const { unmount } = render(
        <HealthDashboard
          health={null}
          metrics={null}
        />
      );

      try {
        expect(screen.getByText('暂无健康数据')).toBeInTheDocument();
        expect(screen.getByText('点击刷新按钮获取最新的系统健康状�?)).toBeInTheDocument();
      } finally {
        unmount();
      }
    });

    test('HealthDashboard shows loading state correctly', () => {
      fc.assert(fc.property(
        fc.boolean(),
        (loading) => {
          const { unmount } = render(
            <HealthDashboard
              health={null}
              metrics={null}
              loading={loading}
            />
          );

          try {
            if (loading) {
              expect(screen.getAllByText('正在加载健康状�?..').length).toBeGreaterThan(0);
            } else {
              expect(screen.getByText('暂无健康数据')).toBeInTheDocument();
            }

            return true;
          } finally {
            unmount();
          }
        }
      ), { numRuns: 3 });
    });

    test('HealthDashboard displays error messages correctly', () => {
      fc.assert(fc.property(
        fc.string({ minLength: 2, maxLength: 50 }).filter(s => s.trim().length > 1 && !s.includes('\n')),
        (errorMessage) => {
          const trimmedMessage = errorMessage.trim();
          const { unmount } = render(
            <HealthDashboard
              health={null}
              metrics={null}
              error={trimmedMessage}
            />
          );

          try {
            expect(screen.getAllByText('健康检查失�?).length).toBeGreaterThan(0);
            // Check if the error message appears in the document content
            const errorElements = screen.getAllByText((content, element) => {
              return element?.textContent?.includes(trimmedMessage) || false;
            });
            expect(errorElements.length).toBeGreaterThan(0);

            return true;
          } finally {
            unmount();
          }
        }
      ), { numRuns: 3 });
    });

    test('MetricsChart handles invalid metric values gracefully', () => {
      fc.assert(fc.property(
        fc.array(fc.record({
          uptime: fc.oneof(fc.integer(), fc.constant(NaN), fc.constant(Infinity)),
          requestCount: fc.oneof(fc.integer(), fc.constant(NaN)),
          errorRate: fc.oneof(fc.float(), fc.constant(NaN)),
          averageResponseTime: fc.oneof(fc.float(), fc.constant(NaN)),
          activeConnections: fc.oneof(fc.integer(), fc.constant(NaN))
        }), { minLength: 1, maxLength: 10 }),
        (metrics) => {
          const { container, unmount } = render(
            <MetricsChart
              metrics={metrics}
              timeRange="1h"
              chartType="line"
            />
          );

          try {
            // 验证组件不会崩溃，即使有无效数据
            expect(container).toBeInTheDocument();
            expect(screen.getAllByTestId('responsive-container').length).toBeGreaterThan(0);

            return true;
          } finally {
            unmount();
          }
        }
      ), { numRuns: 3 });
    });
  });
});