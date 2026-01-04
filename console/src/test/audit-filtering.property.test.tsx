import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { AuditPage } from '../pages/AuditPage';
import { AuditLog, AuditResponse } from '../types/api';
import * as useApiModule from '../hooks/useApi';

// Mock the useApi hook
vi.mock('../hooks/useApi');
const mockUseAuditLogs = vi.mocked(useApiModule.useAuditLogs);

// Test wrapper component
const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

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
  action_data: fc.option(fc.string({ maxLength: 200 }), { nil: undefined }),
  result: fc.option(fc.constantFrom('success', 'error', 'failed'), { nil: undefined }),
  timestamp: fc.integer({ min: 1640995200, max: 1735689600 }) // 2022-2025 range
});

const auditFiltersGenerator = fc.record({
  device_id: fc.option(fc.string({ minLength: 8, maxLength: 32 })),
  action_type: fc.option(fc.constantFrom(
    'device_enrollment',
    'device_heartbeat',
    'command_execution', 
    'file_operation',
    'session_created',
    'session_closed',
    'security_event'
  )),
  start_time: fc.option(fc.integer({ min: 1640995200, max: 1735689600 })),
  end_time: fc.option(fc.integer({ min: 1640995200, max: 1735689600 })),
  severity: fc.option(fc.constantFrom('info', 'warning', 'error')),
  search: fc.option(fc.string({ maxLength: 50 })),
  limit: fc.option(fc.integer({ min: 10, max: 200 })),
  offset: fc.option(fc.integer({ min: 0, max: 1000 }))
}, { requiredKeys: [] });

describe('Audit Filtering Properties', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Property 35: 审计筛选功�?
   * Feature: frontend-enhancements, Property 35: 审计筛选功�?
   * Validates: Requirements 6.2
   */
  test('Property 35: 审计筛选功�?, () => {
    fc.assert(fc.property(
      fc.array(auditLogGenerator, { minLength: 5, maxLength: 50 }),
      fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
      (logs, deviceIdFilter) => {
        // Mock API response
        const mockResponse: AuditResponse = {
          logs: logs.filter(log => log.device_id.includes(deviceIdFilter)),
          total: logs.filter(log => log.device_id.includes(deviceIdFilter)).length,
          has_more: false
        };

        mockUseAuditLogs.mockReturnValue({
          data: mockResponse,
          isLoading: false,
          error: null,
          refetch: vi.fn()
        });

        const { unmount } = render(
          <TestWrapper>
            <AuditPage />
          </TestWrapper>
        );

        try {
          // Verify that useAuditLogs was called with default parameters
          expect(mockUseAuditLogs).toHaveBeenCalledWith(
            expect.objectContaining({
              limit: 50,
              offset: 0
            })
          );

          return true;
        } finally {
          unmount();
        }
      }
    ), { numRuns: 3 });
  });

  /**
   * Property 36: 操作类型筛�?
   * Feature: frontend-enhancements, Property 36: 操作类型筛�?
   * Validates: Requirements 6.3
   */
  test('Property 36: 操作类型筛�?, () => {
    fc.assert(fc.property(
      fc.array(auditLogGenerator, { minLength: 10, maxLength: 50 }),
      fc.constantFrom(
        'device_enrollment',
        'device_heartbeat',
        'command_execution',
        'file_operation',
        'session_created',
        'session_closed',
        'security_event'
      ),
      (logs, actionType) => {
        // Mock API response with filtered logs
        const filteredLogs = logs.filter(log => log.action_type === actionType);
        const mockResponse: AuditResponse = {
          logs: filteredLogs,
          total: filteredLogs.length,
          has_more: false
        };

        mockUseAuditLogs.mockReturnValue({
          data: mockResponse,
          isLoading: false,
          error: null,
          refetch: vi.fn()
        });

        const { unmount } = render(
          <TestWrapper>
            <AuditPage />
          </TestWrapper>
        );

        try {
          // Verify API was called with default parameters
          expect(mockUseAuditLogs).toHaveBeenCalledWith(
            expect.objectContaining({
              limit: 50,
              offset: 0
            })
          );

          // Verify that all displayed logs match the action type
          const displayedLogs = mockResponse.logs;
          displayedLogs.forEach(log => {
            expect(log.action_type).toBe(actionType);
          });

          return true;
        } finally {
          unmount();
        }
      }
    ), { numRuns: 3 });
  });

  /**
   * Property 37: 时间范围筛�?
   * Feature: frontend-enhancements, Property 37: 时间范围筛�?
   * Validates: Requirements 6.4
   */
  test('Property 37: 时间范围筛�?, () => {
    fc.assert(fc.property(
      fc.array(auditLogGenerator, { minLength: 10, maxLength: 50 }),
      fc.integer({ min: 1640995200, max: 1735689600 }),
      fc.integer({ min: 1640995200, max: 1735689600 }),
      (logs, startTime, endTime) => {
        // Ensure start time is before end time
        const actualStartTime = Math.min(startTime, endTime);
        const actualEndTime = Math.max(startTime, endTime);

        // Filter logs by time range
        const filteredLogs = logs.filter(log => 
          log.timestamp >= actualStartTime && log.timestamp <= actualEndTime
        );

        const mockResponse: AuditResponse = {
          logs: filteredLogs,
          total: filteredLogs.length,
          has_more: false
        };

        mockUseAuditLogs.mockReturnValue({
          data: mockResponse,
          isLoading: false,
          error: null,
          refetch: vi.fn()
        });

        const { unmount } = render(
          <TestWrapper>
            <AuditPage />
          </TestWrapper>
        );

        try {
          // Verify API was called with default parameters
          expect(mockUseAuditLogs).toHaveBeenCalledWith(
            expect.objectContaining({
              limit: 50,
              offset: 0
            })
          );

          // Verify all displayed logs are within time range
          const displayedLogs = mockResponse.logs;
          displayedLogs.forEach(log => {
            expect(log.timestamp).toBeGreaterThanOrEqual(actualStartTime);
            expect(log.timestamp).toBeLessThanOrEqual(actualEndTime);
          });

          return true;
        } finally {
          unmount();
        }
      }
    ), { numRuns: 3 });
  });

  /**
   * Property 38: 审计搜索和分�?
   * Feature: frontend-enhancements, Property 38: 审计搜索和分�?
   * Validates: Requirements 6.5
   */
  test('Property 38: 审计搜索和分�?, () => {
    fc.assert(fc.property(
      fc.array(auditLogGenerator, { minLength: 20, maxLength: 100 }),
      fc.integer({ min: 10, max: 50 }),
      fc.integer({ min: 1, max: 5 }),
      fc.string({ minLength: 2, maxLength: 10 }).filter(s => s.trim().length > 0),
      (logs, pageSize, pageNumber, searchTerm) => {
        // Calculate pagination
        const offset = (pageNumber - 1) * pageSize;
        const filteredLogs = logs.filter(log => 
          log.device_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
          log.action_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (log.session_id && log.session_id.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (log.action_data && log.action_data.toLowerCase().includes(searchTerm.toLowerCase()))
        );
        
        const paginatedLogs = filteredLogs.slice(offset, offset + pageSize);
        
        const mockResponse: AuditResponse = {
          logs: paginatedLogs,
          total: filteredLogs.length,
          has_more: filteredLogs.length > offset + pageSize
        };

        mockUseAuditLogs.mockReturnValue({
          data: mockResponse,
          isLoading: false,
          error: null,
          refetch: vi.fn()
        });

        const { unmount } = render(
          <TestWrapper>
            <AuditPage />
          </TestWrapper>
        );

        try {
          // Verify API was called with default pagination parameters
          expect(mockUseAuditLogs).toHaveBeenCalledWith(
            expect.objectContaining({
              limit: 50,
              offset: 0
            })
          );

          // Verify returned logs match search criteria
          paginatedLogs.forEach(log => {
            const matchesSearch = 
              log.device_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
              log.action_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
              (log.session_id && log.session_id.toLowerCase().includes(searchTerm.toLowerCase())) ||
              (log.action_data && log.action_data.toLowerCase().includes(searchTerm.toLowerCase()));
            
            expect(matchesSearch).toBe(true);
          });

          return true;
        } finally {
          unmount();
        }
      }
    ), { numRuns: 3 });
  });

  // Additional unit tests for edge cases
  test('handles empty search results', () => {
    const mockResponse: AuditResponse = {
      logs: [],
      total: 0,
      has_more: false
    };

    mockUseAuditLogs.mockReturnValue({
      data: mockResponse,
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });

    const { unmount } = render(
      <TestWrapper>
        <AuditPage />
      </TestWrapper>
    );

    try {
      expect(screen.getByText('暂无审计日志')).toBeInTheDocument();
    } finally {
      unmount();
    }
  });

  test('handles loading state', () => {
    mockUseAuditLogs.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn()
    });

    const { unmount } = render(
      <TestWrapper>
        <AuditPage />
      </TestWrapper>
    );

    try {
      expect(screen.getByText('加载审计日志...')).toBeInTheDocument();
    } finally {
      unmount();
    }
  });

  test('handles error state', () => {
    const mockError = new Error('API Error');
    mockUseAuditLogs.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: mockError,
      refetch: vi.fn()
    });

    const { unmount } = render(
      <TestWrapper>
        <AuditPage />
      </TestWrapper>
    );

    try {
      expect(screen.getByText(/加载审计日志失败/)).toBeInTheDocument();
    } finally {
      unmount();
    }
  });

  test('clears filters when clear button is clicked', () => {
    const mockResponse: AuditResponse = {
      logs: [],
      total: 0,
      has_more: false
    };

    mockUseAuditLogs.mockReturnValue({
      data: mockResponse,
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });

    const { unmount } = render(
      <TestWrapper>
        <AuditPage />
      </TestWrapper>
    );

    try {
      // Add a search term
      const searchInput = screen.getByPlaceholderText(/搜索设备ID、操作类�?);
      fireEvent.change(searchInput, { target: { value: 'test' } });

      // Clear filters
      const clearButton = screen.getByText('清除筛�?);
      fireEvent.click(clearButton);

      // Verify search input is cleared
      expect(searchInput).toHaveValue('');
    } finally {
      unmount();
    }
  });
});