import { AuditLog, AuditFilters } from '../types/api';
import { ExportFormat, ExportOptions } from '../components/AuditExport';

export interface FormattedAuditLog {
  id: number;
  deviceId: string;
  sessionId: string;
  actionType: string;
  actionData: string;
  result: string;
  timestamp: string;
  formattedTimestamp: string;
  severity: string;
  duration?: string;
}

export class AuditLogFormatter {
  /**
   * Format audit logs for display
   */
  static formatLogs(logs: AuditLog[], options: Partial<ExportOptions> = {}): FormattedAuditLog[] {
    const dateFormat = options.dateFormat || 'readable';
    
    return logs.map(log => ({
      id: log.id,
      deviceId: log.device_id,
      sessionId: log.session_id || '-',
      actionType: this.formatActionType(log.action_type),
      actionData: this.formatActionData(log.action_data),
      result: this.formatResult(log.result),
      timestamp: log.timestamp.toString(),
      formattedTimestamp: this.formatTimestamp(log.timestamp, dateFormat),
      severity: this.inferSeverity(log),
      duration: this.calculateDuration(log)
    }));
  }

  /**
   * Format action type for display
   */
  static formatActionType(actionType: string): string {
    const typeMap: Record<string, string> = {
      'device_enrollment': '设备注册',
      'device_heartbeat': '设备心跳',
      'command_execution': '命令执行',
      'file_operation': '文件操作',
      'session_created': '会话创建',
      'session_closed': '会话关闭',
      'security_event': '安全事件',
      'authentication': '身份验证',
      'authorization': '权限验证',
      'data_access': '数据访问',
      'configuration_change': '配置变更',
      'system_event': '系统事件'
    };

    return typeMap[actionType] || actionType;
  }

  /**
   * Format action data for display
   */
  static formatActionData(actionData?: string): string {
    if (!actionData) return '-';
    
    try {
      // Try to parse as JSON and format nicely
      const parsed = JSON.parse(actionData);
      return this.formatJsonData(parsed);
    } catch {
      // If not JSON, return as-is but truncate if too long
      return actionData.length > 100 ? `${actionData.substring(0, 100)}...` : actionData;
    }
  }

  /**
   * Format JSON data for display
   */
  private static formatJsonData(data: any): string {
    if (typeof data === 'object' && data !== null) {
      const entries = Object.entries(data);
      if (entries.length === 0) return '{}';
      
      // Format key-value pairs nicely
      const formatted = entries
        .slice(0, 3) // Show only first 3 entries
        .map(([key, value]) => {
          const formattedValue = typeof value === 'string' && value.length > 30 
            ? `${value.substring(0, 30)}...` 
            : String(value);
          return `${key}: ${formattedValue}`;
        })
        .join(', ');
      
      return entries.length > 3 ? `${formatted}, ...` : formatted;
    }
    
    return String(data);
  }

  /**
   * Format result for display
   */
  static formatResult(result?: string): string {
    if (!result) return '-';
    
    const resultMap: Record<string, string> = {
      'success': '成功',
      'error': '错误',
      'failed': '失败',
      'timeout': '超时',
      'cancelled': '已取消',
      'pending': '处理中'
    };

    return resultMap[result] || result;
  }

  /**
   * Format timestamp based on format option
   */
  static formatTimestamp(timestamp: number, format: 'iso' | 'readable' | 'timestamp'): string {
    const date = new Date(timestamp * 1000);
    
    switch (format) {
      case 'iso':
        return date.toISOString();
      case 'readable':
        return date.toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        });
      case 'timestamp':
        return timestamp.toString();
      default:
        return date.toLocaleString();
    }
  }

  /**
   * Infer severity from log data
   */
  static inferSeverity(log: AuditLog): string {
    // Check result first
    if (log.result === 'error' || log.result === 'failed') {
      return 'error';
    }
    
    // Check action type for potential security concerns
    const securityActions = ['security_event', 'authentication', 'authorization'];
    if (securityActions.includes(log.action_type)) {
      return log.result === 'success' ? 'warning' : 'error';
    }
    
    // Check for configuration changes
    if (log.action_type === 'configuration_change') {
      return 'warning';
    }
    
    return 'info';
  }

  /**
   * Calculate duration if possible
   */
  static calculateDuration(log: AuditLog): string | undefined {
    try {
      if (log.action_data) {
        const data = JSON.parse(log.action_data);
        if (data.start_time && data.end_time) {
          const duration = data.end_time - data.start_time;
          return this.formatDuration(duration);
        }
        if (data.duration) {
          return this.formatDuration(data.duration);
        }
      }
    } catch {
      // Ignore parsing errors
    }
    
    return undefined;
  }

  /**
   * Format duration in seconds to human readable format
   */
  static formatDuration(seconds: number): string {
    if (seconds < 1) {
      return `${Math.round(seconds * 1000)}ms`;
    }
    if (seconds < 60) {
      return `${seconds.toFixed(1)}s`;
    }
    if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.round(seconds % 60);
      return `${minutes}m ${remainingSeconds}s`;
    }
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }

  /**
   * Export logs to CSV format
   */
  static exportToCsv(logs: AuditLog[], options: ExportOptions): string {
    const formatted = this.formatLogs(logs, options);
    const headers = [
      'ID',
      '设备ID',
      '会话ID',
      '操作类型',
      '操作数据',
      '结果',
      '时间',
      '严重程度',
      '持续时间'
    ];

    let csv = '';
    
    // Add filter information if requested
    if (options.includeFilters) {
      csv += `# 导出时间: ${new Date().toLocaleString('zh-CN')}\n`;
      csv += `# 记录数量: ${logs.length}\n`;
      csv += `# 导出格式: CSV\n`;
      csv += '\n';
    }

    // Add headers if requested
    if (options.includeHeaders) {
      csv += headers.join(',') + '\n';
    }

    // Add data rows
    formatted.forEach(log => {
      const row = [
        log.id,
        `"${log.deviceId}"`,
        `"${log.sessionId}"`,
        `"${log.actionType}"`,
        `"${log.actionData.replace(/"/g, '""')}"`, // Escape quotes
        `"${log.result}"`,
        `"${log.formattedTimestamp}"`,
        `"${log.severity}"`,
        `"${log.duration || '-'}"`
      ];
      csv += row.join(',') + '\n';
    });

    return csv;
  }

  /**
   * Export logs to JSON format
   */
  static exportToJson(logs: AuditLog[], options: ExportOptions, filters?: AuditFilters): string {
    const formatted = this.formatLogs(logs, options);
    
    const exportData = {
      metadata: {
        exportTime: new Date().toISOString(),
        recordCount: logs.length,
        format: 'JSON',
        ...(options.includeFilters && filters && { filters })
      },
      logs: formatted
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Export logs to XLSX format (returns data structure for xlsx library)
   */
  static exportToXlsx(logs: AuditLog[], options: ExportOptions): any[] {
    const formatted = this.formatLogs(logs, options);
    
    const data: any[] = [];
    
    // Add metadata if filters are included
    if (options.includeFilters) {
      data.push(['导出信息']);
      data.push(['导出时间', new Date().toLocaleString('zh-CN')]);
      data.push(['记录数量', logs.length]);
      data.push(['导出格式', 'Excel']);
      data.push([]); // Empty row
    }

    // Add headers if requested
    if (options.includeHeaders) {
      data.push([
        'ID',
        '设备ID',
        '会话ID',
        '操作类型',
        '操作数据',
        '结果',
        '时间',
        '严重程度',
        '持续时间'
      ]);
    }

    // Add data rows
    formatted.forEach(log => {
      data.push([
        log.id,
        log.deviceId,
        log.sessionId,
        log.actionType,
        log.actionData,
        log.result,
        log.formattedTimestamp,
        log.severity,
        log.duration || '-'
      ]);
    });

    return data;
  }

  /**
   * Generate filename with timestamp
   */
  static generateFilename(baseFilename: string, format: ExportFormat): string {
    const timestamp = new Date().toISOString().split('T')[0];
    const extension = format === 'csv' ? '.csv' : format === 'json' ? '.json' : '.xlsx';
    
    return `${baseFilename}-${timestamp}${extension}`;
  }

  /**
   * Download file to user's computer
   */
  static downloadFile(content: string | Blob, filename: string, mimeType: string): void {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up the URL object
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  /**
   * Get MIME type for export format
   */
  static getMimeType(format: ExportFormat): string {
    switch (format) {
      case 'csv':
        return 'text/csv;charset=utf-8';
      case 'json':
        return 'application/json;charset=utf-8';
      case 'xlsx':
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      default:
        return 'text/plain;charset=utf-8';
    }
  }
}