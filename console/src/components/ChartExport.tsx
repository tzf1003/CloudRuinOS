import { useState } from 'react';
import { 
  Download, 
  Image, 
  FileText, 
  CheckSquare,
  Square,
  Loader2
} from 'lucide-react';
import { clsx } from 'clsx';

// 导出格式选项
export type ExportFormat = 'png' | 'jpeg' | 'svg' | 'pdf';

// 导出质量选项
export type ExportQuality = 'low' | 'medium' | 'high' | 'ultra';

// 导出配置接口
export interface ExportConfig {
  format: ExportFormat;
  quality: ExportQuality;
  width: number;
  height: number;
  backgroundColor: string;
  filename: string;
  includeTitle: boolean;
  includeTimestamp: boolean;
}

// 图表引用接口
export interface ChartRef {
  id: string;
  name: string;
  element: HTMLElement;
  selected: boolean;
}

// 组件属性接口
interface ChartExportProps {
  charts: ChartRef[];
  onExport?: (config: ExportConfig, chartIds: string[]) => Promise<void>;
  defaultConfig?: Partial<ExportConfig>;
  className?: string;
}

// 默认导出配置
const DEFAULT_CONFIG: ExportConfig = {
  format: 'png',
  quality: 'high',
  width: 1920,
  height: 1080,
  backgroundColor: '#ffffff',
  filename: 'chart-export',
  includeTitle: true,
  includeTimestamp: true
};

// 质量配置映射
const QUALITY_CONFIG = {
  low: { scale: 1, dpi: 72 },
  medium: { scale: 1.5, dpi: 150 },
  high: { scale: 2, dpi: 300 },
  ultra: { scale: 3, dpi: 450 }
};

// 格式配置
const FORMAT_CONFIG = {
  png: { label: 'PNG', icon: Image, description: '高质量图片，支持透明背景' },
  jpeg: { label: 'JPEG', icon: Image, description: '压缩图片，文件较小' },
  svg: { label: 'SVG', icon: FileText, description: '矢量图形，可无限缩放' },
  pdf: { label: 'PDF', icon: FileText, description: '文档格式，适合打印' }
};

export function ChartExport({ 
  charts, 
  onExport, 
  defaultConfig = {}, 
  className 
}: ChartExportProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<ExportConfig>({
    ...DEFAULT_CONFIG,
    ...defaultConfig
  });
  const [selectedCharts, setSelectedCharts] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // 切换图表选择
  const toggleChartSelection = (chartId: string) => {
    const newSelected = new Set(selectedCharts);
    if (newSelected.has(chartId)) {
      newSelected.delete(chartId);
    } else {
      newSelected.add(chartId);
    }
    setSelectedCharts(newSelected);
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedCharts.size === charts.length) {
      setSelectedCharts(new Set());
    } else {
      setSelectedCharts(new Set(charts.map(chart => chart.id)));
    }
  };

  // 更新配置
  const updateConfig = (updates: Partial<ExportConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  };

  // 生成文件名
  const generateFilename = (chartName?: string) => {
    const timestamp = config.includeTimestamp 
      ? `-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}`
      : '';
    const baseName = chartName || config.filename;
    return `${baseName}${timestamp}.${config.format}`;
  };

  // 执行导出
  const handleExport = async () => {
    if (selectedCharts.size === 0) {
      alert('请选择要导出的图表');
      return;
    }

    setIsExporting(true);
    setExportProgress(0);

    try {
      const chartIds = Array.from(selectedCharts);
      
      if (onExport) {
        await onExport(config, chartIds);
      } else {
        // 默认导出实现
        await performDefaultExport(chartIds);
      }
      
      setIsOpen(false);
    } catch (error) {
      console.error('Export failed:', error);
      alert('导出失败: ' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  // 默认导出实现
  const performDefaultExport = async (chartIds: string[]) => {
    const totalCharts = chartIds.length;
    
    for (let i = 0; i < totalCharts; i++) {
      const chartId = chartIds[i];
      const chart = charts.find(c => c.id === chartId);
      
      if (!chart) continue;
      
      setExportProgress(((i + 1) / totalCharts) * 100);
      
      try {
        await exportChart(chart);
        
        // 添加延迟以避免浏览器阻塞
        if (i < totalCharts - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`Failed to export chart ${chartId}:`, error);
      }
    }
  };

  // 导出单个图表
  const exportChart = async (chart: ChartRef): Promise<void> => {
    const element = chart.element;
    const qualityConfig = QUALITY_CONFIG[config.quality];
    
    return new Promise((resolve, reject) => {
      try {
        if (config.format === 'svg') {
          exportAsSVG(element, chart.name, resolve, reject);
        } else if (config.format === 'pdf') {
          exportAsPDF(element, chart.name, resolve, reject);
        } else {
          exportAsImage(element, chart.name, qualityConfig, resolve, reject);
        }
      } catch (error) {
        reject(error);
      }
    });
  };

  // 导出为图片
  const exportAsImage = (
    element: HTMLElement, 
    chartName: string, 
    qualityConfig: { scale: number; dpi: number },
    resolve: () => void,
    reject: (error: any) => void
  ) => {
    // 使用 html2canvas 或类似库的模拟实现
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      reject(new Error('无法创建画布上下文'));
      return;
    }

    // 设置画布尺寸
    canvas.width = config.width * qualityConfig.scale;
    canvas.height = config.height * qualityConfig.scale;
    
    // 设置背景色
    ctx.fillStyle = config.backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 模拟图表渲染（实际实现需要使用html2canvas等库）
    ctx.fillStyle = '#333';
    ctx.font = `${24 * qualityConfig.scale}px Arial`;
    ctx.textAlign = 'center';
    
    if (config.includeTitle) {
      ctx.fillText(chartName, canvas.width / 2, 50 * qualityConfig.scale);
    }
    
    // 模拟图表内容
    ctx.strokeStyle = '#3B82F6';
    ctx.lineWidth = 2 * qualityConfig.scale;
    ctx.beginPath();
    ctx.moveTo(100 * qualityConfig.scale, canvas.height - 100 * qualityConfig.scale);
    ctx.lineTo(canvas.width - 100 * qualityConfig.scale, 100 * qualityConfig.scale);
    ctx.stroke();
    
    // 转换为blob并下载
    canvas.toBlob((blob) => {
      if (blob) {
        downloadBlob(blob, generateFilename(chartName));
        resolve();
      } else {
        reject(new Error('无法生成图片'));
      }
    }, `image/${config.format}`, config.format === 'jpeg' ? 0.9 : undefined);
  };

  // 导出为SVG
  const exportAsSVG = (
    element: HTMLElement, 
    chartName: string,
    resolve: () => void,
    reject: (error: any) => void
  ) => {
    try {
      // 模拟SVG导出
      const svgContent = `
        <svg width="${config.width}" height="${config.height}" xmlns="http://www.w3.org/2000/svg">
          <rect width="100%" height="100%" fill="${config.backgroundColor}"/>
          ${config.includeTitle ? `<text x="50%" y="30" text-anchor="middle" font-family="Arial" font-size="24" fill="#333">${chartName}</text>` : ''}
          <line x1="100" y1="${config.height - 100}" x2="${config.width - 100}" y2="100" stroke="#3B82F6" stroke-width="2"/>
        </svg>
      `;
      
      const blob = new Blob([svgContent], { type: 'image/svg+xml' });
      downloadBlob(blob, generateFilename(chartName));
      resolve();
    } catch (error) {
      reject(error);
    }
  };

  // 导出为PDF
  const exportAsPDF = (
    element: HTMLElement, 
    chartName: string,
    resolve: () => void,
    reject: (error: any) => void
  ) => {
    try {
      // 模拟PDF导出（实际实现需要使用jsPDF等库）
      const pdfContent = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj

2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 ${config.width} ${config.height}]
/Contents 4 0 R
>>
endobj

4 0 obj
<<
/Length 100
>>
stream
BT
/F1 24 Tf
${config.width / 2} ${config.height - 50} Td
(${chartName}) Tj
ET
endstream
endobj

xref
0 5
0000000000 65535 f 
0000000010 00000 n 
0000000079 00000 n 
0000000173 00000 n 
0000000301 00000 n 
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
456
%%EOF`;
      
      const blob = new Blob([pdfContent], { type: 'application/pdf' });
      downloadBlob(blob, generateFilename(chartName));
      resolve();
    } catch (error) {
      reject(error);
    }
  };

  // 下载文件
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className={clsx("relative", className)}>
      {/* 导出按钮 */}
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
      >
        <Download className="h-4 w-4 mr-2" />
        导出图表
      </button>

      {/* 导出配置弹窗 */}
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setIsOpen(false)} />
            
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-medium text-gray-900">导出图表</h3>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ×
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* 图表选择 */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-medium text-gray-900">选择图表</h4>
                      <button
                        onClick={toggleSelectAll}
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        {selectedCharts.size === charts.length ? '取消全选' : '全选'}
                      </button>
                    </div>
                    
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {charts.map((chart) => (
                        <div
                          key={chart.id}
                          className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                          onClick={() => toggleChartSelection(chart.id)}
                        >
                          {selectedCharts.has(chart.id) ? (
                            <CheckSquare className="h-5 w-5 text-blue-600 mr-3" />
                          ) : (
                            <Square className="h-5 w-5 text-gray-400 mr-3" />
                          )}
                          <span className="text-sm text-gray-900">{chart.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 导出配置 */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium text-gray-900">导出设置</h4>
                    
                    {/* 格式选择 */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        导出格式
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(FORMAT_CONFIG).map(([format, formatConfig]) => (
                          <button
                            key={format}
                            onClick={() => updateConfig({ format: format as ExportFormat })}
                            className={clsx(
                              "p-3 border rounded-lg text-left transition-colors",
                              config.format === format
                                ? "border-blue-500 bg-blue-50 text-blue-700"
                                : "border-gray-200 hover:border-gray-300"
                            )}
                          >
                            <div className="flex items-center mb-1">
                              <formatConfig.icon className="h-4 w-4 mr-2" />
                              <span className="font-medium">{formatConfig.label}</span>
                            </div>
                            <p className="text-xs text-gray-500">{formatConfig.description}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 质量选择 */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        导出质量
                      </label>
                      <select
                        value={config.quality}
                        onChange={(e) => updateConfig({ quality: e.target.value as ExportQuality })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="low">低质量 (72 DPI)</option>
                        <option value="medium">中等质量 (150 DPI)</option>
                        <option value="high">高质量 (300 DPI)</option>
                        <option value="ultra">超高质量 (450 DPI)</option>
                      </select>
                    </div>

                    {/* 尺寸设置 */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          宽度 (px)
                        </label>
                        <input
                          type="number"
                          value={config.width}
                          onChange={(e) => updateConfig({ width: parseInt(e.target.value) || 1920 })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          高度 (px)
                        </label>
                        <input
                          type="number"
                          value={config.height}
                          onChange={(e) => updateConfig({ height: parseInt(e.target.value) || 1080 })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    {/* 其他选项 */}
                    <div className="space-y-3">
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="includeTitle"
                          checked={config.includeTitle}
                          onChange={(e) => updateConfig({ includeTitle: e.target.checked })}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <label htmlFor="includeTitle" className="ml-2 text-sm text-gray-700">
                          包含标题
                        </label>
                      </div>
                      
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="includeTimestamp"
                          checked={config.includeTimestamp}
                          onChange={(e) => updateConfig({ includeTimestamp: e.target.checked })}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <label htmlFor="includeTimestamp" className="ml-2 text-sm text-gray-700">
                          文件名包含时间戳
                        </label>
                      </div>
                    </div>

                    {/* 文件名预览 */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        文件名预览
                      </label>
                      <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-600">
                        {generateFilename('示例图表')}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 导出进度 */}
              {isExporting && (
                <div className="px-4 py-3 bg-gray-50 border-t">
                  <div className="flex items-center">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    <span className="text-sm text-gray-600">
                      正在导出... {Math.round(exportProgress)}%
                    </span>
                  </div>
                  <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${exportProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* 操作按钮 */}
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  onClick={handleExport}
                  disabled={selectedCharts.size === 0 || isExporting}
                  className={clsx(
                    "w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 text-base font-medium text-white sm:ml-3 sm:w-auto sm:text-sm",
                    selectedCharts.size === 0 || isExporting
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  )}
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      导出中...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      导出 ({selectedCharts.size})
                    </>
                  )}
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  disabled={isExporting}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}