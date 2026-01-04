import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as fc from 'fast-check';
import { ChartExport, ChartRef, ExportConfig } from '../components/ChartExport';

// Mock URL.createObjectURL and URL.revokeObjectURL
global.URL.createObjectURL = vi.fn(() => 'mock-url');
global.URL.revokeObjectURL = vi.fn();

// Mock document.createElement and related methods
const mockCanvas = {
  width: 0,
  height: 0,
  getContext: vi.fn(() => ({
    fillStyle: '',
    font: '',
    textAlign: '',
    strokeStyle: '',
    lineWidth: 0,
    fillRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn()
  })),
  toBlob: vi.fn((callback) => {
    const mockBlob = new Blob(['mock-image-data'], { type: 'image/png' });
    callback(mockBlob);
  })
};

global.document.createElement = vi.fn((tagName) => {
  if (tagName === 'canvas') {
    return mockCanvas as any;
  }
  if (tagName === 'a') {
    return {
      href: '',
      download: '',
      click: vi.fn(),
      remove: vi.fn()
    } as any;
  }
  return {} as any;
});

describe('ChartExport Properties', () => {
  let mockCharts: ChartRef[];
  let mockOnExport: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup mock charts
    mockCharts = [
      {
        id: 'chart1',
        name: '设备状态分�?,
        element: document.createElement('div'),
        selected: false
      },
      {
        id: 'chart2', 
        name: '历史趋势图表',
        element: document.createElement('div'),
        selected: false
      },
      {
        id: 'chart3',
        name: '审计统计',
        element: document.createElement('div'),
        selected: false
      }
    ];

    mockOnExport = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Property 61: 图表导出功能
   * Validates: Requirements 9.7
   * 
   * 验证图表导出功能能够正确导出图表为不同格式，
   * 支持高分辨率图片导出和批量图表导�?
   */
  describe('Property 61: 图表导出功能', () => {
    it('应该正确渲染导出按钮', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.record({
            id: fc.string(),
            name: fc.string(),
            selected: fc.boolean()
          }), { minLength: 1, maxLength: 5 }),
          async (chartData) => {
            const charts = chartData.map(data => ({
              ...data,
              element: document.createElement('div')
            }));

            render(
              <ChartExport
                charts={charts}
                onExport={mockOnExport}
              />
            );

            // 验证导出按钮存在
            const exportButton = screen.getByText('导出图表');
            expect(exportButton).toBeInTheDocument();
            expect(exportButton.closest('button')).toBeInTheDocument();
          }
        ),
        { numRuns: 3 }
      );
    });

    it('应该支持打开和关闭导出配置弹�?, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          async (shouldOpen) => {
            render(
              <ChartExport
                charts={mockCharts}
                onExport={mockOnExport}
              />
            );

            const exportButton = screen.getByText('导出图表');
            
            if (shouldOpen) {
              // 打开弹窗
              fireEvent.click(exportButton);
              
              await waitFor(() => {
                expect(screen.getByText('选择图表')).toBeInTheDocument();
                expect(screen.getByText('导出设置')).toBeInTheDocument();
              });

              // 关闭弹窗
              const closeButton = screen.getByText('×');
              fireEvent.click(closeButton);
              
              await waitFor(() => {
                expect(screen.queryByText('选择图表')).not.toBeInTheDocument();
              });
            }
          }
        ),
        { numRuns: 3 }
      );
    });

    it('应该支持图表选择和全选功�?, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          async (useSelectAll) => {
            render(
              <ChartExport
                charts={mockCharts}
                onExport={mockOnExport}
              />
            );

            // 打开弹窗
            fireEvent.click(screen.getByText('导出图表'));
            
            await waitFor(() => {
              expect(screen.getByText('选择图表')).toBeInTheDocument();
            });

            if (useSelectAll) {
              // 测试全选功�?
              const selectAllButton = screen.getByText('全�?);
              fireEvent.click(selectAllButton);
              
              // 验证全选后的状态变�?
              await waitFor(() => {
                expect(screen.getByText('取消全�?)).toBeInTheDocument();
              });
            } else {
              // 测试单个图表选择
              const chartItems = screen.getAllByText(/设备状态分布|历史趋势图表|审计统计/);
              if (chartItems.length > 0) {
                fireEvent.click(chartItems[0]);
              }
            }
          }
        ),
        { numRuns: 3 }
      );
    });

    it('应该支持不同的导出格式选择', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('PNG', 'JPEG', 'SVG', 'PDF'),
          async (format) => {
            render(
              <ChartExport
                charts={mockCharts}
                onExport={mockOnExport}
              />
            );

            // 打开弹窗
            fireEvent.click(screen.getByText('导出图表'));
            
            await waitFor(() => {
              expect(screen.getByText('导出格式')).toBeInTheDocument();
            });

            // 选择格式
            const formatButton = screen.getByText(format);
            fireEvent.click(formatButton);
            
            // 验证格式选择
            expect(formatButton.closest('button')).toHaveClass('border-blue-500');
          }
        ),
        { numRuns: 3 }
      );
    });

    it('应该支持导出质量设置', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('low', 'medium', 'high', 'ultra'),
          async (quality) => {
            render(
              <ChartExport
                charts={mockCharts}
                onExport={mockOnExport}
              />
            );

            // 打开弹窗
            fireEvent.click(screen.getByText('导出图表'));
            
            await waitFor(() => {
              expect(screen.getByText('导出质量')).toBeInTheDocument();
            });

            // 选择质量
            const qualitySelect = screen.getByDisplayValue(/质量/);
            fireEvent.change(qualitySelect, { target: { value: quality } });
            
            // 验证质量选择
            expect(qualitySelect).toHaveValue(quality);
          }
        ),
        { numRuns: 3 }
      );
    });

    it('应该支持自定义尺寸设�?, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 800, max: 4000 }),
          fc.integer({ min: 600, max: 3000 }),
          async (width, height) => {
            render(
              <ChartExport
                charts={mockCharts}
                onExport={mockOnExport}
              />
            );

            // 打开弹窗
            fireEvent.click(screen.getByText('导出图表'));
            
            await waitFor(() => {
              expect(screen.getByText('宽度 (px)')).toBeInTheDocument();
              expect(screen.getByText('高度 (px)')).toBeInTheDocument();
            });

            // 设置尺寸
            const widthInput = screen.getByDisplayValue('1920');
            const heightInput = screen.getByDisplayValue('1080');
            
            fireEvent.change(widthInput, { target: { value: width.toString() } });
            fireEvent.change(heightInput, { target: { value: height.toString() } });
            
            // 验证尺寸设置
            expect(widthInput).toHaveValue(width.toString());
            expect(heightInput).toHaveValue(height.toString());
          }
        ),
        { numRuns: 3 }
      );
    });

    it('应该支持导出选项配置', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          fc.boolean(),
          async (includeTitle, includeTimestamp) => {
            render(
              <ChartExport
                charts={mockCharts}
                onExport={mockOnExport}
              />
            );

            // 打开弹窗
            fireEvent.click(screen.getByText('导出图表'));
            
            await waitFor(() => {
              expect(screen.getByText('包含标题')).toBeInTheDocument();
              expect(screen.getByText('文件名包含时间戳')).toBeInTheDocument();
            });

            // 设置选项
            const titleCheckbox = screen.getByLabelText('包含标题');
            const timestampCheckbox = screen.getByLabelText('文件名包含时间戳');
            
            if (includeTitle !== titleCheckbox.checked) {
              fireEvent.click(titleCheckbox);
            }
            
            if (includeTimestamp !== timestampCheckbox.checked) {
              fireEvent.click(timestampCheckbox);
            }
            
            // 验证选项设置
            expect(titleCheckbox.checked).toBe(includeTitle);
            expect(timestampCheckbox.checked).toBe(includeTimestamp);
          }
        ),
        { numRuns: 3 }
      );
    });

    it('应该正确执行导出操作', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 3 }),
          async (selectedCount) => {
            render(
              <ChartExport
                charts={mockCharts}
                onExport={mockOnExport}
              />
            );

            // 打开弹窗
            fireEvent.click(screen.getByText('导出图表'));
            
            await waitFor(() => {
              expect(screen.getByText('选择图表')).toBeInTheDocument();
            });

            // 选择图表
            const chartItems = screen.getAllByText(/设备状态分布|历史趋势图表|审计统计/);
            for (let i = 0; i < Math.min(selectedCount, chartItems.length); i++) {
              fireEvent.click(chartItems[i]);
            }

            // 执行导出
            const exportButton = screen.getByText(/导出 \(\d+\)/);
            fireEvent.click(exportButton);
            
            // 验证导出调用
            await waitFor(() => {
              expect(mockOnExport).toHaveBeenCalledWith(
                expect.any(Object),
                expect.any(Array)
              );
            });
          }
        ),
        { numRuns: 3 }
      );
    });

    it('应该显示导出进度', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          async (showProgress) => {
            // 模拟长时间导�?
            if (showProgress) {
              mockOnExport.mockImplementation(() => 
                new Promise(resolve => setTimeout(resolve, 100))
              );
            }

            render(
              <ChartExport
                charts={mockCharts}
                onExport={mockOnExport}
              />
            );

            // 打开弹窗并选择图表
            fireEvent.click(screen.getByText('导出图表'));
            
            await waitFor(() => {
              expect(screen.getByText('选择图表')).toBeInTheDocument();
            });

            // 选择第一个图�?
            const firstChart = screen.getAllByText(/设备状态分布|历史趋势图表|审计统计/)[0];
            fireEvent.click(firstChart);

            // 执行导出
            const exportButton = screen.getByText(/导出 \(1\)/);
            fireEvent.click(exportButton);
            
            if (showProgress) {
              // 验证进度显示
              await waitFor(() => {
                expect(screen.getByText('导出�?..')).toBeInTheDocument();
              });
            }
          }
        ),
        { numRuns: 3 }
      );
    });

    it('应该正确处理导出错误', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('network_error', 'file_error', 'permission_error'),
          async (errorType) => {
            // 模拟导出错误
            const errorMessage = `Export ${errorType} occurred`;
            mockOnExport.mockRejectedValue(new Error(errorMessage));

            // Mock alert
            const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

            render(
              <ChartExport
                charts={mockCharts}
                onExport={mockOnExport}
              />
            );

            // 打开弹窗并选择图表
            fireEvent.click(screen.getByText('导出图表'));
            
            await waitFor(() => {
              expect(screen.getByText('选择图表')).toBeInTheDocument();
            });

            // 选择图表并导�?
            const firstChart = screen.getAllByText(/设备状态分布|历史趋势图表|审计统计/)[0];
            fireEvent.click(firstChart);
            
            const exportButton = screen.getByText(/导出 \(1\)/);
            fireEvent.click(exportButton);
            
            // 验证错误处理
            await waitFor(() => {
              expect(alertSpy).toHaveBeenCalledWith(
                expect.stringContaining('导出失败')
              );
            });

            alertSpy.mockRestore();
          }
        ),
        { numRuns: 3 }
      );
    });

    it('应该支持批量图表导出', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 3 }),
          async (batchSize) => {
            render(
              <ChartExport
                charts={mockCharts}
                onExport={mockOnExport}
              />
            );

            // 打开弹窗
            fireEvent.click(screen.getByText('导出图表'));
            
            await waitFor(() => {
              expect(screen.getByText('选择图表')).toBeInTheDocument();
            });

            // 批量选择图表
            const chartItems = screen.getAllByText(/设备状态分布|历史趋势图表|审计统计/);
            for (let i = 0; i < Math.min(batchSize, chartItems.length); i++) {
              fireEvent.click(chartItems[i]);
            }

            // 执行批量导出
            const exportButton = screen.getByText(new RegExp(`导出 \\(${Math.min(batchSize, chartItems.length)}\\)`));
            fireEvent.click(exportButton);
            
            // 验证批量导出调用
            await waitFor(() => {
              expect(mockOnExport).toHaveBeenCalledWith(
                expect.any(Object),
                expect.arrayContaining(expect.any(String))
              );
              
              const [, chartIds] = mockOnExport.mock.calls[0];
              expect(chartIds.length).toBe(Math.min(batchSize, chartItems.length));
            });
          }
        ),
        { numRuns: 3 }
      );
    });
  });
});