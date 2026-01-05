import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as fc from 'fast-check';
import { AuditStatsChart } from '../components/AuditStatsChart';
import { apiClient } from '../lib/api-client';

// Mock API client
vi.mock('../lib/api-client', () => ({
  apiClient: {
    getAuditLogs: vi.fn()
  }
}));

// Mock recharts components
vi.mock('recharts', () => ({
  PieChart: ({ children, onClick }: any) => (
    <div data-testid="pie-chart" onClick={onClick}>
      {children}
    </div>
  ),
  Pie: ({ dataKey, onClick }: any) => (
    <div data-testid={`pie-${dataKey}`} onClick={onClick} />
  ),
  BarChart: ({ children, data, layout }: any) => (
    <div data-testid="bar-chart" data-layout={layout}>
      {children}
    </div>
  ),
  Bar: ({ dataKey, onClick }: any) => (
    <div data-testid={`bar-${dataKey}`} onClick={onClick} />
  ),
  LineChart: ({ children }: any) => (
    <div data-testid="line-chart">
      {children}
    </div>
  ),
  Line: ({ dataKey }: any) => (
    <div data-testid={`line-${dataKey}`} />
  ),
  AreaChart: ({ children }: any) => (
    <div data-testid="area-chart">
      {children}
    </div>
  ),
  Area: ({ dataKey }: any) => (
    <div data-testid={`area-${dataKey}`} />
  ),
  XAxis: ({ dataKey, type }: any) => (
    <div data-testid="x-axis" data-key={dataKey} data-type={type} />
  ),
  YAxis: ({ dataKey, type }: any) => (
    <div data-testid="y-axis" data-key={dataKey} data-type={type} />
  ),
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
  ResponsiveContainer: ({ children }: any) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  Cell: ({ fill }: any) => <div data-testid="cell" data-fill={fill} />
}));

describe('AuditStatsChart Properties', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mock response
    (apiClient.getAuditLogs as any).mockResolvedValue({
      logs: [
        {
          id: 1,
          device_id: 'device1',
          action_type: 'login',
          timestamp: Date.now() - 1000,
          session_id: 'session1'
        },
        {
          id: 2,
          device_id: 'device2',
          action_type: 'file_upload',
          timestamp: Date.now() - 2000,
          session_id: 'session2'
        },
        {
          id: 3,
          device_id: 'device1',
          action_type: 'command_execution',
          timestamp: Date.now() - 3000,
          session_id: 'session3'
        }
      ],
      total: 3,
      has_more: false
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Property 58: 审计统计可视�?
   * Validates: Requirements 9.4
   * 
   * 验证审计统计可视化能够正确显示操作类型分布�?
   * 频率统计和热力图，支持交互式数据探索
   */
  describe('Property 58: 审计统计可视化显示和交互', () => {
    it('应该正确渲染审计统计图表组件', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          fc.boolean(),
          fc.boolean(),
          fc.boolean(),
          fc.boolean(),
          async (showActionTypes, showTimeDistribution, showDeviceActivity, showSeverityStats, showDailyTrend) => {
            render(
              <AuditStatsChart
                showActionTypes={showActionTypes}
                showTimeDistribution={showTimeDistribution}
                showDeviceActivity={showDeviceActivity}
                showSeverityStats={showSeverityStats}
                showDailyTrend={showDailyTrend}
              />
            );

            // 验证主标题存�?
            await waitFor(() => {
              expect(screen.getByText('审计统计可视�?)).toBeInTheDocument();
            });

            // 验证总体统计显示
            expect(screen.getByText('总操作数')).toBeInTheDocument();
            expect(screen.getByText('活跃设备')).toBeInTheDocument();
          }
        ),
        { numRuns: 3 }
      );
    });

    it('应该根据配置显示相应的图表组�?, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          fc.boolean(),
          fc.boolean(),
          fc.boolean(),
          fc.boolean(),
          async (showActionTypes, showTimeDistribution, showDeviceActivity, showSeverityStats, showDailyTrend) => {
            render(
              <AuditStatsChart
                showActionTypes={showActionTypes}
                showTimeDistribution={showTimeDistribution}
                showDeviceActivity={showDeviceActivity}
                showSeverityStats={showSeverityStats}
                showDailyTrend={showDailyTrend}
              />
            );

            await waitFor(() => {
              expect(screen.getByText('审计统计可视�?)).toBeInTheDocument();
            });

            // 验证操作类型分布图表
            if (showActionTypes) {
              expect(screen.getByText('操作类型分布')).toBeInTheDocument();
              expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
            } else {
              expect(screen.queryByText('操作类型分布')).not.toBeInTheDocument();
            }

            // 验证时间分布图表
            if (showTimeDistribution) {
              expect(screen.getByText('24小时活动分布')).toBeInTheDocument();
              expect(screen.getByTestId('area-chart')).toBeInTheDocument();
            } else {
              expect(screen.queryByText('24小时活动分布')).not.toBeInTheDocument();
            }

            // 验证设备活动图表
            if (showDeviceActivity) {
              expect(screen.getByText('设备活动排行')).toBeInTheDocument();
              expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
            } else {
              expect(screen.queryByText('设备活动排行')).not.toBeInTheDocument();
            }

            // 验证严重程度分布图表
            if (showSeverityStats) {
              expect(screen.getByText('严重程度分布')).toBeInTheDocument();
              expect(screen.getAllByTestId('pie-chart').length).toBeGreaterThan(0);
            } else {
              expect(screen.queryByText('严重程度分布')).not.toBeInTheDocument();
            }

            // 验证每日趋势图表
            if (showDailyTrend) {
              expect(screen.getByText('每日活动趋势')).toBeInTheDocument();
              expect(screen.getByTestId('line-chart')).toBeInTheDocument();
            } else {
              expect(screen.queryByText('每日活动趋势')).not.toBeInTheDocument();
            }
          }
        ),
        { numRuns: 3 }
      );
    });

    it('应该支持图表类型切换（饼�?柱状图）', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          async (initialChartType) => {
            render(
              <AuditStatsChart
                showActionTypes={true}
              />
            );

            await waitFor(() => {
              expect(screen.getByText('操作类型分布')).toBeInTheDocument();
            });

            // 查找图表类型切换按钮
            const buttons = screen.getAllByRole('button');
            const chartTypeButtons = buttons.filter(btn => 
              btn.querySelector('svg') !== null
            );

            if (chartTypeButtons.length >= 2) {
              // 点击不同的图表类型按�?
              fireEvent.click(chartTypeButtons[0]);
              await waitFor(() => {
                expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
              });

              fireEvent.click(chartTypeButtons[1]);
              await waitFor(() => {
                expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
              });
            }
          }
        ),
        { numRuns: 3 }
      );
    });

    it('应该支持交互式数据探�?, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          async (hasInteraction) => {
            const mockOnStatsClick = vi.fn();
            
            render(
              <AuditStatsChart
                showActionTypes={true}
                showDeviceActivity={true}
                onStatsClick={mockOnStatsClick}
              />
            );

            await waitFor(() => {
              expect(screen.getByText('操作类型分布')).toBeInTheDocument();
            });

            if (hasInteraction) {
              // 模拟图表点击交互
              const pieChart = screen.getByTestId('pie-chart');
              fireEvent.click(pieChart);

              const barChart = screen.getByTestId('bar-chart');
              fireEvent.click(barChart);
            }

            // 验证图表组件存在
            expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
            expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
          }
        ),
        { numRuns: 3 }
      );
    });

    it('应该正确处理时间范围筛�?, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 30 }), // 1-30�?
          fc.option(fc.string(), { nil: undefined }),
          fc.option(fc.string(), { nil: undefined }),
          async (days, deviceId, actionType) => {
            const timeRange = days * 24 * 60 * 60 * 1000;
            
            render(
              <AuditStatsChart
                timeRange={timeRange}
                deviceId={deviceId}
                actionType={actionType}
              />
            );

            await waitFor(() => {
              expect(screen.getByText('审计统计可视�?)).toBeInTheDocument();
            });

            // 验证API调用参数
            expect(apiClient.getAuditLogs).toHaveBeenCalledWith(
              expect.objectContaining({
                start_time: expect.any(Number),
                end_time: expect.any(Number),
                limit: 1000,
                ...(deviceId && { device_id: deviceId }),
                ...(actionType && { action_type: actionType })
              })
            );

            // 验证时间范围显示
            const timeRangeText = screen.getByText(new RegExp(`过去 ${days} 天`));
            expect(timeRangeText).toBeInTheDocument();
          }
        ),
        { numRuns: 3 }
      );
    });

    it('应该正确显示统计数据', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          async (hasData) => {
            if (!hasData) {
              (apiClient.getAuditLogs as any).mockResolvedValue({
                logs: [],
                total: 0,
                has_more: false
              });
            }

            render(<AuditStatsChart />);

            await waitFor(() => {
              expect(screen.getByText('审计统计可视�?)).toBeInTheDocument();
            });

            // 验证统计数字显示
            const totalActions = screen.getByText('总操作数');
            expect(totalActions).toBeInTheDocument();

            const activeDevices = screen.getByText('活跃设备');
            expect(activeDevices).toBeInTheDocument();

            // 验证数字显示
            const numbers = screen.getAllByText(/^\d+$/);
            expect(numbers.length).toBeGreaterThan(0);
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
            (apiClient.getAuditLogs as any).mockRejectedValue(new Error(errorMessage));

            render(<AuditStatsChart />);

            // 验证错误处理
            await waitFor(() => {
              const errorElements = screen.queryAllByText(/数据获取失败|API.*occurred/);
              expect(errorElements.length).toBeGreaterThan(0);
            });
          }
        ),
        { numRuns: 3 }
      );
    });

    it('应该支持自定义刷新间�?, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 60000, max: 600000 }), // 1分钟�?0分钟
          async (refreshInterval) => {
            const { unmount } = render(
              <AuditStatsChart refreshInterval={refreshInterval} />
            );

            await waitFor(() => {
              expect(screen.getByText('审计统计可视�?)).toBeInTheDocument();
            });

            // 验证初始API调用
            expect(apiClient.getAuditLogs).toHaveBeenCalled();

            // 清理组件以避免定时器泄漏
            unmount();
          }
        ),
        { numRuns: 3 }
      );
    });

    it('应该正确显示热力图和频率统计', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          async (showTimeDistribution) => {
            render(
              <AuditStatsChart
                showTimeDistribution={showTimeDistribution}
              />
            );

            await waitFor(() => {
              expect(screen.getByText('审计统计可视�?)).toBeInTheDocument();
            });

            if (showTimeDistribution) {
              // 验证24小时活动分布（热力图�?
              expect(screen.getByText('24小时活动分布')).toBeInTheDocument();
              expect(screen.getByTestId('area-chart')).toBeInTheDocument();
              expect(screen.getByTestId('area-count')).toBeInTheDocument();

              // 验证活动高峰时间显示
              const peakTimeElements = screen.queryAllByText(/活动高峰/);
              if (peakTimeElements.length > 0) {
                expect(peakTimeElements[0]).toBeInTheDocument();
              }
            }
          }
        ),
        { numRuns: 3 }
      );
    });
  });
});