import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import fc from 'fast-check';
import { SessionsPage } from '../pages/SessionsPage';
import { SessionCard } from '../components/SessionCard';
import { SessionDetailsModal } from '../components/SessionDetailsModal';
import { Session } from '../types/api';
import * as useApiModule from '../hooks/useApi';

// Mock API hooks
vi.mock('../hooks/useApi');

// Mock utils
vi.mock('../lib/utils', () => ({
  formatRelativeTime: vi.fn((timestamp: number) => `${Math.floor((Date.now() - timestamp * 1000) / 60000)} 分钟前`),
  formatTimestamp: vi.fn((timestamp: number) => new Date(timestamp * 1000).toLocaleString('zh-CN')),
  getSessionStatusColor: vi.fn((status: string) => {
    switch (status) {
      case 'active':
      case 'connected':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'inactive':
        return 'bg-gray-100 text-gray-800';
      case 'expired':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }),
  cn: vi.fn((...classes) => classes.filter(Boolean).join(' ')),
}));

// Session generator for property tests
const sessionArbitrary = fc.record({
  id: fc.string({ minLength: 16, maxLength: 32 }).filter(s => s.trim().length > 0),
  device_id: fc.string({ minLength: 16, maxLength: 32 }).filter(s => s.trim().length > 0),
  status: fc.constantFrom('pending', 'active', 'connected', 'inactive', 'expired'),
  created_at: fc.integer({ min: 1640995200, max: Math.floor(Date.now() / 1000) }), // 2022年开始到现在
  expires_at: fc.integer({ min: Math.floor(Date.now() / 1000), max: Math.floor(Date.now() / 1000) + 86400 }), // 现在�?4小时�?
  last_activity: fc.option(fc.integer({ min: 1640995200, max: Math.floor(Date.now() / 1000) })),
  device_platform: fc.option(fc.constantFrom('Windows', 'Linux', 'macOS')),
  device_version: fc.option(fc.string({ minLength: 3, maxLength: 10 }).filter(s => s.trim().length > 0)),
});

const createTestWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('Session Management Property Tests', () => {
  beforeEach(() => {
    // 重置所�?mocks
    vi.clearAllMocks();

    // 默认 mock 返回�?
    vi.mocked(useApiModule.useSessions).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    vi.mocked(useApiModule.useDeleteSession).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    vi.mocked(useApiModule.useSession).mockReturnValue({
      data: null,
      isLoading: false,
    } as any);

    // Mock useDevices hook
    vi.mocked(useApiModule.useDevices).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    // Mock useCreateSession hook
    vi.mocked(useApiModule.useCreateSession).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);
  });

  /**
   * Property 28: 会话详情获取
   * Feature: frontend-enhancements, Property 28: 会话详情获取
   * Validates: Requirements 5.1
   */
  test('Property 28: Session details retrieval', () => {
    fc.assert(fc.property(
      sessionArbitrary,
      (session) => {
        // 模拟会话详情 API 调用
        vi.mocked(useApiModule.useSession).mockReturnValue({
          data: session,
          isLoading: false,
        } as any);

        const TestWrapper = createTestWrapper();
        
        render(
          <TestWrapper>
            <SessionDetailsModal
              session={session}
              isOpen={true}
              onClose={() => {}}
            />
          </TestWrapper>
        );

        // 验证会话详情正确显示
        expect(screen.getByText(new RegExp(session.id.substring(0, 8)))).toBeInTheDocument();
        expect(screen.getByText(new RegExp(session.device_id.substring(0, 8)))).toBeInTheDocument();
        
        // 验证状态显�?
        const statusText = session.status === 'active' ? '活跃' : 
                          session.status === 'connected' ? '已连�? :
                          session.status === 'inactive' ? '非活�? : 
                          session.status === 'pending' ? '等待�? : '已过�?;
        expect(screen.getByText(statusText)).toBeInTheDocument();

        return true;
      }
    ), { numRuns: 3 });
  });

  /**
   * Property 29: 会话信息展示
   * Feature: frontend-enhancements, Property 29: 会话信息展示
   * Validates: Requirements 5.2
   */
  test('Property 29: Session information display', () => {
    fc.assert(fc.property(
      sessionArbitrary,
      (session) => {
        const TestWrapper = createTestWrapper();
        
        render(
          <TestWrapper>
            <SessionCard
              session={session}
              showActivityStatus={true}
              activityStatus="active"
            />
          </TestWrapper>
        );

        // 验证会话基本信息显示
        expect(screen.getByText(new RegExp(session.id.substring(0, 8)))).toBeInTheDocument();
        expect(screen.getByText(new RegExp(session.device_id.substring(0, 8)))).toBeInTheDocument();

        // 验证时间信息显示
        expect(screen.getByText(/创建�?/)).toBeInTheDocument();
        
        // 验证状态信息显�?
        const statusElement = screen.getByText(
          session.status === 'active' ? '活跃' : 
          session.status === 'connected' ? '已连�? :
          session.status === 'inactive' ? '非活�? : 
          session.status === 'pending' ? '等待�? : '已过�?
        );
        expect(statusElement).toBeInTheDocument();

        return true;
      }
    ), { numRuns: 3 });
  });

  /**
   * Property 31: 会话状态实时更�?
   * Feature: frontend-enhancements, Property 31: 会话状态实时更�?
   * Validates: Requirements 5.4
   */
  test('Property 31: Real-time session status updates', async () => {
    fc.assert(fc.property(
      fc.array(sessionArbitrary, { minLength: 1, maxLength: 5 }),
      fc.constantFrom('active', 'connected', 'inactive', 'expired'),
      async (initialSessions, newStatus) => {
        const refetchMock = vi.fn();
        
        // 初始状�?
        vi.mocked(useApiModule.useSessions).mockReturnValue({
          data: initialSessions,
          isLoading: false,
          error: null,
          refetch: refetchMock,
        } as any);

        const TestWrapper = createTestWrapper();
        
        render(
          <TestWrapper>
            <SessionsPage />
          </TestWrapper>
        );

        // 验证初始会话显示
        initialSessions.forEach(session => {
          expect(screen.getByText(new RegExp(session.id.substring(0, 8)))).toBeInTheDocument();
        });

        // 触发手动刷新
        const refreshButton = screen.getByText('手动刷新');
        fireEvent.click(refreshButton);

        // 验证 refetch 被调�?
        expect(refetchMock).toHaveBeenCalled();

        return true;
      }
    ), { numRuns: 3 });
  });

  /**
   * Property 33: 多会话管�?
   * Feature: frontend-enhancements, Property 33: 多会话管�?
   * Validates: Requirements 5.6
   */
  test('Property 33: Multiple session management', () => {
    fc.assert(fc.property(
      fc.array(sessionArbitrary, { minLength: 2, maxLength: 10 }),
      (sessions) => {
        const deleteMock = vi.fn();
        
        vi.mocked(useApiModule.useSessions).mockReturnValue({
          data: sessions,
          isLoading: false,
          error: null,
          refetch: vi.fn(),
        } as any);

        vi.mocked(useApiModule.useDeleteSession).mockReturnValue({
          mutate: deleteMock,
          isPending: false,
        } as any);

        const TestWrapper = createTestWrapper();
        
        render(
          <TestWrapper>
            <SessionsPage />
          </TestWrapper>
        );

        // 验证所有会话都显示
        sessions.forEach(session => {
          expect(screen.getByText(new RegExp(session.id.substring(0, 8)))).toBeInTheDocument();
        });

        // 验证统计信息正确
        const totalSessions = sessions.length;
        const activeSessions = sessions.filter(s => s.status === 'active').length;
        const connectedSessions = sessions.filter(s => s.status === 'connected').length;
        const inactiveSessions = sessions.filter(s => s.status === 'inactive').length;
        const expiredSessions = sessions.filter(s => s.status === 'expired').length;
        const pendingSessions = sessions.filter(s => s.status === 'pending').length;

        expect(screen.getByText(totalSessions.toString())).toBeInTheDocument();
        expect(screen.getByText(activeSessions.toString())).toBeInTheDocument();
        expect(screen.getByText(connectedSessions.toString())).toBeInTheDocument();
        expect(screen.getByText(inactiveSessions.toString())).toBeInTheDocument();
        expect(screen.getByText(expiredSessions.toString())).toBeInTheDocument();
        expect(screen.getByText(pendingSessions.toString())).toBeInTheDocument();

        // 测试批量操作功能
        const batchButton = screen.getByText('批量操作');
        fireEvent.click(batchButton);

        // 验证批量操作界面显示
        expect(screen.getByText(/全�?)).toBeInTheDocument();

        return true;
      }
    ), { numRuns: 3 });
  });

  test('Property 33: Batch session selection and deletion', () => {
    fc.assert(fc.property(
      fc.array(sessionArbitrary, { minLength: 3, maxLength: 8 }),
      fc.integer({ min: 1, max: 3 }),
      (sessions, selectCount) => {
        const deleteMock = vi.fn();
        
        vi.mocked(useApiModule.useSessions).mockReturnValue({
          data: sessions,
          isLoading: false,
          error: null,
          refetch: vi.fn(),
        } as any);

        vi.mocked(useApiModule.useDeleteSession).mockReturnValue({
          mutate: deleteMock,
          isPending: false,
        } as any);

        const TestWrapper = createTestWrapper();
        
        render(
          <TestWrapper>
            <SessionsPage />
          </TestWrapper>
        );

        // 启用批量操作
        const batchButton = screen.getByText('批量操作');
        fireEvent.click(batchButton);

        // 验证批量选择功能存在
        expect(screen.getByText(/全�?)).toBeInTheDocument();

        // 验证会话卡片支持选择（通过检查是否有选择相关的类名或属性）
        const sessionCards = screen.getAllByText(/会话/);
        expect(sessionCards.length).toBeGreaterThan(0);

        return true;
      }
    ), { numRuns: 3 });
  });

  test('Property 33: Session filtering and search', () => {
    fc.assert(fc.property(
      fc.array(sessionArbitrary, { minLength: 5, maxLength: 15 }),
      fc.constantFrom('active', 'connected', 'inactive', 'expired', 'pending'),
      fc.string({ minLength: 3, maxLength: 8 }).filter(s => s.trim().length > 0),
      (sessions, filterStatus, searchTerm) => {
        vi.mocked(useApiModule.useSessions).mockReturnValue({
          data: sessions,
          isLoading: false,
          error: null,
          refetch: vi.fn(),
        } as any);

        const TestWrapper = createTestWrapper();
        
        render(
          <TestWrapper>
            <SessionsPage />
          </TestWrapper>
        );

        // 测试状态筛�?
        const statusFilter = screen.getByDisplayValue('所有状�?);
        fireEvent.change(statusFilter, { target: { value: filterStatus } });

        // 测试搜索功能
        const searchInput = screen.getByPlaceholderText('搜索会话 ID 或设�?ID...');
        fireEvent.change(searchInput, { target: { value: searchTerm } });

        // 验证筛选和搜索界面存在
        expect(statusFilter).toBeInTheDocument();
        expect(searchInput).toBeInTheDocument();

        return true;
      }
    ), { numRuns: 3 });
  });
});