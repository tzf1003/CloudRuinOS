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
    
    // 验证必需字段
    if (!body.enrollment_token || !body.platform || !body.version) {
      return createErrorResponse('Missing required fields', 'INVALID_REQUEST', 400);
    }

    // 验证平台类型
    if (!['windows', 'linux', 'macos'].includes(body.platform)) {
      return createErrorResponse('Invalid platform', 'INVALID_PLATFORM', 400);
    }

    const kvManager = createKVManager(env.KV);
    
    // 验证 enrollment token
    const tokenValidation = await validateEnrollmentToken(kvManager, body.enrollment_token, env);
    if (!tokenValidation.valid) {
      // 记录失败的注册尝试
      const auditService = createAuditService(env);
      await auditService.logDeviceRegistration(
        'unknown',
        body.enrollment_token,
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
    await kvManager.markTokenUsed(body.enrollment_token, deviceId);

    // 记录成功的注册事件
    const auditService = createAuditService(env);
    await auditService.logDeviceRegistration(
      deviceId,
      body.enrollment_token,
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