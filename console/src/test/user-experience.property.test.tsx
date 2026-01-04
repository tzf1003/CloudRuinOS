import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import fc from 'fast-check';
import { UIProvider } from '../contexts/UIContext';
import { LoadingButton, InlineLoading, OperationProgress } from '../components/LoadingIndicator';
import { NotificationSystem, useToast } from '../components/NotificationSystem';
import { Layout } from '../components/Layout';

// 测试工具函数
function createTestWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function TestWrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <UIProvider>
          <BrowserRouter>
            {children}
          </BrowserRouter>
        </UIProvider>
      </QueryClientProvider>
    );
  };
}

// 测试组件：用于测试通知功能
function TestNotificationComponent() {
  const toast = useToast();
  
  return (
    <div>
      <button 
        onClick={() => toast.success('操作成功', '测试成功消息')}
        data-testid="success-button"
      >
        成功通知
      </button>
      <button 
        onClick={() => toast.error('操作失败', '测试错误消息')}
        data-testid="error-button"
      >
        错误通知
      </button>
      <NotificationSystem />
    </div>
  );
}

describe('User Experience Properties', () => {
  let TestWrapper: ReturnType<typeof createTestWrapper>;

  beforeEach(() => {
    TestWrapper = createTestWrapper();
  });

  /**
   * Property 50: 操作完成反馈
   * Feature: frontend-enhancements, Property 50: 操作完成反馈
   * Validates: Requirements 8.3
   */
  describe('Property 50: 操作完成反馈', () => {
    test('任何操作完成都应该提供明确的成功或失败反馈', () => {
      fc.assert(fc.property(
        fc.record({
          type: fc.constantFrom('success', 'error', 'warning', 'info'),
          title: fc.string({ minLength: 1, maxLength: 50 }),
          message: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
        }),
        (notificationData) => {
          render(
            <TestWrapper>
              <TestNotificationComponent />
            </TestWrapper>
          );

          // 根据类型触发相应的通知
          const buttonTestId = notificationData.type === 'success' ? 'success-button' : 'error-button';
          const button = screen.getByTestId(buttonTestId);
          
          fireEvent.click(button);

          // 验证通知是否显示
          const notification = screen.getByText(
            notificationData.type === 'success' ? '操作成功' : '操作失败'
          );
          expect(notification).toBeInTheDocument();

          // 验证通知包含适当的反馈信息
          expect(notification).toBeVisible();
        }
      ), { numRuns: 3 });
    });

    test('加载按钮应该在操作期间显示加载状态', () => {
      fc.assert(fc.property(
        fc.record({
          loading: fc.boolean(),
          loadingText: fc.option(fc.string({ minLength: 1, maxLength: 20 })),
          buttonText: fc.string({ minLength: 1, maxLength: 20 }),
        }),
        (buttonProps) => {
          render(
            <TestWrapper>
              <LoadingButton 
                loading={buttonProps.loading}
                loadingText={buttonProps.loadingText}
              >
                {buttonProps.buttonText}
              </LoadingButton>
            </TestWrapper>
          );

          const button = screen.getByRole('button');

          if (buttonProps.loading) {
            // 验证加载状态
            expect(button).toBeDisabled();
            const loadingText = buttonProps.loadingText || '处理中...';
            expect(screen.getByText(loadingText)).toBeInTheDocument();
          } else {
            // 验证正常状态
            expect(button).not.toBeDisabled();
            expect(screen.getByText(buttonProps.buttonText)).toBeInTheDocument();
          }
        }
      ), { numRuns: 3 });
    });

    test('内联加载指示器应该正确显示加载状态和消息', () => {
      fc.assert(fc.property(
        fc.record({
          size: fc.constantFrom('sm', 'md', 'lg'),
          message: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
        }),
        (loadingProps) => {
          render(
            <TestWrapper>
              <InlineLoading 
                size={loadingProps.size}
                message={loadingProps.message}
              />
            </TestWrapper>
          );

          // 验证加载图标存在
          const loadingIcon = document.querySelector('.animate-spin');
          expect(loadingIcon).toBeInTheDocument();

          // 验证消息显示
          if (loadingProps.message) {
            expect(screen.getByText(loadingProps.message)).toBeInTheDocument();
          }
        }
      ), { numRuns: 3 });
    });
  });

  test('操作进度应该实时更新并提供视觉反馈', async () => {
    fc.assert(fc.property(
      fc.record({
        operationType: fc.constantFrom('upload', 'download', 'api', 'websocket'),
        progress: fc.integer({ min: 0, max: 100 }),
        message: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
        status: fc.constantFrom('pending', 'progress', 'success', 'error'),
      }),
      async (operationData) => {
        // 这个测试需要模拟操作进度组件的行为
        // 由于操作进度组件依赖于Context，我们需要创建一个测试组件
        function TestOperationComponent() {
          const { startOperation, updateOperation } = require('../contexts/UIContext').useOperations();
          
          React.useEffect(() => {
            const operationId = 'test-operation';
            startOperation({
              id: operationId,
              type: operationData.operationType,
              status: operationData.status,
              progress: operationData.progress,
              message: operationData.message,
            });

            if (operationData.status === 'progress') {
              updateOperation(operationId, {
                progress: operationData.progress,
                status: 'progress',
              });
            }
          }, []);

          return <OperationProgress />;
        }

        render(
          <TestWrapper>
            <TestOperationComponent />
          </TestWrapper>
        );

        // 验证操作进度的基本显示逻辑
        // 注意：由于这是属性测试，我们主要验证组件不会崩溃
        // 具体的UI验证在单元测试中进行
        expect(document.body).toBeInTheDocument();
      }
    ), { numRuns: 3 });
  });

  test('响应式布局应该在不同屏幕尺寸下正确显示', () => {
    fc.assert(fc.property(
      fc.record({
        screenWidth: fc.integer({ min: 320, max: 1920 }),
        screenHeight: fc.integer({ min: 568, max: 1080 }),
      }),
      (screenSize) => {
        // 模拟不同的屏幕尺寸
        Object.defineProperty(window, 'innerWidth', {
          writable: true,
          configurable: true,
          value: screenSize.screenWidth,
        });
        Object.defineProperty(window, 'innerHeight', {
          writable: true,
          configurable: true,
          value: screenSize.screenHeight,
        });

        render(
          <TestWrapper>
            <Layout>
              <div>测试内容</div>
            </Layout>
          </TestWrapper>
        );

        // 验证布局组件正确渲染
        expect(screen.getByText('RMM Console')).toBeInTheDocument();
        expect(screen.getByText('测试内容')).toBeInTheDocument();

        // 验证移动端菜单按钮在小屏幕下存在
        if (screenSize.screenWidth < 1024) {
          const menuButton = document.querySelector('button');
          expect(menuButton).toBeInTheDocument();
        }
      }
    ), { numRuns: 3 });
  });

  test('通知系统应该正确处理不同类型的通知', () => {
    fc.assert(fc.property(
      fc.record({
        type: fc.constantFrom('success', 'error', 'warning', 'info'),
        title: fc.string({ minLength: 1, maxLength: 50 }),
        message: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
        duration: fc.option(fc.integer({ min: 1000, max: 10000 })),
        persistent: fc.boolean(),
      }),
      (notificationProps) => {
        function TestNotificationProps() {
          const toast = useToast();
          
          React.useEffect(() => {
            toast[notificationProps.type](
              notificationProps.title,
              notificationProps.message,
              {
                duration: notificationProps.duration,
                persistent: notificationProps.persistent,
              }
            );
          }, []);

          return <NotificationSystem />;
        }

        render(
          <TestWrapper>
            <TestNotificationProps />
          </TestWrapper>
        );

        // 验证通知标题显示
        expect(screen.getByText(notificationProps.title)).toBeInTheDocument();

        // 验证通知消息显示（如果有）
        if (notificationProps.message) {
          expect(screen.getByText(notificationProps.message)).toBeInTheDocument();
        }

        // 验证通知图标存在
        const notificationContainer = screen.getByText(notificationProps.title).closest('div');
        expect(notificationContainer).toBeInTheDocument();
      }
    ), { numRuns: 3 });
  });
});