/**
 * 审计日志服务
 * 统一管理所有审计日志记录功能
 * Requirements: 9.1, 9.2, 9.3, 9.4, 4.5, 5.5
 */

import { Env } from '../../index';
import { CreateAuditLogInput, CreateFileOperationInput } from '../../types/database';
import { createAuditLog, createFileOperation } from './database';

// 审计事件类型
export type AuditEventType = 
  | 'device_register'
  | 'device_heartbeat'
  | 'session_create'
  | 'session_connect'
  | 'session_disconnect'
  | 'session_expire'
  | 'command_execute'
  | 'file_list'
  | 'file_download'
  | 'file_upload'
  | 'file_delete'
  | 'security_violation'
  | 'authentication_failure'
  | 'rate_limit_exceeded';

// 审计事件数据接口
export interface AuditEventData {
  // 设备注册事件
  device_register?: {
    enrollment_token_prefix: string;
    platform: string;
    version: string;
    public_key_fingerprint: string;
  };

  // 心跳事件
  device_heartbeat?: {
    system_info: {
      platform: string;
      version: string;
      uptime: number;
      cpu_usage?: number;
      memory_usage?: number;
      disk_usage?: number;
    };
    nonce: string;
  };

  // 会话事件
  session_create?: {
    session_id: string;
    durable_object_id: string;
    expires_at: number;
  };

  session_connect?: {
    session_id: string;
    connection_time: number;
  };

  session_disconnect?: {
    session_id: string;
    disconnect_reason: string;
    duration: number;
  };

  session_expire?: {
    session_id: string;
    expired_at: number;
  };

  // 命令执行事件
  command_execute?: {
    command: string;
    args: string[];
    exit_code: number;
    execution_time: number;
    stdout_length: number;
    stderr_length: number;
    is_sensitive: boolean;
  };

  // 文件操作事件
  file_list?: {
    path: string;
    file_count: number;
    operation_id: string;
  };

  file_download?: {
    path: string;
    file_size: number;
    checksum: string;
    operation_id: string;
  };

  file_upload?: {
    path: string;
    file_size: number;
    checksum: string;
    operation_id: string;
  };

  file_delete?: {
    path: string;
    operation_id: string;
  };

  // 安全事件
  security_violation?: {
    violation_type: string;
    details: string;
    threat_level: 'low' | 'medium' | 'high' | 'critical';
  };

  authentication_failure?: {
    failure_reason: string;
    attempt_count: number;
  };

  rate_limit_exceeded?: {
    limit_type: string;
    current_count: number;
    limit: number;
    window_seconds: number;
  };
}

// 审计日志服务类
export class AuditService {
  constructor(private env: Env) {}

  /**
   * 记录审计事件
   */
  async logEvent(
    eventType: AuditEventType,
    deviceId: string,
    sessionId: string | null,
    eventData: AuditEventData,
    result: 'success' | 'error' | 'timeout' = 'success',
    errorMessage?: string,
    request?: Request
  ): Promise<boolean> {
    try {
      const auditInput: CreateAuditLogInput = {
        device_id: deviceId,
        session_id: sessionId || undefined,
        action_type: this.mapEventTypeToActionType(eventType),
        action_data: eventData,
        result,
        error_message: errorMessage,
        ip_address: request?.headers.get('CF-Connecting-IP') || undefined,
        user_agent: request?.headers.get('User-Agent') || undefined,
      };

      const success = await createAuditLog(this.env.DB, auditInput);
      
      if (!success) {
        console.error('Failed to create audit log:', auditInput);
      }

      return success;
    } catch (error) {
      console.error('Audit logging error:', error);
      return false;
    }
  }

  /**
   * 记录设备注册事件
   */
  async logDeviceRegistration(
    deviceId: string,
    enrollmentToken: string,
    platform: string,
    version: string,
    publicKey: string,
    result: 'success' | 'error',
    errorMessage?: string,
    request?: Request
  ): Promise<boolean> {
    const eventData: AuditEventData = {
      device_register: {
        enrollment_token_prefix: enrollmentToken.substring(0, 8) + '...',
        platform,
        version,
        public_key_fingerprint: this.generateKeyFingerprint(publicKey),
      },
    };

    return this.logEvent(
      'device_register',
      deviceId,
      null,
      eventData,
      result,
      errorMessage,
      request
    );
  }

  /**
   * 记录心跳事件
   */
  async logHeartbeat(
    deviceId: string,
    systemInfo: any,
    nonce: string,
    result: 'success' | 'error',
    errorMessage?: string,
    request?: Request
  ): Promise<boolean> {
    const eventData: AuditEventData = {
      device_heartbeat: {
        system_info: systemInfo,
        nonce: nonce.substring(0, 8) + '...',
      },
    };

    return this.logEvent(
      'device_heartbeat',
      deviceId,
      null,
      eventData,
      result,
      errorMessage,
      request
    );
  }

  /**
   * 记录会话创建事件
   */
  async logSessionCreate(
    deviceId: string,
    sessionId: string,
    durableObjectId: string,
    expiresAt: number,
    result: 'success' | 'error',
    errorMessage?: string,
    request?: Request
  ): Promise<boolean> {
    const eventData: AuditEventData = {
      session_create: {
        session_id: sessionId,
        durable_object_id: durableObjectId,
        expires_at: expiresAt,
      },
    };

    return this.logEvent(
      'session_create',
      deviceId,
      sessionId,
      eventData,
      result,
      errorMessage,
      request
    );
  }

  /**
   * 记录会话连接事件
   */
  async logSessionConnect(
    deviceId: string,
    sessionId: string,
    connectionTime: number,
    result: 'success' | 'error',
    errorMessage?: string
  ): Promise<boolean> {
    const eventData: AuditEventData = {
      session_connect: {
        session_id: sessionId,
        connection_time: connectionTime,
      },
    };

    return this.logEvent(
      'session_connect',
      deviceId,
      sessionId,
      eventData,
      result,
      errorMessage
    );
  }

  /**
   * 记录会话断开事件
   */
  async logSessionDisconnect(
    deviceId: string,
    sessionId: string,
    disconnectReason: string,
    duration: number,
    result: 'success' | 'error',
    errorMessage?: string
  ): Promise<boolean> {
    const eventData: AuditEventData = {
      session_disconnect: {
        session_id: sessionId,
        disconnect_reason: disconnectReason,
        duration,
      },
    };

    return this.logEvent(
      'session_disconnect',
      deviceId,
      sessionId,
      eventData,
      result,
      errorMessage
    );
  }

  /**
   * 记录会话过期事件
   */
  async logSessionExpire(
    deviceId: string,
    sessionId: string,
    expiredAt: number
  ): Promise<boolean> {
    const eventData: AuditEventData = {
      session_expire: {
        session_id: sessionId,
        expired_at: expiredAt,
      },
    };

    return this.logEvent(
      'session_expire',
      deviceId,
      sessionId,
      eventData,
      'success'
    );
  }

  /**
   * 记录命令执行事件
   */
  async logCommandExecution(
    deviceId: string,
    sessionId: string,
    command: string,
    args: string[],
    exitCode: number,
    executionTime: number,
    stdoutLength: number,
    stderrLength: number,
    result: 'success' | 'error' | 'timeout',
    errorMessage?: string
  ): Promise<boolean> {
    const isSensitive = this.isSensitiveCommand(command);
    
    const eventData: AuditEventData = {
      command_execute: {
        command: isSensitive ? '[REDACTED]' : command,
        args: isSensitive ? ['[REDACTED]'] : args,
        exit_code: exitCode,
        execution_time: executionTime,
        stdout_length: stdoutLength,
        stderr_length: stderrLength,
        is_sensitive: isSensitive,
      },
    };

    return this.logEvent(
      'command_execute',
      deviceId,
      sessionId,
      eventData,
      result,
      errorMessage
    );
  }

  /**
   * 记录文件操作事件
   */
  async logFileOperation(
    deviceId: string,
    sessionId: string,
    operationType: 'list' | 'download' | 'upload' | 'delete',
    filePath: string,
    operationId: string,
    fileSize?: number,
    checksum?: string,
    fileCount?: number,
    result: 'success' | 'error' | 'timeout' = 'success',
    errorMessage?: string,
    durationMs?: number
  ): Promise<boolean> {
    // 记录到审计日志
    let eventData: AuditEventData = {};
    let eventType: AuditEventType;

    switch (operationType) {
      case 'list':
        eventType = 'file_list';
        eventData.file_list = {
          path: filePath,
          file_count: fileCount || 0,
          operation_id: operationId,
        };
        break;
      case 'download':
        eventType = 'file_download';
        eventData.file_download = {
          path: filePath,
          file_size: fileSize || 0,
          checksum: checksum || '',
          operation_id: operationId,
        };
        break;
      case 'upload':
        eventType = 'file_upload';
        eventData.file_upload = {
          path: filePath,
          file_size: fileSize || 0,
          checksum: checksum || '',
          operation_id: operationId,
        };
        break;
      case 'delete':
        eventType = 'file_delete';
        eventData.file_delete = {
          path: filePath,
          operation_id: operationId,
        };
        break;
    }

    const auditSuccess = await this.logEvent(
      eventType,
      deviceId,
      sessionId,
      eventData,
      result,
      errorMessage
    );

    // 记录到文件操作表
    if (operationType !== 'list') {
      const mappedOperationType = operationType === 'download' ? 'get' : 
                                  operationType === 'upload' ? 'put' : 
                                  operationType;
      
      const mappedStatus = result === 'timeout' ? 'error' : result;
      
      const fileOpInput: CreateFileOperationInput = {
        device_id: deviceId,
        session_id: sessionId,
        operation_type: mappedOperationType as 'get' | 'put' | 'delete',
        file_path: filePath,
        file_size: fileSize,
        checksum,
        status: mappedStatus as 'success' | 'error' | 'pending',
        error_message: errorMessage,
        duration_ms: durationMs,
      };

      const fileOpSuccess = await createFileOperation(this.env.DB, fileOpInput);
      return auditSuccess && fileOpSuccess;
    }

    return auditSuccess;
  }

  /**
   * 记录安全违规事件
   */
  async logSecurityViolation(
    deviceId: string,
    sessionId: string | null,
    violationType: string,
    details: string,
    threatLevel: 'low' | 'medium' | 'high' | 'critical',
    request?: Request
  ): Promise<boolean> {
    const eventData: AuditEventData = {
      security_violation: {
        violation_type: violationType,
        details,
        threat_level: threatLevel,
      },
    };

    return this.logEvent(
      'security_violation',
      deviceId,
      sessionId,
      eventData,
      'error',
      `Security violation: ${violationType}`,
      request
    );
  }

  /**
   * 记录认证失败事件
   */
  async logAuthenticationFailure(
    deviceId: string,
    failureReason: string,
    attemptCount: number,
    request?: Request
  ): Promise<boolean> {
    const eventData: AuditEventData = {
      authentication_failure: {
        failure_reason: failureReason,
        attempt_count: attemptCount,
      },
    };

    return this.logEvent(
      'authentication_failure',
      deviceId,
      null,
      eventData,
      'error',
      `Authentication failed: ${failureReason}`,
      request
    );
  }

  /**
   * 记录速率限制超出事件
   */
  async logRateLimitExceeded(
    deviceId: string,
    limitType: string,
    currentCount: number,
    limit: number,
    windowSeconds: number,
    request?: Request
  ): Promise<boolean> {
    const eventData: AuditEventData = {
      rate_limit_exceeded: {
        limit_type: limitType,
        current_count: currentCount,
        limit,
        window_seconds: windowSeconds,
      },
    };

    return this.logEvent(
      'rate_limit_exceeded',
      deviceId,
      null,
      eventData,
      'error',
      `Rate limit exceeded for ${limitType}`,
      request
    );
  }

  /**
   * 将事件类型映射到数据库中的 action_type
   */
  private mapEventTypeToActionType(eventType: AuditEventType): 'register' | 'heartbeat' | 'command' | 'file_op' | 'session' {
    const mapping: Record<AuditEventType, 'register' | 'heartbeat' | 'command' | 'file_op' | 'session'> = {
      device_register: 'register',
      device_heartbeat: 'heartbeat',
      session_create: 'session',
      session_connect: 'session',
      session_disconnect: 'session',
      session_expire: 'session',
      command_execute: 'command',
      file_list: 'file_op',
      file_download: 'file_op',
      file_upload: 'file_op',
      file_delete: 'file_op',
      security_violation: 'file_op', // Map to existing type
      authentication_failure: 'register', // Map to existing type
      rate_limit_exceeded: 'heartbeat', // Map to existing type
    };

    return mapping[eventType] || 'file_op';
  }

  /**
   * 生成公钥指纹
   */
  private generateKeyFingerprint(publicKey: string): string {
    // 简化的指纹生成，实际应该使用更复杂的哈希算法
    return publicKey.substring(0, 16) + '...';
  }

  /**
   * 检查是否为敏感命令
   */
  private isSensitiveCommand(command: string): boolean {
    const sensitiveCommands = [
      'passwd', 'password', 'sudo', 'su', 'ssh', 'scp',
      'wget', 'curl', 'nc', 'netcat', 'telnet',
      'rm', 'del', 'format', 'fdisk', 'mkfs',
      'shutdown', 'reboot', 'halt', 'poweroff',
      'chmod', 'chown', 'chgrp',
    ];

    const commandName = command.toLowerCase().split(/\s+/)[0];
    return sensitiveCommands.some(sensitive => 
      commandName.includes(sensitive) || sensitive.includes(commandName)
    );
  }
}

/**
 * 创建审计服务实例
 */
export function createAuditService(env: Env): AuditService {
  return new AuditService(env);
}