/**
 * 设备注册 API 处理器
 * 实现设备注册逻辑：验证 enrollment token、生成设备 ID 和密钥对、持久化设备信息
 * Requirements: 1.1, 1.2, 1.3, 1.4
 */

import { Env } from '../../index';
import { createKVManager } from '../../storage/kv-manager';
import { CreateDeviceInput } from '../../types/database';
import { generateDeviceId, generateEd25519KeyPair, validateEnrollmentToken } from '../utils/crypto';
import { createDevice } from '../utils/database';
import { createAuditService } from '../utils/audit';

/**
 * 获取服务器 URL
 * 从环境变量或请求头中提取
 */
function getServerUrl(request: Request, env: any): string {
  // 优先使用环境变量中配置的 SERVER_URL
  if (env.SERVER_URL) {
    return env.SERVER_URL;
  }

  // 从请求的 Host 头构建 URL
  const host = request.headers.get('Host');
  const protocol = request.url.startsWith('https://') ? 'https' : 'http';

  if (host) {
    return `${protocol}://${host}`;
  }

  // 后备方案：从完整请求 URL 中提取
  try {
    const url = new URL(request.url);
    return url.origin;
  } catch (e) {
    // 如果都失败了，返回一个默认值
    return 'https://ruinos-server.example.com';
  }
}

// 设备注册请求类型
export interface EnrollDeviceRequest {
  enrollment_token: string;
  platform: 'windows' | 'linux' | 'macos';
  version: string;
  client_info?: {
    hostname?: string;
    user_agent?: string;
    ip_address?: string;
  };
}

// 设备注册响应类型
export interface EnrollDeviceResponse {
  success: boolean;
  device_id?: string;
  public_key?: string;
  private_key?: string;
  server_public_key?: string;
  server_url?: string;
  error?: string;
  error_code?: string;
}

/**
 * 设备注册 API 处理器
 * POST /agent/enroll
 */
export async function enrollDevice(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  try {
    // 解析请求体
    const body = await request.json() as EnrollDeviceRequest;
    
    // 如果未提供 enrollment_token，使用默认令牌 'default-token'
    const tokenToValidate = body.enrollment_token || 'default-token';
    
    // 验证必需字段
    if (!body.platform || !body.version) {
      return createErrorResponse('Missing required fields', 'INVALID_REQUEST', 400);
    }
    
    // ...

    const kvManager = createKVManager(env.KV);
    
    // 验证 enrollment token
    const tokenValidation = await validateEnrollmentToken(kvManager, tokenToValidate, env);
    if (!tokenValidation.valid) {
      // 记录失败的注册尝试
      const auditService = createAuditService(env);
      await auditService.logDeviceRegistration(
        'unknown',
        tokenToValidate,
        body.platform,
        body.version,
        '',
        'error',
        tokenValidation.reason || 'Invalid token',
        request
      );

      return createErrorResponse(
        tokenValidation.reason || 'Invalid enrollment token',
        'INVALID_TOKEN',
        401
      );
    }

    // 生成设备 ID 和 Ed25519 密钥对
    const deviceId = generateDeviceId();
    const keyPair = await generateEd25519KeyPair();
    
    if (!keyPair) {
      return createErrorResponse('Failed to generate key pair', 'CRYPTO_ERROR', 500);
    }

    // 创建设备记录
    const deviceInput: CreateDeviceInput = {
      id: deviceId,
      enrollment_token: body.enrollment_token,
      public_key: keyPair.publicKey,
      platform: body.platform,
      version: body.version,
    };

    const deviceCreated = await createDevice(env.DB, deviceInput);
    if (!deviceCreated) {
      return createErrorResponse('Failed to create device record', 'DATABASE_ERROR', 500);
    }

    // 标记 enrollment token 为已使用
    await kvManager.markTokenUsed(tokenToValidate, deviceId);

    // 记录成功的注册事件
    const auditService = createAuditService(env);
    await auditService.logDeviceRegistration(
      deviceId,
      tokenToValidate,
      body.platform,
      body.version,
      keyPair.publicKey,
      'success',
      undefined,
      request
    );

    // 返回成功响应
    const response: EnrollDeviceResponse = {
      success: true,
      device_id: deviceId,
      public_key: keyPair.publicKey,
      private_key: keyPair.privateKey,
      server_public_key: env.SERVER_PUBLIC_KEY || undefined, // 服务端公钥，用于验证服务端响应
      server_url: getServerUrl(request, env), // 返回 server URL
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });

  } catch (error) {
    console.error('Device enrollment error:', error);
    
    // 记录内部错误
    try {
      const auditService = createAuditService(env);
      await auditService.logDeviceRegistration(
        'unknown',
        'unknown',
        'unknown',
        'unknown',
        '',
        'error',
        `Internal error: ${error}`,
        request
      );
    } catch (logError) {
      console.error('Failed to log enrollment error:', logError);
    }

    return createErrorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

/**
 * 创建错误响应
 */
function createErrorResponse(message: string, code: string, status: number): Response {
  const response: EnrollDeviceResponse = {
    success: false,
    error: message,
    error_code: code,
  };

  return new Response(JSON.stringify(response), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}