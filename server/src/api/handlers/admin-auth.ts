/**
 * 管理员认证处理器
 * 实现管理员登录和 Token 管理
 * 
 * 认证流程:
 * 1. 管理员通过 POST /admin/login 提交密码
 * 2. 验证通过后返回 JWT Token
 * 3. 后续请求通过 Authorization: Bearer <token> 验证身份
 */

import { Env } from '../../index';
import { SecretsConfig, secureCompare, generateSecureToken } from '../../config/secrets';

// ============= 类型定义 =============

export interface AdminLoginRequest {
  password: string;
}

export interface AdminLoginResponse {
  status: 'ok' | 'error';
  token?: string;
  expires_at?: number;
  error?: string;
}

export interface AdminTokenPayload {
  type: 'admin';
  issued_at: number;
  expires_at: number;
  token_id: string;
}

// Token 有效期：24 小时
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;

// ============= 工具函数 =============

function createErrorResponse(message: string, status: number = 401): Response {
  return new Response(JSON.stringify({
    status: 'error',
    error: message,
  }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * 生成管理员 JWT Token
 * 使用 HMAC-SHA256 签名
 */
async function generateAdminToken(
  jwtSecret: string
): Promise<{ token: string; expiresAt: number }> {
  const now = Date.now();
  const expiresAt = now + TOKEN_EXPIRY_MS;
  const tokenId = generateSecureToken(16);

  const payload: AdminTokenPayload = {
    type: 'admin',
    issued_at: now,
    expires_at: expiresAt,
    token_id: tokenId,
  };

  // Base64Url 编码 header 和 payload
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = btoa(JSON.stringify(header))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const payloadB64 = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  // 生成签名
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(jwtSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${headerB64}.${payloadB64}`)
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return {
    token: `${headerB64}.${payloadB64}.${signatureB64}`,
    expiresAt,
  };
}

/**
 * 验证管理员 JWT Token
 */
export async function verifyAdminToken(
  token: string,
  jwtSecret: string
): Promise<{ valid: boolean; payload?: AdminTokenPayload; error?: string }> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'Invalid token format' };
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    // 验证签名
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(jwtSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    // 将 Base64Url 转换为标准 Base64
    const normalizeB64 = (s: string) => {
      let str = s.replace(/-/g, '+').replace(/_/g, '/');
      while (str.length % 4) str += '=';
      return str;
    };

    const signatureBytes = new Uint8Array(
      atob(normalizeB64(signatureB64)).split('').map(c => c.charCodeAt(0))
    );

    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes,
      encoder.encode(`${headerB64}.${payloadB64}`)
    );

    if (!isValid) {
      return { valid: false, error: 'Invalid signature' };
    }

    // 解析 payload
    const payload: AdminTokenPayload = JSON.parse(atob(normalizeB64(payloadB64)));

    // 验证 token 类型
    if (payload.type !== 'admin') {
      return { valid: false, error: 'Invalid token type' };
    }

    // 验证过期时间
    if (Date.now() > payload.expires_at) {
      return { valid: false, error: 'Token expired' };
    }

    return { valid: true, payload };
  } catch (error) {
    console.error('Token verification error:', error);
    return { valid: false, error: 'Token verification failed' };
  }
}

/**
 * 从请求中提取 Bearer Token
 */
export function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.substring(7);
}

// ============= API 处理器 =============

/**
 * 管理员登录
 * POST /admin/login
 * 
 * Body:
 * {
 *   "password": "管理员密码"
 * }
 */
export async function adminLogin(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  try {
    const body = await request.json() as AdminLoginRequest;

    // 验证请求
    if (!body.password) {
      return createErrorResponse('Password is required', 400);
    }

    // 获取密码配置
    const secrets = (env as any).secrets as SecretsConfig;
    const adminPassword = (env as any).ADMIN_PASSWORD as string;

    if (!adminPassword) {
      console.error('ADMIN_PASSWORD not configured');
      return createErrorResponse('Server configuration error', 500);
    }

    // 验证密码 (使用安全比较防止时序攻击)
    if (!secureCompare(body.password, adminPassword)) {
      // 记录失败的登录尝试
      console.warn('Failed admin login attempt from:', request.headers.get('CF-Connecting-IP'));
      return createErrorResponse('Invalid password', 401);
    }

    // 生成 Token
    const { token, expiresAt } = await generateAdminToken(secrets.jwtSecret);

    // 记录成功的登录
    console.log('Admin login successful from:', request.headers.get('CF-Connecting-IP'));

    const response: AdminLoginResponse = {
      status: 'ok',
      token,
      expires_at: expiresAt,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Admin login error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}

/**
 * 验证管理员 Token (用于测试)
 * GET /admin/verify
 */
export async function verifyAdminSession(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  try {
    const token = extractBearerToken(request);

    if (!token) {
      return createErrorResponse('Authorization token required', 401);
    }

    const secrets = (env as any).secrets as SecretsConfig;
    const result = await verifyAdminToken(token, secrets.jwtSecret);

    if (!result.valid) {
      return createErrorResponse(result.error || 'Invalid token', 401);
    }

    return new Response(JSON.stringify({
      status: 'ok',
      message: 'Token is valid',
      expires_at: result.payload?.expires_at,
      remaining_ms: result.payload ? result.payload.expires_at - Date.now() : 0,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Token verification error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}

/**
 * 管理员登出 (可选: 将 token 加入黑名单)
 * POST /admin/logout
 */
export async function adminLogout(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  try {
    const token = extractBearerToken(request);

    if (!token) {
      return createErrorResponse('Authorization token required', 401);
    }

    const secrets = (env as any).secrets as SecretsConfig;
    const result = await verifyAdminToken(token, secrets.jwtSecret);

    if (!result.valid || !result.payload) {
      return createErrorResponse(result.error || 'Invalid token', 401);
    }

    // 将 token 加入黑名单 (使用 KV 存储)
    const tokenKey = `token:blacklist:${result.payload.token_id}`;
    const ttl = Math.ceil((result.payload.expires_at - Date.now()) / 1000);
    
    if (ttl > 0) {
      await env.KV.put(tokenKey, '1', { expirationTtl: ttl });
    }

    return new Response(JSON.stringify({
      status: 'ok',
      message: 'Logged out successfully',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Logout error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}

/**
 * 检查 Token 是否在黑名单中
 */
export async function isTokenBlacklisted(
  tokenId: string,
  kv: KVNamespace
): Promise<boolean> {
  const tokenKey = `token:blacklist:${tokenId}`;
  const result = await kv.get(tokenKey);
  return result !== null;
}
