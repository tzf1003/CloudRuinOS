/**
 * WebSocket 终端测试页面
 * 用于验证 WebSocket 终端功能
 */

import React, { useState } from 'react';
import { WebSocketTerminal } from '../components/WebSocketTerminal';
import { CommandExecution } from '../types/api';

export function TerminalTestPage() {
  const [deviceId, setDeviceId] = useState('test-device-123');
  const [sessionId, setSessionId] = useState(`test-session-${Date.now()}`);
  const [isConnected, setIsConnected] = useState(false);
  const [executedCommands, setExecutedCommands] = useState<CommandExecution[]>([]);

  const handleConnectionChange = (connected: boolean) => {
    setIsConnected(connected);
  };

  const handleCommandExecuted = (execution: CommandExecution) => {
    setExecutedCommands(prev => [...prev, execution]);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-6xl mx-auto">
        {/* 页面标题 */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            WebSocket 终端测试
          </h1>
          <p className="text-gray-600">
            测试 WebSocket 终端功能和连接状态
          </p>
        </div>

        {/* 配置面板 */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">连接配置</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                设备 ID
              </label>
              <input
                type="text"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="输入设备 ID"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                会话 ID
              </label>
              <input
                type="text"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="输入会话 ID"
              />
            </div>
          </div>
          
          <div className="mt-4 flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-sm font-medium">
                状态: {isConnected ? '已连接' : '未连接'}
              </span>
            </div>
            <button
              onClick={() => {
                setSessionId(`test-session-${Date.now()}`);
                setExecutedCommands([]);
              }}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
            >
              重新生成会话 ID
            </button>
          </div>
        </div>

        {/* 终端区域 */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">WebSocket 终端</h2>
          <div className="h-96">
            <WebSocketTerminal
              deviceId={deviceId}
              sessionId={sessionId}
              autoConnect={false}
              theme="dark"
              fontSize={14}
              onConnectionChange={handleConnectionChange}
              onCommandExecuted={handleCommandExecuted}
            />
          </div>
        </div>

        {/* 命令执行历史 */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">命令执行历史</h2>
          {executedCommands.length === 0 ? (
            <p className="text-gray-500 italic">暂无执行的命令</p>
          ) : (
            <div className="space-y-3">
              {executedCommands.map((cmd, index) => (
                <div key={index} className="border border-gray-200 rounded-md p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-sm font-semibold">
                      {cmd.command}
                    </span>
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        cmd.exitCode === 0 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        Exit: {cmd.exitCode}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(cmd.endTime).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                  {cmd.stdout && (
                    <div className="mb-2">
                      <div className="text-xs text-gray-600 mb-1">输出:</div>
                      <pre className="bg-gray-50 p-2 rounded text-xs font-mono overflow-x-auto">
                        {cmd.stdout}
                      </pre>
                    </div>
                  )}
                  {cmd.stderr && (
                    <div>
                      <div className="text-xs text-red-600 mb-1">错误:</div>
                      <pre className="bg-red-50 p-2 rounded text-xs font-mono overflow-x-auto text-red-700">
                        {cmd.stderr}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 测试说明 */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mt-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">测试说明</h3>
          <div className="text-blue-800 space-y-2">
            <p>• 点击终端中的"Connect"按钮尝试建立 WebSocket 连接</p>
            <p>• 由于没有真实设备，连接会失败，但可以验证连接逻辑</p>
            <p>• 可以测试终端界面的各种功能：命令输入、历史记录、清空等</p>
            <p>• 检查浏览器开发者工具的网络面板查看 WebSocket 连接尝试</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TerminalTestPage;