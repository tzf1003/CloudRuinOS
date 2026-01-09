/**
 * API 路由定义
 * 定义所有 API 端点的路由和处理器
 * 
 * API 分类:
 * - 公开 API: /health/*, /ping (无需认证)
 * - Agent API: /agent/* (Ed25519 签名验证)
 * - Admin API: /admin/*, /devices/*, /commands/*, /sessions/*, /files/*, /audit, /enrollment/* (JWT Token 验证)
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
import { syncConfig, getConfigs, updateConfig, deleteConfig } from './handlers/config';
import { adminLogin, verifyAdminSession, adminLogout } from './handlers/admin-auth';
import { createTask, getTask, listDeviceTasks, cancelTask } from './handlers/tasks';
import { 
  createTerminal, 
  sendTerminalInput, 
  getTerminalOutput, 
  getTerminalSessions, 
  closeTerminal,
  resizeTerminal 
} from './handlers/terminal';

import { handleOptionsRequest } from '../middleware/cors';
import { withAdminAuth } from '../middleware/auth';
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

  // Agent API 端点 (Ed25519 签名验证 - 在各 handler 内部实现)
  router.post('/agent/enroll', enrollDevice);
  router.post('/agent/heartbeat', heartbeat);
  router.get('/agent/command', getAgentCommands);
  router.post('/agent/command/:id/ack', ackCommand);
  router.post('/agent/audit', receiveAuditLogs);
  router.post('/agent/config', syncConfig);

  // ==================== 管理员 API (需要 JWT Token 认证) ====================

  // 管理员认证端点 (无需认证)
  router.post('/admin/login', adminLogin);
  // 管理员认证验证和登出 (需要认证)
  router.get('/admin/verify', withAdminAuth(verifyAdminSession));
  router.post('/admin/logout', withAdminAuth(adminLogout));

  // 命令管理 API (管理员)
  router.post('/commands', withAdminAuth(createCommand));
  router.get('/commands/:id', withAdminAuth(getCommandStatus));

  // 注册令牌管理 API (管理员)
  router.post('/enrollment/token', withAdminAuth(generateEnrollmentTokenHandler));
  router.get('/enrollment/tokens', withAdminAuth(getEnrollmentTokensHandler));
  router.get('/enrollment/token/:token', withAdminAuth(validateEnrollmentTokenHandler));
  router.put('/enrollment/token/:id', withAdminAuth(updateEnrollmentTokenHandler));
  router.delete('/enrollment/token/:id', withAdminAuth(deleteEnrollmentTokenHandler));
  
  // 配置管理 API (管理员)
  router.get('/admin/config', withAdminAuth(getConfigs));
  router.put('/admin/config', withAdminAuth(updateConfig));
  router.post('/admin/config', withAdminAuth(updateConfig)); // Alias for PUT
  router.delete('/admin/config/:id', withAdminAuth(deleteConfig));

  // 设备管理 API (管理员)
  router.get('/devices', withAdminAuth(getDevices));
  router.get('/devices/:id', withAdminAuth(getDevice));
  router.get('/devices/:id/commands', withAdminAuth(getDeviceCommandHistory));
  router.get('/devices/:id/audit', withAdminAuth(getDeviceAuditLogs));
  router.get('/devices/:id/tasks', withAdminAuth((req, env, ctx) => {
    const url = new URL(req.url);
    const deviceId = url.pathname.split('/')[2];
    return listDeviceTasks(req, env, ctx, deviceId);
  }));
  router.put('/devices/:id', withAdminAuth(updateDevice));
  router.delete('/devices/:id', withAdminAuth(deleteDevice));

  // 任务管理 API (管理员)
  router.post('/admin/tasks', withAdminAuth(createTask));
  router.get('/admin/tasks/:id', withAdminAuth((req, env, ctx) => {
    const url = new URL(req.url);
    const taskId = url.pathname.split('/')[3];
    return getTask(req, env, ctx, taskId);
  }));
  router.post('/admin/tasks/:id/cancel', withAdminAuth((req, env, ctx) => {
    const url = new URL(req.url);
    const taskId = url.pathname.split('/')[3];
    return cancelTask(req, env, ctx, taskId);
  }));

  // 会话管理 API (管理员)
  router.get('/sessions', withAdminAuth(getSessions));
  router.post('/sessions', withAdminAuth(createSession));
  router.get('/sessions/:id', withAdminAuth(getSession));

  // 文件管理 API (管理员)
  router.post('/files/list', withAdminAuth(listFiles));
  router.get('/files/download', withAdminAuth(downloadFile));
  router.post('/files/upload', withAdminAuth(uploadFile));

  // 审计日志 API (管理员)
  router.get('/audit', withAdminAuth(getAuditLogsHandler));

  // 终端管理 API (管理员)
  router.post('/terminal/create', withAdminAuth(createTerminal));
  router.post('/terminal/input', withAdminAuth(sendTerminalInput));
  router.get('/terminal/output/:sessionId', withAdminAuth((req, env, ctx) => {
    const url = new URL(req.url);
    const sessionId = url.pathname.split('/')[3];
    return getTerminalOutput(req, env, ctx, sessionId);
  }));
  router.get('/terminal/sessions', withAdminAuth(getTerminalSessions));
  router.post('/terminal/close/:sessionId', withAdminAuth((req, env, ctx) => {
    const url = new URL(req.url);
    const sessionId = url.pathname.split('/')[3];
    return closeTerminal(req, env, ctx, sessionId);
  }));
  router.post('/terminal/resize', withAdminAuth(resizeTerminal));

  // WebSocket 升级端点
  router.get('/ws', handleWebSocketUpgrade);

  // 404 处理
  router.all('*', () => new Response('Not Found', { status: 404 }));

  return router;
}