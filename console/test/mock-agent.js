/**
 * Mock Agent - WebSocket 客户端模拟器
 * 用于测试 WebSocket 功能的端到端验证
 */

import WebSocket from 'ws';
import crypto from 'crypto';

class MockAgent {
  constructor(serverUrl, deviceId) {
    this.serverUrl = serverUrl;
    this.deviceId = deviceId;
    this.sessionId = null;
    this.ws = null;
    this.isConnected = false;
    this.messageHandlers = new Map();
    this.commandQueue = [];
  }

  /**
   * 连接到服务器
   */
  async connect() {
    try {
      // 首先创建会话
      await this.createSession();
      
      // 然后建立 WebSocket 连接
      await this.connectWebSocket();
      
      console.log(`✅ Mock Agent ${this.deviceId} connected successfully`);
      return true;
    } catch (error) {
      console.error(`❌ Connection failed:`, error.message);
      return false;
    }
  }

  /**
   * 创建会话
   */
  async createSession() {
    this.sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const sessionData = {
      sessionId: this.sessionId,
      deviceId: this.deviceId,
      durableObjectId: 'test-do-id',
      status: 'pending',
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 60 * 1000 // 30分钟后过期
    };

    // 模拟会话创建请求
    console.log(`📝 Creating session: ${this.sessionId}`);
    return sessionData;
  }

  /**
   * 建立 WebSocket 连接
   */
  async connectWebSocket() {
    return new Promise((resolve, reject) => {
      const wsUrl = `${this.serverUrl.replace('http', 'ws')}/ws?sessionId=${this.sessionId}&deviceId=${this.deviceId}&signature=test-signature`;
      
      console.log(`🔌 Connecting to WebSocket: ${wsUrl}`);
      
      this.ws = new WebSocket(wsUrl);
      
      this.ws.on('open', () => {
        this.isConnected = true;
        console.log(`✅ WebSocket connected for device ${this.deviceId}`);
        
        // 发送认证消息
        this.sendAuth();
        
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          console.error('❌ Failed to parse message:', error);
        }
      });

      this.ws.on('close', (code, reason) => {
        this.isConnected = false;
        console.log(`🔌 WebSocket closed: ${code} - ${reason}`);
      });

      this.ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
        reject(error);
      });

      // 连接超时
      setTimeout(() => {
        if (!this.isConnected) {
          reject(new Error('WebSocket connection timeout'));
        }
      }, 10000);
    });
  }

  /**
   * 发送认证消息
   */
  sendAuth() {
    const authMessage = {
      type: 'auth',
      deviceId: this.deviceId,
      signature: 'mock-signature'
    };
    
    this.sendMessage(authMessage);
    console.log(`🔐 Sent auth message for device ${this.deviceId}`);
  }

  /**
   * 发送消息
   */
  sendMessage(message) {
    if (this.ws && this.isConnected) {
      this.ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  /**
   * 处理接收到的消息
   */
  handleMessage(message) {
    console.log(`📨 Received message:`, message.type, message.id || '');

    switch (message.type) {
      case 'auth_success':
        console.log(`✅ Authentication successful`);
        this.sendPresence('online');
        break;

      case 'cmd':
        this.handleCommand(message);
        break;

      case 'fs_list':
        this.handleFileList(message);
        break;

      case 'fs_get':
        this.handleFileGet(message);
        break;

      case 'fs_put':
        this.handleFilePut(message);
        break;

      case 'heartbeat':
        this.handleHeartbeat(message);
        break;

      default:
        console.log(`⚠️ Unknown message type: ${message.type}`);
    }
  }

  /**
   * 处理命令执行
   */
  handleCommand(message) {
    const { id, command, args = [] } = message;
    console.log(`💻 Executing command: ${command} ${args.join(' ')}`);

    // 模拟命令执行
    setTimeout(() => {
      let stdout = '';
      let stderr = '';
      let exitCode = 0;

      // 模拟不同命令的输出
      switch (command) {
        case 'echo':
          stdout = args.join(' ') + '\n';
          break;
        case 'pwd':
          stdout = '/home/user\n';
          break;
        case 'ls':
          stdout = 'file1.txt\nfile2.txt\ndirectory1\n';
          break;
        case 'whoami':
          stdout = 'mockuser\n';
          break;
        case 'date':
          stdout = new Date().toString() + '\n';
          break;
        case 'error':
          stderr = 'This is a test error\n';
          exitCode = 1;
          break;
        default:
          stdout = `Mock output for command: ${command}\n`;
      }

      const result = {
        type: 'cmd_result',
        id,
        exitCode,
        stdout,
        stderr
      };

      this.sendMessage(result);
      console.log(`✅ Command result sent: exit code ${exitCode}`);
    }, 500 + Math.random() * 1000); // 模拟执行时间
  }

  /**
   * 处理文件列表请求
   */
  handleFileList(message) {
    const { id, path } = message;
    console.log(`📁 Listing files in: ${path}`);

    setTimeout(() => {
      const files = [
        {
          name: 'file1.txt',
          path: `${path}/file1.txt`,
          size: 1024,
          isDirectory: false,
          modified: Date.now() - 86400000,
          permissions: 'rw-r--r--'
        },
        {
          name: 'file2.txt',
          path: `${path}/file2.txt`,
          size: 2048,
          isDirectory: false,
          modified: Date.now() - 172800000,
          permissions: 'rw-r--r--'
        },
        {
          name: 'directory1',
          path: `${path}/directory1`,
          size: 0,
          isDirectory: true,
          modified: Date.now() - 259200000,
          permissions: 'rwxr-xr-x'
        }
      ];

      const result = {
        type: 'fs_list_result',
        id,
        files
      };

      this.sendMessage(result);
      console.log(`✅ File list sent: ${files.length} items`);
    }, 200);
  }

  /**
   * 处理文件获取请求
   */
  handleFileGet(message) {
    const { id, path } = message;
    console.log(`📄 Getting file: ${path}`);

    setTimeout(() => {
      const content = `This is mock content for file: ${path}\nGenerated at: ${new Date().toISOString()}\n`;
      const checksum = crypto.createHash('md5').update(content).digest('hex');

      const result = {
        type: 'fs_get_result',
        id,
        content,
        checksum
      };

      this.sendMessage(result);
      console.log(`✅ File content sent: ${content.length} bytes`);
    }, 300);
  }

  /**
   * 处理文件上传请求
   */
  handleFilePut(message) {
    const { id, path, content, checksum } = message;
    console.log(`💾 Putting file: ${path} (${content.length} bytes)`);

    setTimeout(() => {
      // 验证校验和
      const calculatedChecksum = crypto.createHash('md5').update(content).digest('hex');
      const success = calculatedChecksum === checksum;

      const result = {
        type: 'fs_put_result',
        id,
        success,
        error: success ? undefined : 'Checksum mismatch'
      };

      this.sendMessage(result);
      console.log(`✅ File put result: ${success ? 'success' : 'failed'}`);
    }, 400);
  }

  /**
   * 处理心跳
   */
  handleHeartbeat(message) {
    // 响应心跳
    this.sendMessage({
      type: 'heartbeat',
      timestamp: Date.now()
    });
  }

  /**
   * 发送状态更新
   */
  sendPresence(status) {
    const presence = {
      type: 'presence',
      status
    };
    
    this.sendMessage(presence);
    console.log(`📡 Sent presence: ${status}`);
  }

  /**
   * 断开连接
   */
  disconnect() {
    if (this.ws) {
      this.isConnected = false;
      this.ws.close();
      console.log(`🔌 Disconnected device ${this.deviceId}`);
    }
  }

  /**
   * 模拟设备活动
   */
  startActivity() {
    // 定期发送心跳和状态更新
    setInterval(() => {
      if (this.isConnected) {
        this.sendPresence(Math.random() > 0.8 ? 'busy' : 'online');
      }
    }, 30000);

    // 模拟随机错误
    setTimeout(() => {
      if (this.isConnected) {
        this.sendMessage({
          type: 'error',
          code: 'MOCK_ERROR',
          message: 'This is a mock error for testing'
        });
      }
    }, 60000);
  }
}

// 测试函数
async function testWebSocketFunctionality() {
  console.log('🚀 Starting WebSocket functionality test...\n');

  const serverUrl = 'http://localhost:8787';
  const deviceId = `mock-device-${Date.now()}`;
  
  const agent = new MockAgent(serverUrl, deviceId);
  
  try {
    // 连接到服务器
    const connected = await agent.connect();
    if (!connected) {
      throw new Error('Failed to connect to server');
    }

    // 开始模拟活动
    agent.startActivity();

    console.log('\n✅ WebSocket connection established successfully!');
    console.log(`📱 Device ID: ${deviceId}`);
    console.log(`🔗 Session ID: ${agent.sessionId}`);
    console.log('\n🎯 WebSocket functionality verification completed!');
    console.log('\nYou can now test the terminal in the web interface:');
    console.log('1. Go to http://localhost:3000/sessions');
    console.log('2. Look for the active session');
    console.log('3. Open the terminal and send commands');

    // 保持连接活跃
    return agent;
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    agent.disconnect();
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  testWebSocketFunctionality().then(agent => {
    // 保持进程运行
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down mock agent...');
      agent.disconnect();
      process.exit(0);
    });
  });
}

export default MockAgent;