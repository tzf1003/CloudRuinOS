import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fc from 'fast-check';
import { WebSocketTerminal } from '../components/WebSocketTerminal';
import { useWebSocket } from '../hooks/useWebSocket';

// Mock useWebSocket hook
vi.mock('../hooks/useWebSocket');

const mockUseWebSocket = vi.mocked(useWebSocket);

// Mock WebSocket 实例 - 改进版本
const createMockWebSocketReturn = (overrides = {}) => ({
  isConnected: false,
  isConnecting: false,
  isDisconnected: true,
  hasError: false,
  messages: [],
  lastMessage: null,
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn(),
  sendMessage: vi.fn().mockReturnValue(true),
  sendCommand: vi.fn().mockReturnValue('cmd-1'),
  clearMessages: vi.fn(),
  error: null,
  connectionStatus: null,
  ...overrides
});

// 全局 Mock WebSocket 实例引用
let globalMockWebSocketInstance: any = null;

// 改进�?Mock WebSocket �?
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState: number = MockWebSocket.CONNECTING;
  url: string;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    globalMockWebSocketInstance = this;
    
    // 模拟异步连接 - 缩短延迟
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 5); // 减少延迟时间
  }

  send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    // 模拟消息发送成�?
  }

  close(code?: number, reason?: string): void {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close', { code: code || 1000, reason }));
    }
  }

  // 模拟接收消息
  simulateMessage(data: any): void {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }));
    }
  }

  // 模拟连接错误
  simulateError(): void {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }
}

// 全局 WebSocket mock
(global as any).WebSocket = MockWebSocket;
(global as any).mockWebSocketInstance = globalMockWebSocketInstance;

describe('WebSocketTerminal Component Property Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWebSocket.mockReturnValue(createMockWebSocketReturn());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Property 23: 命令发送机�?
   * Feature: frontend-enhancements, Property 23: 命令发送机�?
   * Validates: Requirements 4.3
   */
  test('Property 23: Command sending mechanism', async () => {
    await fc.assert(fc.asyncProperty(
      fc.string({ minLength: 1, maxLength: 20 }), // deviceId
      fc.string({ minLength: 1, maxLength: 20 }), // sessionId
      fc.array(fc.record({
        command: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        args: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 3 })
      }), { minLength: 1, maxLength: 5 }), // commands to test
      async (deviceId, sessionId, commands) => {
        const mockSendCommand = vi.fn();
        let commandCounter = 0;
        
        mockSendCommand.mockImplementation((command: string) => {
          return `cmd-${++commandCounter}`;
        });

        mockUseWebSocket.mockReturnValue(createMockWebSocketReturn({
          isConnected: true,
          isDisconnected: false,
          sendCommand: mockSendCommand
        }));

        const user = userEvent.setup();
        
        render(
          <WebSocketTerminal
            deviceId={deviceId}
            sessionId={sessionId}
            autoConnect={true}
          />
        );

        // 等待组件渲染
        await waitFor(() => {
          expect(screen.getByPlaceholderText(/Enter command/)).toBeInTheDocument();
        });

        const input = screen.getByPlaceholderText(/Enter command/);

        // 测试每个命令的发�?
        for (const cmdData of commands) {
          const fullCommand = `${cmdData.command} ${cmdData.args.join(' ')}`.trim();
          
          // 清空输入�?
          await user.clear(input);
          
          // 输入命令
          await user.type(input, fullCommand);
          
          // 验证输入�?
          expect(input).toHaveValue(fullCommand);
          
          // �?Enter 发送命�?
          await user.keyboard('{Enter}');
          
          // 验证 sendCommand 被调�?
          expect(mockSendCommand).toHaveBeenCalledWith(cmdData.command, cmdData.args);
          
          // 验证输入框被清空
          expect(input).toHaveValue('');
        }

        // 验证总调用次�?
        expect(mockSendCommand).toHaveBeenCalledTimes(commands.length);
      }
    ), { numRuns: 3 });
  });

  /**
   * Property 24: 实时输出显示
   * Feature: frontend-enhancements, Property 24: 实时输出显示
   * Validates: Requirements 4.4
   */
  test('Property 24: Real-time output display', async () => {
    await fc.assert(fc.asyncProperty(
      fc.string({ minLength: 1, maxLength: 20 }), // deviceId
      fc.string({ minLength: 1, maxLength: 20 }), // sessionId
      fc.array(fc.record({
        id: fc.string({ minLength: 1, maxLength: 10 }),
        type: fc.constantFrom('command', 'output', 'error', 'system'),
        content: fc.string({ minLength: 1, maxLength: 100 }),
        timestamp: fc.integer({ min: Date.now() - 86400000, max: Date.now() }),
        exitCode: fc.option(fc.integer({ min: 0, max: 255 }))
      }), { minLength: 1, maxLength: 10 }), // terminal messages
      async (deviceId, sessionId, messages) => {
        mockUseWebSocket.mockReturnValue(createMockWebSocketReturn({
          isConnected: true,
          isDisconnected: false,
          messages: messages
        }));

        render(
          <WebSocketTerminal
            deviceId={deviceId}
            sessionId={sessionId}
            autoConnect={true}
          />
        );

        // 等待组件渲染
        await waitFor(() => {
          expect(screen.getByText(/Terminal ready/)).toBeInTheDocument();
        });

        // 验证所有消息都被显�?
        for (const message of messages) {
          // 查找消息内容
          const messageElement = screen.getByText(new RegExp(message.content.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
          expect(messageElement).toBeInTheDocument();
          
          // 验证时间戳显�?
          const timestamp = new Date(message.timestamp).toLocaleTimeString();
          expect(screen.getByText(timestamp)).toBeInTheDocument();
          
          // 验证退出码显示（如果存在）
          if (message.exitCode !== undefined) {
            expect(screen.getByText(new RegExp(`\\[exit: ${message.exitCode}\\]`))).toBeInTheDocument();
          }
        }

        // 验证消息按时间顺序显�?
        const messageElements = screen.getAllByText(/\d{1,2}:\d{2}:\d{2}/);
        expect(messageElements).toHaveLength(messages.length);
      }
    ), { numRuns: 3 });
  });

  /**
   * Property 25: 命令完成状态显�?
   * Feature: frontend-enhancements, Property 25: 命令完成状态显�?
   * Validates: Requirements 4.5
   */
  test('Property 25: Command completion status display', async () => {
    await fc.assert(fc.asyncProperty(
      fc.string({ minLength: 1, maxLength: 20 }), // deviceId
      fc.string({ minLength: 1, maxLength: 20 }), // sessionId
      fc.array(fc.record({
        id: fc.string({ minLength: 1, maxLength: 10 }),
        command: fc.string({ minLength: 1, maxLength: 50 }),
        exitCode: fc.integer({ min: 0, max: 255 }),
        stdout: fc.string({ maxLength: 200 }),
        stderr: fc.string({ maxLength: 200 }),
        duration: fc.integer({ min: 1, max: 10000 })
      }), { minLength: 1, maxLength: 5 }), // command executions
      async (deviceId, sessionId, executions) => {
        // 创建包含命令和结果的消息
        const messages = executions.flatMap(exec => [
          {
            id: `command-${exec.id}`,
            type: 'command' as const,
            content: `$ ${exec.command}`,
            timestamp: Date.now() - exec.duration,
          },
          {
            id: `result-${exec.id}`,
            type: exec.exitCode === 0 ? 'output' as const : 'error' as const,
            content: exec.exitCode === 0 ? exec.stdout : exec.stderr,
            timestamp: Date.now(),
            exitCode: exec.exitCode
          }
        ]);

        mockUseWebSocket.mockReturnValue(createMockWebSocketReturn({
          isConnected: true,
          isDisconnected: false,
          messages: messages
        }));

        render(
          <WebSocketTerminal
            deviceId={deviceId}
            sessionId={sessionId}
            autoConnect={true}
          />
        );

        // 等待组件渲染
        await waitFor(() => {
          expect(screen.getByText(/Terminal ready/)).toBeInTheDocument();
        });

        // 验证每个命令执行的状态显�?
        for (const exec of executions) {
          // 验证命令显示
          expect(screen.getByText(new RegExp(`\\$ ${exec.command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))).toBeInTheDocument();
          
          // 验证退出码显示
          expect(screen.getByText(new RegExp(`\\[exit: ${exec.exitCode}\\]`))).toBeInTheDocument();
          
          // 验证输出内容显示
          const outputContent = exec.exitCode === 0 ? exec.stdout : exec.stderr;
          if (outputContent.trim()) {
            expect(screen.getByText(new RegExp(outputContent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument();
          }
        }

        // 验证成功和失败命令的视觉区分
        const successMessages = executions.filter(exec => exec.exitCode === 0);
        const errorMessages = executions.filter(exec => exec.exitCode !== 0);
        
        if (successMessages.length > 0) {
          // 至少应该有一个成功的退出码显示
          expect(screen.getAllByText(/\[exit: 0\]/).length).toBeGreaterThan(0);
        }
        
        if (errorMessages.length > 0) {
          // 至少应该有一个非零退出码显示
          const nonZeroExitCodes = screen.getAllByText(/\[exit: (?!0\])\d+\]/);
          expect(nonZeroExitCodes.length).toBeGreaterThan(0);
        }
      }
    ), { numRuns: 3 });
  });

  /**
   * 测试连接状态指示器
   */
  test('Connection status indicator display', async () => {
    await fc.assert(fc.asyncProperty(
      fc.string({ minLength: 1, maxLength: 20 }), // deviceId
      fc.string({ minLength: 1, maxLength: 20 }), // sessionId
      fc.record({
        isConnected: fc.boolean(),
        isConnecting: fc.boolean(),
        hasError: fc.boolean(),
        error: fc.option(fc.string({ minLength: 1, maxLength: 50 }))
      }), // connection state
      async (deviceId, sessionId, connectionState) => {
        // 确保状态逻辑一致�?
        const normalizedState = {
          isConnected: connectionState.isConnected && !connectionState.isConnecting && !connectionState.hasError,
          isConnecting: connectionState.isConnecting && !connectionState.isConnected && !connectionState.hasError,
          isDisconnected: !connectionState.isConnected && !connectionState.isConnecting && !connectionState.hasError,
          hasError: connectionState.hasError,
          error: connectionState.hasError ? (connectionState.error || 'Connection error') : null
        };

        mockUseWebSocket.mockReturnValue(createMockWebSocketReturn(normalizedState));

        render(
          <WebSocketTerminal
            deviceId={deviceId}
            sessionId={sessionId}
            autoConnect={false}
          />
        );

        // 验证连接状态指示器
        if (normalizedState.isConnecting) {
          expect(screen.getByText(/Connecting/)).toBeInTheDocument();
        } else if (normalizedState.isConnected) {
          expect(screen.getByText(/Connected/)).toBeInTheDocument();
        } else if (normalizedState.hasError) {
          expect(screen.getByText(/Error/)).toBeInTheDocument();
          if (normalizedState.error) {
            expect(screen.getByText(new RegExp(normalizedState.error.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument();
          }
        } else {
          expect(screen.getByText(/Disconnected/)).toBeInTheDocument();
        }

        // 验证相应的控制按�?
        if (normalizedState.isConnected) {
          expect(screen.getByText(/Disconnect/)).toBeInTheDocument();
        } else if (!normalizedState.isConnecting) {
          expect(screen.getByText(/Connect/)).toBeInTheDocument();
        }
      }
    ), { numRuns: 3 });
  });

  /**
   * 测试命令历史功能
   */
  test('Command history navigation', async () => {
    await fc.assert(fc.asyncProperty(
      fc.string({ minLength: 1, maxLength: 20 }), // deviceId
      fc.string({ minLength: 1, maxLength: 20 }), // sessionId
      fc.array(fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0), { minLength: 2, maxLength: 5 }), // command history
      async (deviceId, sessionId, commandHistory) => {
        const mockSendCommand = vi.fn();
        let commandCounter = 0;
        
        mockSendCommand.mockImplementation(() => `cmd-${++commandCounter}`);

        mockUseWebSocket.mockReturnValue(createMockWebSocketReturn({
          isConnected: true,
          isDisconnected: false,
          sendCommand: mockSendCommand
        }));

        const user = userEvent.setup();
        
        render(
          <WebSocketTerminal
            deviceId={deviceId}
            sessionId={sessionId}
            autoConnect={true}
          />
        );

        const input = screen.getByPlaceholderText(/Enter command/);

        // 首先发送所有命令以建立历史记录
        for (const command of commandHistory) {
          await user.clear(input);
          await user.type(input, command);
          await user.keyboard('{Enter}');
        }

        // 验证输入框为�?
        expect(input).toHaveValue('');

        // 测试向上箭头导航历史记录
        for (let i = 0; i < commandHistory.length; i++) {
          await user.keyboard('{ArrowUp}');
          const expectedCommand = commandHistory[i];
          expect(input).toHaveValue(expectedCommand);
        }

        // 测试向下箭头导航
        for (let i = commandHistory.length - 2; i >= 0; i--) {
          await user.keyboard('{ArrowDown}');
          const expectedCommand = commandHistory[i];
          expect(input).toHaveValue(expectedCommand);
        }

        // 最后一次向下应该清空输�?
        await user.keyboard('{ArrowDown}');
        expect(input).toHaveValue('');

        // 验证历史记录提示显示
        expect(screen.getByText(new RegExp(`${commandHistory.length} commands`))).toBeInTheDocument();
      }
    ), { numRuns: 3 });
  });

  /**
   * 测试终端清理功能
   */
  test('Terminal clearing functionality', async () => {
    await fc.assert(fc.asyncProperty(
      fc.string({ minLength: 1, maxLength: 20 }), // deviceId
      fc.string({ minLength: 1, maxLength: 20 }), // sessionId
      fc.array(fc.record({
        id: fc.string({ minLength: 1, maxLength: 10 }),
        type: fc.constantFrom('command', 'output', 'error', 'system'),
        content: fc.string({ minLength: 1, maxLength: 50 }),
        timestamp: fc.integer({ min: Date.now() - 86400000, max: Date.now() })
      }), { minLength: 3, maxLength: 10 }), // initial messages
      async (deviceId, sessionId, initialMessages) => {
        const mockClearMessages = vi.fn();

        mockUseWebSocket.mockReturnValue(createMockWebSocketReturn({
          isConnected: true,
          isDisconnected: false,
          messages: initialMessages,
          clearMessages: mockClearMessages
        }));

        const user = userEvent.setup();
        
        render(
          <WebSocketTerminal
            deviceId={deviceId}
            sessionId={sessionId}
            autoConnect={true}
          />
        );

        // 验证初始消息存在
        for (const message of initialMessages.slice(0, 3)) { // 只检查前几条消息
          expect(screen.getByText(new RegExp(message.content.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument();
        }

        // 点击清空按钮
        const clearButton = screen.getByTitle(/Clear terminal/);
        await user.click(clearButton);

        // 验证清空函数被调�?
        expect(mockClearMessages).toHaveBeenCalledTimes(1);
      }
    ), { numRuns: 3 });
  });

  /**
   * 测试终端主题切换
   */
  test('Terminal theme switching', async () => {
    await fc.assert(fc.asyncProperty(
      fc.string({ minLength: 1, maxLength: 20 }), // deviceId
      fc.string({ minLength: 1, maxLength: 20 }), // sessionId
      fc.constantFrom('dark', 'light'), // theme
      fc.integer({ min: 10, max: 20 }), // fontSize
      async (deviceId, sessionId, theme, fontSize) => {
        mockUseWebSocket.mockReturnValue(createMockWebSocketReturn({
          isConnected: true,
          isDisconnected: false
        }));

        const { container } = render(
          <WebSocketTerminal
            deviceId={deviceId}
            sessionId={sessionId}
            theme={theme}
            fontSize={fontSize}
            autoConnect={true}
          />
        );

        // 验证主题类应�?
        const terminalContainer = container.firstChild as HTMLElement;
        if (theme === 'dark') {
          expect(terminalContainer).toHaveClass('bg-gray-900');
        } else {
          expect(terminalContainer).toHaveClass('bg-white');
        }

        // 验证字体大小应用
        const terminalContent = container.querySelector('[style*="font-size"]');
        expect(terminalContent).toHaveStyle(`font-size: ${fontSize}px`);
      }
    ), { numRuns: 3 });
  });
});