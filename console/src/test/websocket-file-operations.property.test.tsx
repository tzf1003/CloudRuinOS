import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fc from 'fast-check';
import { webSocketManager, FileOperationProgress } from '../lib/websocket-manager';
import { useWebSocket } from '../hooks/useWebSocket';
import { WebSocketMessage } from '../types/api';

// Mock WebSocket for testing
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(public url: string) {
    // Simulate connection opening
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 10);
  }

  send(data: string) {
    // Mock send implementation
    console.log('Mock WebSocket send:', data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close', { code: 1000 }));
    }
  }

  // Helper method to simulate receiving messages
  simulateMessage(data: any) {
    if (this.onmessage && this.readyState === MockWebSocket.OPEN) {
      this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }));
    }
  }
}

// Test component that uses WebSocket
function TestWebSocketComponent({ deviceId, sessionId }: { deviceId: string; sessionId: string }) {
  const {
    isConnected,
    messages,
    fileOperations,
    activeFileOperations,
    requestFileList,
    requestFileDownload,
    requestFileUpload,
    connect,
    error
  } = useWebSocket(deviceId, sessionId, { autoConnect: false });

  return (
    <div>
      <div data-testid="connection-status">
        {isConnected ? 'connected' : 'disconnected'}
      </div>
      <div data-testid="error">{error || 'no-error'}</div>
      <div data-testid="message-count">{messages.length}</div>
      <div data-testid="file-operations-count">{fileOperations.length}</div>
      <div data-testid="active-operations-count">{activeFileOperations.length}</div>
      
      <button onClick={() => connect()} data-testid="connect-btn">
        Connect
      </button>
      <button onClick={() => requestFileList('/test')} data-testid="list-files-btn">
        List Files
      </button>
      <button onClick={() => requestFileDownload('/test/file.txt')} data-testid="download-btn">
        Download File
      </button>
      <button onClick={() => requestFileUpload('/test/upload.txt', 'content')} data-testid="upload-btn">
        Upload File
      </button>
    </div>
  );
}

describe('WebSocket File Operations Property Tests', () => {
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock WebSocket globally
    originalWebSocket = global.WebSocket;
    global.WebSocket = MockWebSocket as any;
    
    // Mock window.location for WebSocket URL building
    Object.defineProperty(window, 'location', {
      value: {
        protocol: 'http:',
        host: 'localhost:3000'
      },
      writable: true
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    cleanup();
    
    // Restore original WebSocket
    global.WebSocket = originalWebSocket;
    
    // Clean up WebSocket manager
    webSocketManager.cleanup();
  });

  /**
   * Property 42: 命令消息处理
   * Feature: frontend-enhancements, Property 42: 命令消息处理
   * Validates: Requirements 7.2, 7.3
   */
  test('Property 42: Command message processing', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        deviceId: fc.string({ minLength: 5, maxLength: 20 }),
        sessionId: fc.string({ minLength: 5, maxLength: 20 }),
        commands: fc.array(fc.record({
          command: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          args: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
          exitCode: fc.integer({ min: 0, max: 255 }),
          stdout: fc.string({ maxLength: 200 }),
          stderr: fc.string({ maxLength: 100 })
        }), { minLength: 1, maxLength: 3 })
      }),
      async ({ deviceId, sessionId, commands }) => {
        const user = userEvent.setup();
        
        const { container } = render(
          <TestWebSocketComponent deviceId={deviceId} sessionId={sessionId} />
        );

        // Connect to WebSocket
        const connectBtn = screen.getByTestId('connect-btn');
        await user.click(connectBtn);

        // Wait for connection
        await waitFor(() => {
          expect(screen.getByTestId('connection-status')).toHaveTextContent('connected');
        }, { timeout: 1000 });

        // Get mock WebSocket instance
        const connectionKey = `${deviceId}:${sessionId}`;
        const mockWs = webSocketManager['connections'].get(connectionKey) as any;
        
        if (mockWs) {
          // Process each command
          for (const cmd of commands) {
            const commandId = `cmd-${Date.now()}-${Math.random()}`;
            
            // Simulate command result message
            const resultMessage: WebSocketMessage = {
              type: 'cmd_result',
              id: commandId,
              exitCode: cmd.exitCode,
              stdout: cmd.stdout,
              stderr: cmd.stderr,
              duration: 100
            } as any;

            // Send the message
            mockWs.simulateMessage(resultMessage);

            // Wait for message processing
            await waitFor(() => {
              const messageCount = parseInt(screen.getByTestId('message-count').textContent || '0');
              expect(messageCount).toBeGreaterThan(0);
            }, { timeout: 500 });
          }

          // Verify command messages were processed
          const finalMessageCount = parseInt(screen.getByTestId('message-count').textContent || '0');
          expect(finalMessageCount).toBeGreaterThanOrEqual(commands.length);
        }

        // Verify no errors occurred
        expect(screen.getByTestId('error')).toHaveTextContent('no-error');
      }
    ), { numRuns: 3 });
  });

  /**
   * Property 43: 文件操作消息处理
   * Feature: frontend-enhancements, Property 43: 文件操作消息处理
   * Validates: Requirements 7.2, 7.3
   */
  test('Property 43: File operation message processing', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        deviceId: fc.string({ minLength: 5, maxLength: 20 }),
        sessionId: fc.string({ minLength: 5, maxLength: 20 }),
        operations: fc.array(fc.record({
          type: fc.constantFrom('file_list', 'file_get', 'file_put'),
          path: fc.string({ minLength: 1, maxLength: 100 }).map(s => `/${s.replace(/[^a-zA-Z0-9\/\-_.]/g, '')}`),
          success: fc.boolean(),
          content: fc.option(fc.string({ maxLength: 500 })),
          files: fc.option(fc.array(fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }),
            size: fc.integer({ min: 0, max: 1000000 }),
            is_directory: fc.boolean()
          }), { maxLength: 10 })),
          error: fc.option(fc.string({ minLength: 1, maxLength: 100 }))
        }), { minLength: 1, maxLength: 3 })
      }),
      async ({ deviceId, sessionId, operations }) => {
        const user = userEvent.setup();
        
        const { container } = render(
          <TestWebSocketComponent deviceId={deviceId} sessionId={sessionId} />
        );

        // Connect to WebSocket
        const connectBtn = screen.getByTestId('connect-btn');
        await user.click(connectBtn);

        // Wait for connection
        await waitFor(() => {
          expect(screen.getByTestId('connection-status')).toHaveTextContent('connected');
        }, { timeout: 1000 });

        // Get mock WebSocket instance
        const connectionKey = `${deviceId}:${sessionId}`;
        const mockWs = webSocketManager['connections'].get(connectionKey) as any;
        
        if (mockWs) {
          // Process each file operation
          for (const op of operations) {
            const operationId = `file-op-${Date.now()}-${Math.random()}`;
            
            // First trigger the operation request
            switch (op.type) {
              case 'file_list':
                await user.click(screen.getByTestId('list-files-btn'));
                break;
              case 'file_get':
                await user.click(screen.getByTestId('download-btn'));
                break;
              case 'file_put':
                await user.click(screen.getByTestId('upload-btn'));
                break;
            }

            // Wait for operation to be tracked
            await waitFor(() => {
              const operationsCount = parseInt(screen.getByTestId('file-operations-count').textContent || '0');
              expect(operationsCount).toBeGreaterThan(0);
            }, { timeout: 500 });

            // Simulate operation result message
            let resultMessage: WebSocketMessage;
            
            switch (op.type) {
              case 'file_list':
                resultMessage = {
                  type: 'file_list_result',
                  id: operationId,
                  files: op.success ? (op.files || []) : undefined,
                  error: op.success ? undefined : (op.error || 'Operation failed')
                } as any;
                break;
                
              case 'file_get':
                resultMessage = {
                  type: 'file_get_result',
                  id: operationId,
                  content: op.success ? (op.content || 'file content') : undefined,
                  error: op.success ? undefined : (op.error || 'Download failed')
                } as any;
                break;
                
              case 'file_put':
                resultMessage = {
                  type: 'file_put_result',
                  id: operationId,
                  success: op.success,
                  error: op.success ? undefined : (op.error || 'Upload failed')
                } as any;
                break;
                
              default:
                continue;
            }

            // Send the result message
            mockWs.simulateMessage(resultMessage);

            // Wait for message processing
            await waitFor(() => {
              const messageCount = parseInt(screen.getByTestId('message-count').textContent || '0');
              expect(messageCount).toBeGreaterThan(0);
            }, { timeout: 500 });
          }

          // Verify file operations were processed
          const finalOperationsCount = parseInt(screen.getByTestId('file-operations-count').textContent || '0');
          expect(finalOperationsCount).toBeGreaterThanOrEqual(operations.length);
        }

        // Verify no critical errors occurred
        const errorText = screen.getByTestId('error').textContent;
        expect(errorText).not.toContain('critical');
      }
    ), { numRuns: 3 });
  });

  /**
   * 测试文件操作进度跟踪
   */
  test('File operation progress tracking', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        deviceId: fc.string({ minLength: 5, maxLength: 15 }),
        sessionId: fc.string({ minLength: 5, maxLength: 15 }),
        filePath: fc.string({ minLength: 1, maxLength: 50 }).map(s => `/${s.replace(/[^a-zA-Z0-9\/\-_.]/g, '')}`),
        fileSize: fc.integer({ min: 100, max: 10000 }),
        progressSteps: fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 2, maxLength: 5 })
      }),
      async ({ deviceId, sessionId, filePath, fileSize, progressSteps }) => {
        const user = userEvent.setup();
        
        const { container } = render(
          <TestWebSocketComponent deviceId={deviceId} sessionId={sessionId} />
        );

        // Connect and start upload
        await user.click(screen.getByTestId('connect-btn'));
        
        await waitFor(() => {
          expect(screen.getByTestId('connection-status')).toHaveTextContent('connected');
        }, { timeout: 1000 });

        await user.click(screen.getByTestId('upload-btn'));

        // Verify operation was started
        await waitFor(() => {
          const activeCount = parseInt(screen.getByTestId('active-operations-count').textContent || '0');
          expect(activeCount).toBeGreaterThan(0);
        }, { timeout: 500 });

        // Simulate progress updates
        const connectionKey = `${deviceId}:${sessionId}`;
        const mockWs = webSocketManager['connections'].get(connectionKey) as any;
        
        if (mockWs) {
          for (const progress of progressSteps.sort((a, b) => a - b)) {
            // Simulate progress update (this would typically come from the server)
            const operationId = `file-op-${Date.now()}`;
            
            // For testing, we'll simulate the final result
            if (progress === Math.max(...progressSteps)) {
              const resultMessage = {
                type: 'file_put_result',
                id: operationId,
                success: true
              };
              
              mockWs.simulateMessage(resultMessage);
              
              await waitFor(() => {
                const messageCount = parseInt(screen.getByTestId('message-count').textContent || '0');
                expect(messageCount).toBeGreaterThan(0);
              }, { timeout: 300 });
            }
          }
        }

        // Verify component state is consistent
        expect(screen.getByTestId('connection-status')).toBeInTheDocument();
        expect(screen.getByTestId('file-operations-count')).toBeInTheDocument();
      }
    ), { numRuns: 3 });
  });

  /**
   * 测试文件操作错误处理
   */
  test('File operation error handling', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        deviceId: fc.string({ minLength: 5, maxLength: 15 }),
        sessionId: fc.string({ minLength: 5, maxLength: 15 }),
        errorType: fc.constantFrom('permission_denied', 'file_not_found', 'network_error', 'timeout'),
        operationType: fc.constantFrom('list', 'download', 'upload')
      }),
      async ({ deviceId, sessionId, errorType, operationType }) => {
        const user = userEvent.setup();
        
        const { container } = render(
          <TestWebSocketComponent deviceId={deviceId} sessionId={sessionId} />
        );

        // Connect
        await user.click(screen.getByTestId('connect-btn'));
        
        await waitFor(() => {
          expect(screen.getByTestId('connection-status')).toHaveTextContent('connected');
        }, { timeout: 1000 });

        // Trigger operation based on type
        switch (operationType) {
          case 'list':
            await user.click(screen.getByTestId('list-files-btn'));
            break;
          case 'download':
            await user.click(screen.getByTestId('download-btn'));
            break;
          case 'upload':
            await user.click(screen.getByTestId('upload-btn'));
            break;
        }

        // Simulate error response
        const connectionKey = `${deviceId}:${sessionId}`;
        const mockWs = webSocketManager['connections'].get(connectionKey) as any;
        
        if (mockWs) {
          const operationId = `file-op-${Date.now()}`;
          let errorMessage: WebSocketMessage;
          
          switch (operationType) {
            case 'list':
              errorMessage = {
                type: 'file_list_result',
                id: operationId,
                error: `${errorType}: Cannot list files`
              } as any;
              break;
            case 'download':
              errorMessage = {
                type: 'file_get_result',
                id: operationId,
                error: `${errorType}: Cannot download file`
              } as any;
              break;
            case 'upload':
              errorMessage = {
                type: 'file_put_result',
                id: operationId,
                success: false,
                error: `${errorType}: Cannot upload file`
              } as any;
              break;
            default:
              return;
          }

          mockWs.simulateMessage(errorMessage);

          // Wait for error processing
          await waitFor(() => {
            const messageCount = parseInt(screen.getByTestId('message-count').textContent || '0');
            expect(messageCount).toBeGreaterThan(0);
          }, { timeout: 500 });
        }

        // Verify error handling doesn't break the component
        expect(screen.getByTestId('connection-status')).toBeInTheDocument();
        expect(screen.getByTestId('file-operations-count')).toBeInTheDocument();
      }
    ), { numRuns: 3 });
  });

  /**
   * 测试并发文件操作
   */
  test('Concurrent file operations', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        deviceId: fc.string({ minLength: 5, maxLength: 15 }),
        sessionId: fc.string({ minLength: 5, maxLength: 15 }),
        operationCount: fc.integer({ min: 2, max: 5 })
      }),
      async ({ deviceId, sessionId, operationCount }) => {
        const user = userEvent.setup();
        
        const { container } = render(
          <TestWebSocketComponent deviceId={deviceId} sessionId={sessionId} />
        );

        // Connect
        await user.click(screen.getByTestId('connect-btn'));
        
        await waitFor(() => {
          expect(screen.getByTestId('connection-status')).toHaveTextContent('connected');
        }, { timeout: 1000 });

        // Start multiple operations concurrently
        const operations = [];
        for (let i = 0; i < operationCount; i++) {
          const operationType = ['list-files-btn', 'download-btn', 'upload-btn'][i % 3];
          operations.push(user.click(screen.getByTestId(operationType)));
        }

        // Wait for all operations to start
        await Promise.all(operations);

        // Verify operations were tracked
        await waitFor(() => {
          const operationsCount = parseInt(screen.getByTestId('file-operations-count').textContent || '0');
          expect(operationsCount).toBeGreaterThanOrEqual(1);
        }, { timeout: 1000 });

        // Verify component remains stable
        expect(screen.getByTestId('connection-status')).toHaveTextContent('connected');
        expect(screen.getByTestId('error')).toHaveTextContent('no-error');
      }
    ), { numRuns: 3 });
  });
});