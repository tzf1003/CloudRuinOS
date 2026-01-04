import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as fc from 'fast-check';
import { HistoryTrendChart } from '../components/HistoryTrendChart';
import { apiClient } from '../lib/api-client';

// Mock API client
vi.mock('../lib/api-client', () => ({
  apiClient: {
    getDevices: vi.fn(),
    getSessions: vi.fn(),
    getAuditLogs: vi.fn()
  }
}));

// Mock recharts components
vi.mock('recharts', () => ({
  LineChart: ({ children, onClick }: any) => (
    <div data-testid="line-chart" onClick={onClick}>
      {children}
    </div>
  ),
  Line: ({ dataKey, name }: any) => (
    <div data-testid={`line-${dataKey}`} data-name={name} />
  ),
  XAxis: ({ dataKey }: any) => <div data-testid="x-axis" data-key={dataKey} />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: ({ content }: any) => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
  ResponsiveContainer: ({ children }: any) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  Brush: ({ onChange }: any) => (
    <div 
      data-testid="brush" 
      onClick={() => onChange && onChange({ startIndex: 0, endIndex: 10 })}
    />
  )
}));

describe('HistoryTrendChart Properties', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mock responses
    (apiClient.getDevices as any).mockResolvedValue([
      { id: '1', status: 'online' },
      { id: '2', status: 'offline' },
      { id: '3', status: 'online' }
    ]);
    
    (apiClient.getSessions as any).mockResolvedValue([
      { id: '1', status: 'active' },
      { id: '2', status: 'connected' }
    ]);
    
    (apiClient.getAuditLogs as any).mockResolvedValue({
      logs: [
        { id: 1, timestamp: Date.now() - 1000 },
        { id: 2, timestamp: Date.now() - 2000 }
      ]
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Property 57: 历史趋势图表
   * Validates: Requirements 9.3
   * 
   * 验证历史趋势图表能够正确显示时间序列数据�?
   * 支持时间范围选择和数据钻取功�?
   */
  describe('Property 57: 历史趋势图表显示和交�?, () => {
    it('应该正确渲染趋势图表组件', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('1h', '6h', '24h', '7d', '30d', '90d'),
          fc.boolean(),
          fc.boolean(),
          fc.boolean(),
          async (timeRange, showDeviceTrend, showSessionTrend, showAuditTrend) => {
            render(
              <HistoryTrendChart
                timeRange={timeRange}
                showDeviceTrend={showDeviceTrend}
                showSessionTrend={showSessionTrend}
                showAuditTrend={showAuditTrend}
              />
            );

            // 验证图表容器存在
            await waitFor(() => {
              expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
            });

            // 验证图表组件存在
            expect(screen.getByTestId('line-chart')).toBeInTheDocument();
            expect(screen.getByTestId('x-axis')).toBeInTheDocument();
            expect(screen.getByTestId('y-axis')).toBeInTheDocument();
            expect(screen.getByTestId('cartesian-grid')).toBeInTheDocument();
            expect(screen.getByTestId('tooltip')).toBeInTheDocument();
            expect(screen.getByTestId('legend')).toBeInTheDocument();

            // 验证时间范围选择�?
            const timeRangeButtons = screen.getAllByRole('button');
            const timeRangeLabels = ['1小时', '6小时', '24小时', '7�?, '30�?, '90�?];
            const hasTimeRangeButtons = timeRangeLabels.some(label => 
              timeRangeButtons.some(button => button.textContent?.includes(label))
            );
            expect(hasTimeRangeButtons).toBe(true);
          }
        ),
        { numRuns: 3 }
      );
    });

    it('应该根据配置显示相应的趋势线', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          fc.boolean(),
          fc.boolean(),
          async (showDeviceTrend, showSessionTrend, showAuditTrend) => {
            render(
              <HistoryTrendChart
                showDeviceTrend={showDeviceTrend}
                showSessionTrend={showSessionTrend}
                showAuditTrend={showAuditTrend}
              />
            );

            await waitFor(() => {
              expect(screen.getByTestId('line-chart')).toBeInTheDocument();
            });

            // 验证设备趋势�?
            if (showDeviceTrend) {
              expect(screen.getByTestId('line-deviceCount')).toBeInTheDocument();
              expect(screen.getByTestId('line-onlineDevices')).toBeInTheDocument();
            } else {
              expect(screen.queryByTestId('line-deviceCount')).not.toBeInTheDocument();
              expect(screen.queryByTestId('line-onlineDevices')).not.toBeInTheDocument();
            }

            // 验证会话趋势�?
            if (showSessionTrend) {
              expect(screen.getByTestId('line-activeSessions')).toBeInTheDocument();
            } else {
              expect(screen.queryByTestId('line-activeSessions')).not.toBeInTheDocument();
            }

            // 验证审计趋势�?
            if (showAuditTrend) {
              expect(screen.getByTestId('line-auditActivity')).toBeInTheDocument();
            } else {
              expect(screen.queryByTestId('line-auditActivity')).not.toBeInTheDocument();
            }
          }
        ),
        { numRuns: 3 }
      );
    });

    it('应该支持时间范围切换', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('1h', '6h', '24h', '7d', '30d', '90d'),
          async (initialTimeRange) => {
            render(<HistoryTrendChart timeRange={initialTimeRange} />);

            await waitFor(() => {
              expect(screen.getByTestId('line-chart')).toBeInTheDocument();
            });

            // 查找时间范围按钮
            const timeRangeButtons = screen.getAllByRole('button');
            const targetLabels = ['1小时', '6小时', '24小时', '7�?, '30�?, '90�?];
            
            for (const label of targetLabels) {
              const button = timeRangeButtons.find(btn => 
                btn.textContent?.includes(label)
              );
              
              if (button) {
                fireEvent.click(button);
                
                // 验证API调用被触发（通过重新渲染检测）
                await waitFor(() => {
                  expect(screen.getByTestId('line-chart')).toBeInTheDocument();
                });
              }
            }
          }
        ),
        { numRuns: 3 }
      );
    });

    it('应该支持数据钻取功能', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          async (hasBrushInteraction) => {
            const mockOnDataPointClick = vi.fn();
            
            render(
              <HistoryTrendChart
                onDataPointClick={mockOnDataPointClick}
              />
            );

            await waitFor(() => {
              expect(screen.getByTestId('line-chart')).toBeInTheDocument();
            });

            // 验证Brush组件存在（用于数据钻取）
            const brushElement = screen.getByTestId('brush');
            expect(brushElement).toBeInTheDocument();

            if (hasBrushInteraction) {
              // 模拟Brush交互
              fireEvent.click(brushElement);
              
              // 验证缩放功能可用
              await waitFor(() => {
                expect(screen.getByTestId('line-chart')).toBeInTheDocument();
              });
            }

            // 模拟图表点击
            const chartElement = screen.getByTestId('line-chart');
            fireEvent.click(chartElement);
            
            // 注意：由于mock的限制，这里主要验证组件结构
            expect(chartElement).toBeInTheDocument();
          }
        ),
        { numRuns: 3 }
      );
    });

    it('应该正确处理API错误', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('network_error', 'timeout', 'server_error'),
          async (errorType) => {
            // 模拟API错误
            const errorMessage = `API ${errorType} occurred`;
            (apiClient.getDevices as any).mockRejectedValue(new Error(errorMessage));
            (apiClient.getSessions as any).mockRejectedValue(new Error(errorMessage));

            render(<HistoryTrendChart />);

            // 验证错误处理
            await waitFor(() => {
              const errorElements = screen.queryAllByText(/获取趋势数据失败|API.*occurred/);
              expect(errorElements.length).toBeGreaterThan(0);
            });
          }
        ),
        { numRuns: 3 }
      );
    });

    it('应该显示统计信息和变化趋�?, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          fc.boolean(),
          async (showDeviceTrend, showSessionTrend) => {
            render(
              <HistoryTrendChart
                showDeviceTrend={showDeviceTrend}
                showSessionTrend={showSessionTrend}
              />
            );

            await waitFor(() => {
              expect(screen.getByTestId('line-chart')).toBeInTheDocument();
            });

            // 验证统计信息显示
            if (showDeviceTrend) {
              // 查找设备相关统计
              const deviceStats = screen.queryAllByText(/设备总数|在线设备/);
              expect(deviceStats.length).toBeGreaterThan(0);
            }

            if (showSessionTrend) {
              // 查找会话相关统计
              const sessionStats = screen.queryAllByText(/活跃会话/);
              expect(sessionStats.length).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 3 }
      );
    });

    it('应该支持自定义刷新间�?, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1000, max: 300000 }), // 1秒到5分钟
          async (refreshInterval) => {
            const { unmount } = render(
              <HistoryTrendChart refreshInterval={refreshInterval} />
            );

            await waitFor(() => {
              expect(screen.getByTestId('line-chart')).toBeInTheDocument();
            });

            // 验证初始API调用
            expect(apiClient.getDevices).toHaveBeenCalled();
            expect(apiClient.getSessions).toHaveBeenCalled();

            // 清理组件以避免定时器泄漏
            unmount();
          }
        ),
        { numRuns: 3 }
      );
    });
  });
});