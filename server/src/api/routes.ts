/**
 * API 路由定义
 * 定义所有 API 端点的路由和处理器
 */

import { Router } from 'itty-router';
import { Env } from '../index';
import { enrollDevice } from './handlers/enrollment';
import { generateEnrollmentTokenHandler, validateEnrollmentTokenHandler, getEnrollmentTokensHandler, updateEnrollmentTokenHandler, deleteEnrollmentTokenHandler } from './handlers/enrollment-token';
import { heartbeat } from './handlers/heartbeat';
import { createSession, getSession, getSessions, handleWebSocketUpgrade } from './handlers/sessions';
import { listFiles, downloadFile, uploadFile } from './handlers/files';
import { getAuditLogsHandler } from './handlers/audit';
import { getDevices, getDevice, updateDevice, deleteDevice } from './handlers/devices';
import { getAgentCommands, ackCommand, createCommand, getCommandStatus, getDeviceCommandHistory } from './handlers/command';
import { receiveAuditLogs, getDeviceAuditLogs } from './handlers/agent-audit';
import { handleOptionsRequest } from '../middleware/cors';
import { 
  handleHealthCheck, 
  handleDetailedHealthCheck, 
  handleReadinessCheck, 
  handleLivenessCheck, 
  handleMetrics 
} from './handlers/health';

export function createRouter() {
  const router = Router();

  // 处理 OPTIONS 预检请求
  router.options('*', handleOptionsRequest);

  // 健康检查和监控端点
  router.get('/health', handleHealthCheck);
  router.get('/health/detailed', handleDetailedHealthCheck);
  router.get('/health/ready', handleReadinessCheck);
  router.get('/health/live', handleLivenessCheck);
  router.get('/metrics', handleMetrics);

  // 部署和回滚端点
  router.get('/deployment/health', async (request, env, ctx) => {
    const { handleDeploymentHealthCheck } = await import('../monitoring/rollback');
    return handleDeploymentHealthCheck(request, env);
  });

  // 向后兼容的简单健康检查
  router.get('/ping', async (request, env, ctx) => {
    return new Response(JSON.stringify({
      status: 'ok',
      version: env.API_VERSION || 'v1',
      environment: env.ENVIRONMENT || 'development',
      timestamp: new Date().toISOString(),
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  });

  // Agent API 端点
  router.post('/agent/enroll', enrollDevice);
  router.post('/agent/heartbeat', heartbeat);
  router.get('/agent/command', getAgentCommands);
  router.post('/agent/command/:id/ack', ackCommand);
  router.post('/agent/audit', receiveAuditLogs);

  // 命令管理 API (管理员)
  router.post('/commands', createCommand);
  router.get('/commands/:id', getCommandStatus);

  // 注册令牌管理 API
  router.post('/enrollment/token', generateEnrollmentTokenHandler);
  router.get('/enrollment/tokens', getEnrollmentTokensHandler);
  router.get('/enrollment/token/:token', validateEnrollmentTokenHandler);
  router.put('/enrollment/token/:id', updateEnrollmentTokenHandler);
  router.delete('/enrollment/token/:id', deleteEnrollmentTokenHandler);

  // 设备管理 API
  router.get('/devices', getDevices);
  router.get('/devices/:id', getDevice);
  router.get('/devices/:id/commands', getDeviceCommandHistory);
  router.get('/devices/:id/audit', getDeviceAuditLogs);
  router.put('/devices/:id', updateDevice);
  router.delete('/devices/:id', deleteDevice);

  // 会话管理 API
  router.get('/sessions', getSessions);
  router.post('/sessions', createSession);
  router.get('/sessions/:id', getSession);

  // 文件管理 API
  router.post('/files/list', listFiles);
  router.get('/files/download', downloadFile);
  router.post('/files/upload', uploadFile);

  // 审计日志 API
  router.get('/audit', getAuditLogsHandler);

  // WebSocket 升级端点
  router.get('/ws', handleWebSocketUpgrade);

  // 404 处理
  router.all('*', () => new Response('Not Found', { status: 404 }));

  return router;
}