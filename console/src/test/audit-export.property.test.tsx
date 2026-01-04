import { describe, test, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { AuditLogFormatter } from '../lib/audit-formatter';
import { AuditLog } from '../types/api';
import { ExportOptions } from '../components/AuditExport';

// Generators for property-based testing
const auditLogGenerator = fc.record({
  id: fc.integer({ min: 1, max: 10000 }),
  device_id: fc.string({ minLength: 8, maxLength: 32 }).map(s => s.replace(/[^a-zA-Z0-9]/g, '')),
  session_id: fc.option(fc.string({ minLength: 8, maxLength: 32 }), { nil: undefined }),
  action_type: fc.constantFrom(
    'device_enrollment',
    'device_heartbeat', 
    'command_execution',
    'file_operation',
    'session_created',
    'session_closed',
    'security_event'
  ),
  action_data: fc.option(fc.oneof(
    fc.string({ maxLength: 200 }),
    fc.jsonValue().map(v => JSON.stringify(v))
  ), { nil: undefined }),
  result: fc.option(fc.constantFrom('success', 'error', 'failed', 'timeout', 'cancelled'), { nil: undefined }),
  timestamp: fc.integer({ min: 1640995200, max: 1735689600 }) // 2022-2025 range
});

const exportOptionsGenerator = fc.record({
  includeHeaders: fc.boolean(),
  dateFormat: fc.constantFrom('iso', 'readable', 'timestamp'),
  includeFilters: fc.boolean(),
  maxRecords: fc.option(fc.integer({ min: 1, max: 1000 })),
  filename: fc.option(fc.string({ minLength: 1, maxLength: 50 }))
});

const auditFiltersGenerator = fc.record({
  device_id: fc.option(fc.string({ minLength: 8, maxLength: 32 }), { nil: undefined }),
  action_type: fc.option(fc.constantFrom(
    'device_enrollment',
    'device_heartbeat',
    'command_execution', 
    'file_operation',
    'session_created',
    'session_closed',
    'security_event'
  ), { nil: undefined }),
  start_time: fc.option(fc.integer({ min: 1640995200, max: 1735689600 }), { nil: undefined }),
  end_time: fc.option(fc.integer({ min: 1640995200, max: 1735689600 }), { nil: undefined }),
  severity: fc.option(fc.constantFrom('info', 'warning', 'error'), { nil: undefined }),
  search: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
  limit: fc.option(fc.integer({ min: 10, max: 200 }), { nil: undefined }),
  offset: fc.option(fc.integer({ min: 0, max: 1000 }), { nil: undefined })
}, { requiredKeys: [] });

describe('Audit Log Processing Properties', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Property 39: 审计结果格式�?
   * Feature: frontend-enhancements, Property 39: 审计结果格式�?
   * Validates: Requirements 6.6
   */
  test('Property 39: 审计结果格式�?, () => {
    fc.assert(fc.property(
      fc.array(auditLogGenerator, { minLength: 1, maxLength: 100 }),
      exportOptionsGenerator,
      (logs, options) => {
        // Format the logs
        const formatted = AuditLogFormatter.formatLogs(logs, options);

        // Verify that all logs are formatted
        expect(formatted).toHaveLength(logs.length);

        // Verify each formatted log has required properties
        formatted.forEach((formattedLog, index) => {
          const originalLog = logs[index];

          // Basic properties should be preserved
          expect(formattedLog.id).toBe(originalLog.id);
          expect(formattedLog.deviceId).toBe(originalLog.device_id);
          expect(formattedLog.sessionId).toBe(originalLog.session_id || '-');

          // Action type should be formatted to Chinese
          expect(formattedLog.actionType).toBeDefined();
          expect(typeof formattedLog.actionType).toBe('string');

          // Action data should be formatted (not undefined)
          expect(formattedLog.actionData).toBeDefined();
          expect(typeof formattedLog.actionData).toBe('string');

          // Result should be formatted
          expect(formattedLog.result).toBeDefined();
          expect(typeof formattedLog.result).toBe('string');

          // Timestamps should be formatted according to options
          expect(formattedLog.timestamp).toBe(originalLog.timestamp.toString());
          expect(formattedLog.formattedTimestamp).toBeDefined();
          expect(typeof formattedLog.formattedTimestamp).toBe('string');

          // Severity should be inferred
          expect(formattedLog.severity).toBeDefined();
          expect(['info', 'warning', 'error']).toContain(formattedLog.severity);

          // Duration is optional but should be string if present
          if (formattedLog.duration !== undefined) {
            expect(typeof formattedLog.duration).toBe('string');
          }
        });

        return true;
      }
    ), { numRuns: 3 });
  });

  /**
   * Property 40: 审计日志导出
   * Feature: frontend-enhancements, Property 40: 审计日志导出
   * Validates: Requirements 6.7
   */
  test('Property 40: 审计日志导出 - CSV格式', () => {
    fc.assert(fc.property(
      fc.array(auditLogGenerator, { minLength: 1, maxLength: 50 }),
      exportOptionsGenerator,
      auditFiltersGenerator,
      (logs, options, _filters) => {
        // Export to CSV
        const csvContent = AuditLogFormatter.exportToCsv(logs, options);

        // Verify CSV content is a string
        expect(typeof csvContent).toBe('string');
        expect(csvContent.length).toBeGreaterThan(0);

        // Split into lines
        const lines = csvContent.split('\n').filter(line => line.trim().length > 0);

        // If headers are included, verify header line exists
        if (options.includeHeaders) {
          const headerLine = lines.find(line => line.includes('ID') && line.includes('设备ID'));
          expect(headerLine).toBeDefined();
        }

        // If filters are included, verify metadata comments exist
        if (options.includeFilters) {
          const metadataLines = lines.filter(line => line.startsWith('#'));
          expect(metadataLines.length).toBeGreaterThan(0);
        }

        // Verify data rows exist (should have at least as many data rows as logs)
        const dataLines = lines.filter(line => 
          !line.startsWith('#') && 
          (!options.includeHeaders || !line.includes('设备ID'))
        );
        expect(dataLines.length).toBeGreaterThanOrEqual(logs.length);

        // Verify each data line has the expected number of columns
        // Note: CSV columns may vary due to commas in data fields
        dataLines.forEach(line => {
          const columns = line.split(',');
          expect(columns.length).toBeGreaterThanOrEqual(9);
        });

        return true;
      }
    ), { numRuns: 3 });
  });

  test('Property 40: 审计日志导出 - JSON格式', () => {
    fc.assert(fc.property(
      fc.array(auditLogGenerator, { minLength: 1, maxLength: 50 }),
      exportOptionsGenerator,
      auditFiltersGenerator,
      (logs, options, filters) => {
        // Export to JSON
        const jsonContent = AuditLogFormatter.exportToJson(logs, options, filters);

        // Verify JSON content is valid
        expect(typeof jsonContent).toBe('string');
        expect(jsonContent.length).toBeGreaterThan(0);

        // Parse JSON to verify it's valid
        const parsed = JSON.parse(jsonContent);
        expect(parsed).toBeDefined();
        expect(typeof parsed).toBe('object');

        // Verify structure
        expect(parsed.metadata).toBeDefined();
        expect(parsed.logs).toBeDefined();
        expect(Array.isArray(parsed.logs)).toBe(true);

        // Verify metadata
        expect(parsed.metadata.exportTime).toBeDefined();
        expect(parsed.metadata.recordCount).toBe(logs.length);
        expect(parsed.metadata.format).toBe('JSON');

        // If filters are included, verify they exist in metadata
        if (options.includeFilters) {
          expect(parsed.metadata.filters).toBeDefined();
        }

        // Verify logs data
        expect(parsed.logs).toHaveLength(logs.length);
        parsed.logs.forEach((log: any, index: number) => {
          const originalLog = logs[index];
          expect(log.id).toBe(originalLog.id);
          expect(log.deviceId).toBe(originalLog.device_id);
        });

        return true;
      }
    ), { numRuns: 3 });
  });

  test('Property 40: 审计日志导出 - XLSX格式', () => {
    fc.assert(fc.property(
      fc.array(auditLogGenerator, { minLength: 1, maxLength: 50 }),
      exportOptionsGenerator,
      (logs, options) => {
        // Export to XLSX (returns array structure)
        const xlsxData = AuditLogFormatter.exportToXlsx(logs, options);

        // Verify XLSX data is an array
        expect(Array.isArray(xlsxData)).toBe(true);
        expect(xlsxData.length).toBeGreaterThan(0);

        // Count expected rows
        let expectedRows = logs.length;
        if (options.includeHeaders) expectedRows += 1;
        if (options.includeFilters) expectedRows += 5; // Metadata rows

        expect(xlsxData.length).toBeGreaterThanOrEqual(expectedRows);

        // If headers are included, verify header row
        if (options.includeHeaders) {
          const headerRow = xlsxData.find(row => 
            Array.isArray(row) && row.includes('ID') && row.includes('设备ID')
          );
          expect(headerRow).toBeDefined();
        }

        // Verify data rows
        const dataRows = xlsxData.filter(row => 
          Array.isArray(row) && 
          row.length >= 9 && 
          typeof row[0] === 'number' // ID should be number
        );
        expect(dataRows.length).toBe(logs.length);

        return true;
      }
    ), { numRuns: 3 });
  });

  // Test specific formatting functions
  describe('Formatting Functions', () => {
    test('formatActionType converts action types to Chinese', () => {
      fc.assert(fc.property(
        fc.constantFrom(
          'device_enrollment',
          'device_heartbeat',
          'command_execution',
          'file_operation',
          'session_created',
          'session_closed',
          'security_event'
        ),
        (actionType) => {
          const formatted = AuditLogFormatter.formatActionType(actionType);
          expect(typeof formatted).toBe('string');
          expect(formatted.length).toBeGreaterThan(0);
          
          // Should be different from original (translated to Chinese)
          const chineseMap: Record<string, string> = {
            'device_enrollment': '设备注册',
            'device_heartbeat': '设备心跳',
            'command_execution': '命令执行',
            'file_operation': '文件操作',
            'session_created': '会话创建',
            'session_closed': '会话关闭',
            'security_event': '安全事件'
          };
          
          expect(formatted).toBe(chineseMap[actionType]);
          return true;
        }
      ), { numRuns: 3 });
    });

    test('formatResult converts results to Chinese', () => {
      fc.assert(fc.property(
        fc.constantFrom('success', 'error', 'failed', 'timeout', 'cancelled', 'pending'),
        (result) => {
          const formatted = AuditLogFormatter.formatResult(result);
          expect(typeof formatted).toBe('string');
          expect(formatted.length).toBeGreaterThan(0);
          
          const resultMap: Record<string, string> = {
            'success': '成功',
            'error': '错误',
            'failed': '失败',
            'timeout': '超时',
            'cancelled': '已取�?,
            'pending': '处理�?
          };
          
          expect(formatted).toBe(resultMap[result]);
          return true;
        }
      ), { numRuns: 3 });
    });

    test('formatTimestamp handles different formats correctly', () => {
      fc.assert(fc.property(
        fc.integer({ min: 1640995200, max: 1735689600 }),
        fc.constantFrom('iso', 'readable', 'timestamp'),
        (timestamp, format) => {
          const formatted = AuditLogFormatter.formatTimestamp(timestamp, format);
          expect(typeof formatted).toBe('string');
          expect(formatted.length).toBeGreaterThan(0);

          switch (format) {
            case 'iso':
              // Should be ISO format
              expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
              break;
            case 'timestamp':
              // Should be the original timestamp as string
              expect(formatted).toBe(timestamp.toString());
              break;
            case 'readable':
              // Should be readable format (contains date and time)
              expect(formatted).toMatch(/\d{4}\/\d{2}\/\d{2}/);
              break;
          }

          return true;
        }
      ), { numRuns: 3 });
    });

    test('inferSeverity assigns correct severity levels', () => {
      fc.assert(fc.property(
        auditLogGenerator,
        (log) => {
          const severity = AuditLogFormatter.inferSeverity(log);
          expect(['info', 'warning', 'error']).toContain(severity);

          // Error results should map to error severity
          if (log.result === 'error' || log.result === 'failed') {
            expect(severity).toBe('error');
          }

          // Security events should be warning or error
          if (log.action_type === 'security_event') {
            expect(['warning', 'error']).toContain(severity);
          }

          return true;
        }
      ), { numRuns: 3 });
    });

    test('formatActionData handles various data types', () => {
      fc.assert(fc.property(
        fc.oneof(
          fc.constant(undefined),
          fc.string({ maxLength: 200 }),
          fc.jsonValue().map(v => JSON.stringify(v))
        ),
        (actionData) => {
          const formatted = AuditLogFormatter.formatActionData(actionData);
          expect(typeof formatted).toBe('string');

          if (!actionData) {
            expect(formatted).toBe('-');
          } else {
            expect(formatted.length).toBeGreaterThan(0);
            // Should not be longer than reasonable display length (allow some flexibility)
            expect(formatted.length).toBeLessThanOrEqual(210);
          }

          return true;
        }
      ), { numRuns: 3 });
    });

    test('generateFilename creates valid filenames', () => {
      fc.assert(fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        fc.constantFrom('csv', 'json', 'xlsx'),
        (baseFilename, format) => {
          const filename = AuditLogFormatter.generateFilename(baseFilename, format);
          expect(typeof filename).toBe('string');
          expect(filename.length).toBeGreaterThan(0);

          // Should contain the base filename
          expect(filename).toContain(baseFilename);

          // Should have correct extension
          const expectedExtension = format === 'csv' ? '.csv' : 
                                  format === 'json' ? '.json' : '.xlsx';
          expect(filename).toMatch(new RegExp(`\\${expectedExtension}$`));

          // Should contain a date
          expect(filename).toMatch(/\d{4}-\d{2}-\d{2}/);

          return true;
        }
      ), { numRuns: 3 });
    });

    test('getMimeType returns correct MIME types', () => {
      fc.assert(fc.property(
        fc.constantFrom('csv', 'json', 'xlsx'),
        (format) => {
          const mimeType = AuditLogFormatter.getMimeType(format);
          expect(typeof mimeType).toBe('string');
          expect(mimeType.length).toBeGreaterThan(0);

          const expectedMimeTypes: Record<string, string> = {
            'csv': 'text/csv;charset=utf-8',
            'json': 'application/json;charset=utf-8',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          };

          expect(mimeType).toBe(expectedMimeTypes[format]);
          return true;
        }
      ), { numRuns: 3 });
    });
  });

  // Edge cases and error handling
  describe('Edge Cases', () => {
    test('handles empty log arrays', () => {
      const emptyLogs: AuditLog[] = [];
      const options: ExportOptions = {
        includeHeaders: true,
        dateFormat: 'readable',
        includeFilters: false
      };

      const formatted = AuditLogFormatter.formatLogs(emptyLogs, options);
      expect(formatted).toHaveLength(0);

      const csvContent = AuditLogFormatter.exportToCsv(emptyLogs, options);
      expect(typeof csvContent).toBe('string');

      const jsonContent = AuditLogFormatter.exportToJson(emptyLogs, options);
      const parsed = JSON.parse(jsonContent);
      expect(parsed.logs).toHaveLength(0);
    });

    test('handles logs with null/undefined fields', () => {
      const logsWithNulls: AuditLog[] = [{
        id: 1,
        device_id: 'test-device',
        session_id: undefined,
        action_type: 'test_action',
        action_data: undefined,
        result: undefined,
        timestamp: 1640995200
      }];

      const formatted = AuditLogFormatter.formatLogs(logsWithNulls);
      expect(formatted).toHaveLength(1);
      expect(formatted[0].sessionId).toBe('-');
      expect(formatted[0].actionData).toBe('-');
      expect(formatted[0].result).toBe('-');
    });

    test('handles invalid JSON in action_data', () => {
      const logsWithInvalidJson: AuditLog[] = [{
        id: 1,
        device_id: 'test-device',
        action_type: 'test_action',
        action_data: '{ invalid json',
        timestamp: 1640995200
      }];

      const formatted = AuditLogFormatter.formatLogs(logsWithInvalidJson);
      expect(formatted).toHaveLength(1);
      expect(formatted[0].actionData).toBe('{ invalid json');
    });
  });
});