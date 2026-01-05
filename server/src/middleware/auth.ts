/**
 * 认证中间件
 * 实现签名验证、JWT Token 验证、权限检查
 * 
 * API 分类:
 * - Agent API (/agent/*): 使用 Ed25519 签名验证
 * - Admin API (/admin/*, /devices/*, /commands/*, 等): 使用 JWT Token 验证
 * 
 * Requirements: 7.2, 7.3, 7.4
 */

import { Env } from '../index';
import { validateAdminApiKey, secureCompare, SecretsConfig } from '../config/secrets';
import { verifyEd25519Signature } from '../api/utils/crypto';
import { getDeviceById } from '../api/utils/database';
import { verifyAdminToken, extractBearerToken, isTokenBlacklisted, AdminTokenPayload } from '../api/handlers/admin-auth';

// ==================== 类型定义 ====================

export interface AuthResult {
  authenticated: boolean;
  error?: string;
  errorCode?: string;
  deviceId?: string;
  isAdmin?: boolean;
}

export interface SignedRequest {
  device_id: string;
  timestamp: number;
  nonce: string;
  signature: string;
  [key: string]: any;
}

export interface AuthOptions {
  requireAdmin?: boolean;
  requireDevice?: boolean;
  skipSignatureVerification?: boolean;
  maxTimestampAge?: number; // 最大时间戳年龄（毫秒）
}

// ==================== 签名验证 ====================

/**
 * 验证设备请求签名
 * 使用 Ed25519 签名验证请求的完整性和真实性
 */
export async function verifyDeviceSignature(
  request: SignedRequest,
  publicKey: string
): Promise<boolean> {
  try {
    const { signature, ...payload } = request;
    
    if (!signature || !publicKey) {
      return false;
    }

    // 构造签名数据：device_id + timestamp + nonce + 其他字段的 JSON
    const signatureData = constructSignatureData(payload);
    
    // 验证 Ed25519 签名
    return await verifyEd25519Signature(publicKey, signature, signatureData);
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}

/**
 * 构造用于签名验证的数据
 * 确保字段排序一致性
 */
export function constructSignatureData(payload: Record<string, any>): string {
  // 按键名排序，确保一致性
  const sortedKeys = Object.keys(payload).sort();
  const sortedPayload: Record<string, any> = {};
  
  for (const key of sortedKeys) {
    sortedPayload[key] = payload[key];
  }
  
  return JSON.stringify(sortedPayload);
}

/**
 * 验证时间戳有效性（防重放攻击）
 */
export function validateTimestamp(
  timestamp: number,
  maxAge: number = 300000 // 默认 5 分钟
): { valid: boolean; reason?: string } {
  const now = Date.now();
  const age = Math.abs(now - timestamp);
  
  if (age > maxAge) {
    return { 
      valid: false, 
      reason: `Timestamp too old or in future: ${age}ms difference` 
    };
  }
  
  return { valid: true };
}

/**
 * 验证 nonce 唯一性（防重放攻击）
 */
export async function validateNonceUniqueness(
  kv: KVNamespace,
  deviceId: string,
  nonce: string,
  windowSeconds: number = 300 // 5 分钟窗口
): Promise<{ valid: boolean; reason?: string }> {
  const nonceKey = `nonce:${deviceId}:${nonce}`;
  
  try {
    // 检查 nonce 是否已存在
    const existing = await kv.get(nonceKey);
    if (existing) {
      return { valid: false, reason: 'Nonce already used' };
    }
    
    // 存储 nonce，设置过期时间
    await kv.put(nonceKey, '1', { expirationTtl: windowSeconds });
    
    return { valid: true };
  } catch (error) {
    console.error('Nonce validation error:', error);
    return { valid: false, reason: 'Nonce validation failed' };
  }
}

// ==================== API 密钥验证 ====================

/**
 * 从请求头提取 API 密钥
 */
export function extractApiKey(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader) {
    return null;
  }
  
  // 支持 Bearer token 和直接 API Key
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  if (authHeader.startsWith('ApiKey ')) {
    return authHeader.substring(7);
  }
  
  return authHeader;
}

/**
 * 验证管理员 API 密钥
 */
export function verifyAdminApiKey(
  request: Request,
  secrets: SecretsConfig
): AuthResult {
  const apiKey = extractApiKey(request);
  
  if (!apiKey) {
    return {
      authenticated: false,
      error: 'Missing API key',
      errorCode: 'MISSING_API_KEY'
    };
  }
  
  if (!validateAdminApiKey(apiKey, secrets)) {
    return {
      authenticated: false,
      error: 'Invalid API key',
      errorCode: 'INVALID_API_KEY'
    };
  }
  
  return {
    authenticated: true,
    isAdmin: true
  };
}

// ==================== 综合认证中间件 ====================

/**
 * 设备认证中间件
 * 验证设备签名、时间戳和 nonce
 */
export async function authenticateDevice(
  request: Request,
  env: Env,
  options: AuthOptions = {}
): Promise<AuthResult> {
  try {
    const body = await request.clone().json() as SignedRequest;
    
    // 验证必需字段
    if (!body.device_id || !body.timestamp || !body.nonce || !body.signature) {
      return {
        authenticated: false,
        error: 'Missing required authentication fields',
        errorCode: 'MISSING_AUTH_FIELDS'
      };
    }
    
    // 验证时间戳
    const maxAge = options.maxTimestampAge || 300000; // 5 分钟
    const timestampResult = validateTimestamp(body.timestamp, maxAge);
    if (!timestampResult.valid) {
      return {
        authenticated: false,
        error: timestampResult.reason,
        errorCode: 'INVALID_TIMESTAMP'
      };
    }
    
    // 验证 nonce
    const nonceResult = await validateNonceUniqueness(
      env.KV,
      body.device_id,
      body.nonce
    );
    if (!nonceResult.valid) {
      return {
        authenticated: false,
        error: nonceResult.reason,
        errorCode: 'INVALID_NONCE'
      };
    }
    
    // 跳过签名验证（仅用于测试环境）
    if (options.skipSignatureVerification) {
      return {
        authenticated: true,
        deviceId: body.device_id
      };
    }
    
    // 获取设备公钥
    const device = await getDeviceById(env.DB, body.device_id);
    if (!device) {
      return {
        authenticated: false,
        error: 'Device not found',
        errorCode: 'DEVICE_NOT_FOUND'
      };
    }
    
    // 验证签名
    const signatureValid = await verifyDeviceSignature(body, device.public_key);
    if (!signatureValid) {
      return {
        authenticated: false,
        error: 'Invalid signature',
        errorCode: 'INVALID_SIGNATURE'
      };
    }
    
    return {
      authenticated: true,
      deviceId: body.device_id
    };
  } catch (error) {
    console.error('Device authentication error:', error);
    return {
      authenticated: false,
      error: 'Authentication failed',
      errorCode: 'AUTH_ERROR'
    };
  }
}

/**
 * 管理 API 认证中间件
 * 验证管理员 JWT Token
 */
export async function authenticateAdmin(
  request: Request,
  env: Env
): Promise<AuthResult> {
  const secrets = (env as any).secrets as SecretsConfig;
  
  if (!secrets) {
    return {
      authenticated: false,
      error: 'Server configuration error',
      errorCode: 'CONFIG_ERROR'
    };
  }

  // 提取 Bearer Token
  const token = extractBearerToken(request);
  
  if (!token) {
    return {
      authenticated: false,
      error: 'Authorization token required',
      errorCode: 'MISSING_TOKEN'
    };
  }

  // 验证 JWT Token
  const result = await verifyAdminToken(token, secrets.jwtSecret);
  
  if (!result.valid || !result.payload) {
    return {
      authenticated: false,
      error: result.error || 'Invalid token',
      errorCode: 'INVALID_TOKEN'
    };
  }

  // 检查 Token 是否在黑名单中 (已登出)
  // 本地开发模式下 KV 可能不可用，跳过黑名单检查
  if (env.KV) {
    const isBlacklisted = await isTokenBlacklisted(result.payload.token_id, env.KV);
    if (isBlacklisted) {
      return {
        authenticated: false,
        error: 'Token has been revoked',
        errorCode: 'TOKEN_REVOKED'
      };
    }
  }

  return {
    authenticated: true,
    isAdmin: true
  };
}

/**
 * WebSocket 连接签名验证
 * 用于验证 WebSocket 升级请求
 */
export async function authenticateWebSocketUpgrade(
  sessionId: string,
  deviceId: string,
  signature: string,
  timestamp: number,
  env: Env
): Promise<AuthResult> {
  try {
    // 验证时间戳
    const timestampResult = validateTimestamp(timestamp);
    if (!timestampResult.valid) {
      return {
        authenticated: false,
        error: timestampResult.reason,
        errorCode: 'INVALID_TIMESTAMP'
      };
    }
    
    // 获取设备公钥
    const device = await getDeviceById(env.DB, deviceId);
    if (!device) {
      return {
        authenticated: false,
        error: 'Device not found',
        errorCode: 'DEVICE_NOT_FOUND'
      };
    }
    
    // 构造签名数据
    const signatureData = `${sessionId}:${deviceId}:${timestamp}`;
    
    // 验证签名
    const signatureValid = await verifyEd25519Signature(
      device.public_key,
      signature,
      signatureData
    );
    
    if (!signatureValid) {
      return {
        authenticated: false,
        error: 'Invalid signature',
        errorCode: 'INVALID_SIGNATURE'
      };
    }
    
    return {
      authenticated: true,
      deviceId
    };
  } catch (error) {
    console.error('WebSocket auth error:', error);
    return {
      authenticated: false,
      error: 'Authentication failed',
      errorCode: 'AUTH_ERROR'
    };
  }
}

// ==================== 中间件包装器 ====================

/**
 * 创建认证中间件包装器
 * 用于保护需要认证的路由
 */
export function withDeviceAuth(
  handler: (request: Request, env: Env, ctx: ExecutionContext, authResult: AuthResult) => Promise<Response>,
  options: AuthOptions = {}
) {
  return async (request: Request, env: Env, ctx: ExecutionContext): Promise<Response> => {
    const authResult = await authenticateDevice(request, env, options);
    
    if (!authResult.authenticated) {
      return new Response(JSON.stringify({
        error: authResult.error,
        code: authResult.errorCode
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return handler(request, env, ctx, authResult);
  };
}

/**
 * 创建管理员认证中间件包装器
 * 验证 JWT Token，确保只有管理员可以访问
 */
export function withAdminAuth<T extends (request: Request, env: Env, ...args: any[]) => Promise<Response>>(
  handler: T
) {
  return async (request: Request, env: Env, ctx: ExecutionContext): Promise<Response> => {
    const authResult = await authenticateAdmin(request, env);
    
    if (!authResult.authenticated) {
      return new Response(JSON.stringify({
        error: authResult.error,
        code: authResult.errorCode
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return handler(request, env, ctx);
  };
}

// ==================== 工具函数 ====================

/**
 * 创建未授权响应
 */
export function createUnauthorizedResponse(
  error: string = 'Unauthorized',
  code: string = 'UNAUTHORIZED'
): Response {
  return new Response(JSON.stringify({ error, code }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * 创建禁止访问响应
 */
export function createForbiddenResponse(
  error: string = 'Forbidden',
  code: string = 'FORBIDDEN'
): Response {
  return new Response(JSON.stringify({ error, code }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' }
  });
}
