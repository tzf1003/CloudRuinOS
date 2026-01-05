/**
 * 管理端通知服务
 * 实现设备离线、安全告警、系统事件等通知功能
 * 支持 WebSocket 实时推送、Webhook、邮件等多种通知渠道
 */

import { Env } from '../index';
import { AlertManager, Alert } from './alerts';

// ============= 通知类型定义 =============

export type NotificationType = 
  | 'device_offline'
  | 'device_online'
  | 'security_alert'
  | 'command_failed'
  | 'high_error_rate'
  | 'session_expired'
  | 'enrollment_new'
  | 'system_alert';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Notification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  timestamp: number;
  deviceId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
  read: boolean;
  readAt?: number;
}

export interface NotificationConfig {
  // WebSocket 推送配�?
  websocketEnabled: boolean;
  
  // Webhook 配置
  webhookEnabled: boolean;
  webhookUrl?: string;
  webhookSecret?: string;
  
  // 邮件配置 (预留)
  emailEnabled: boolean;
  emailRecipients?: string[];
  
  // Slack/Discord 集成 (预留)
  slackEnabled: boolean;
  slackWebhookUrl?: string;
  discordEnabled: boolean;
  discordWebhookUrl?: string;
  
  // 通知过滤
  minPriority: NotificationPriority;
  mutedTypes: NotificationType[];
}

// 默认通知配置
export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  websocketEnabled: true,
  webhookEnabled: false,
  emailEnabled: false,
  slackEnabled: false,
  discordEnabled: false,
  minPriority: 'low',
  mutedTypes: [],
};

// ============= 通知服务�?=============

export class NotificationService {
  private env: Env;
  private config: NotificationConfig;
  private alertManager: AlertManager;

  constructor(env: Env, config?: Partial<NotificationConfig>) {
    this.env = env;
    this.config = { ...DEFAULT_NOTIFICATION_CONFIG, ...config };
    this.alertManager = new AlertManager(env);
  }

  /**
   * 发送通知
   */
  async sendNotification(notification: Omit<Notification, 'id' | 'timestamp' | 'read'>): Promise<Notification> {
    const fullNotification: Notification = {
      ...notification,
      id: this.generateNotificationId(),
      timestamp: Date.now(),
      read: false,
    };

    // 检查优先级过滤
    if (!this.shouldSend(fullNotification)) {
      console.log(`Notification filtered: ${fullNotification.type} (priority: ${fullNotification.priority})`);
      return fullNotification;
    }

    // 存储通知
    await this.storeNotification(fullNotification);

    // 通过各渠道发�?
    await Promise.allSettled([
      this.sendWebSocketNotification(fullNotification),
      this.sendWebhookNotification(fullNotification),
      this.sendSlackNotification(fullNotification),
      this.sendDiscordNotification(fullNotification),
    ]);

    console.log(`Notification sent: [${fullNotification.priority.toUpperCase()}] ${fullNotification.title}`);

    return fullNotification;
  }

  /**
   * 设备离线通知
   */
  async notifyDeviceOffline(deviceId: string, lastSeen: number, platform: string): Promise<Notification> {
    const offlineDuration = Math.floor((Date.now() - lastSeen) / 60000); // 分钟
    
    return this.sendNotification({
      type: 'device_offline',
      priority: offlineDuration > 30 ? 'high' : 'normal',
      title: '设备离线警告',
      message: `设备 ${deviceId} 已离�?${offlineDuration} 分钟`,
      deviceId,
      metadata: {
        lastSeen,
        platform,
        offlineDuration,
      },
    });
  }

  /**
   * 设备上线通知
   */
  async notifyDeviceOnline(deviceId: string, platform: string, previousOfflineDuration?: number): Promise<Notification> {
    return this.sendNotification({
      type: 'device_online',
      priority: 'low',
      title: '设备上线',
      message: previousOfflineDuration 
        ? `设备 ${deviceId} 已重新上线（离线 ${previousOfflineDuration} 分钟后）`
        : `设备 ${deviceId} 已上线`,
      deviceId,
      metadata: {
        platform,
        previousOfflineDuration,
      },
    });
  }

  /**
   * 安全告警通知
   */
  async notifySecurityAlert(
    deviceId: string,
    alertType: string,
    details: string,
    threatLevel: 'low' | 'medium' | 'high' | 'critical'
  ): Promise<Notification> {
    const priorityMap: Record<string, NotificationPriority> = {
      low: 'normal',
      medium: 'high',
      high: 'high',
      critical: 'urgent',
    };

    return this.sendNotification({
      type: 'security_alert',
      priority: priorityMap[threatLevel],
      title: `安全告警: ${alertType}`,
      message: details,
      deviceId,
      metadata: {
        alertType,
        threatLevel,
      },
    });
  }

  /**
   * 命令执行失败通知
   */
  async notifyCommandFailed(
    deviceId: string,
    commandId: string,
    commandType: string,
    error: string
  ): Promise<Notification> {
    return this.sendNotification({
      type: 'command_failed',
      priority: 'normal',
      title: '命令执行失败',
      message: `设备 ${deviceId} 执行命令 ${commandType} 失败: ${error}`,
      deviceId,
      metadata: {
        commandId,
        commandType,
        error,
      },
    });
  }

  /**
   * 新设备注册通知
   */
  async notifyNewEnrollment(deviceId: string, platform: string, version: string): Promise<Notification> {
    return this.sendNotification({
      type: 'enrollment_new',
      priority: 'normal',
      title: '新设备注�?,
      message: `新设�?${deviceId} 已成功注�?(${platform} ${version})`,
      deviceId,
      metadata: {
        platform,
        version,
        enrolledAt: Date.now(),
      },
    });
  }

  /**
   * 系统告警通知 (来自 AlertManager)
   */
  async notifySystemAlert(alert: Alert): Promise<Notification> {
    const priorityMap: Record<string, NotificationPriority> = {
      low: 'low',
      medium: 'normal',
      high: 'high',
      critical: 'urgent',
    };

    return this.sendNotification({
      type: 'system_alert',
      priority: priorityMap[alert.severity],
      title: alert.ruleName,
      message: alert.message,
      metadata: {
        alertId: alert.id,
        ruleId: alert.ruleId,
        severity: alert.severity,
        ...alert.metadata,
      },
    });
  }

  // ============= 通知渠道实现 =============

  /**
   * WebSocket 推�?(通过 Durable Object 广播给在线管理员)
   */
  private async sendWebSocketNotification(notification: Notification): Promise<void> {
    if (!this.config.websocketEnabled) return;

    try {
      // 广播到所有管理员会话
      // 通过 KV 存储待推送的通知，由 WebSocket 会话轮询获取
      const pendingKey = `notification:pending:${notification.id}`;
      await this.env.KV.put(pendingKey, JSON.stringify(notification), {
        expirationTtl: 300, // 5分钟内必须推�?
      });

      // �?KV 中记录待推送列�?
      const listKey = 'notification:pending_list';
      const existingList = await this.env.KV.get<string[]>(listKey, 'json') || [];
      existingList.push(notification.id);
      
      // 只保留最�?100 �?
      if (existingList.length > 100) {
        existingList.splice(0, existingList.length - 100);
      }
      
      await this.env.KV.put(listKey, JSON.stringify(existingList), {
        expirationTtl: 300,
      });

    } catch (error) {
      console.error('Failed to queue WebSocket notification:', error);
    }
  }

  /**
   * Webhook 推�?
   */
  private async sendWebhookNotification(notification: Notification): Promise<void> {
    if (!this.config.webhookEnabled || !this.config.webhookUrl) return;

    try {
      const payload = {
        event: 'notification',
        notification: {
          id: notification.id,
          type: notification.type,
          priority: notification.priority,
          title: notification.title,
          message: notification.message,
          timestamp: notification.timestamp,
          deviceId: notification.deviceId,
          metadata: notification.metadata,
        },
        environment: this.env.ENVIRONMENT,
      };

      // 计算签名
      const signature = await this.computeWebhookSignature(payload);

      const response = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Ruinos-Notification/1.0',
          'X-Signature': signature,
          'X-Timestamp': Date.now().toString(),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error(`Webhook notification failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to send webhook notification:', error);
    }
  }

  /**
   * Slack 推�?
   */
  private async sendSlackNotification(notification: Notification): Promise<void> {
    if (!this.config.slackEnabled || !this.config.slackWebhookUrl) return;

    try {
      const colorMap: Record<NotificationPriority, string> = {
        low: '#36a64f',
        normal: '#2196f3',
        high: '#ff9800',
        urgent: '#f44336',
      };

      const payload = {
        attachments: [{
          color: colorMap[notification.priority],
          title: notification.title,
          text: notification.message,
          fields: [
            {
              title: '类型',
              value: notification.type,
              short: true,
            },
            {
              title: '优先�?,
              value: notification.priority,
              short: true,
            },
            ...(notification.deviceId ? [{
              title: '设备ID',
              value: notification.deviceId,
              short: true,
            }] : []),
          ],
          footer: 'Ruinos',
          ts: Math.floor(notification.timestamp / 1000),
        }],
      };

      await fetch(this.config.slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error('Failed to send Slack notification:', error);
    }
  }

  /**
   * Discord 推�?
   */
  private async sendDiscordNotification(notification: Notification): Promise<void> {
    if (!this.config.discordEnabled || !this.config.discordWebhookUrl) return;

    try {
      const colorMap: Record<NotificationPriority, number> = {
        low: 0x36a64f,
        normal: 0x2196f3,
        high: 0xff9800,
        urgent: 0xf44336,
      };

      const payload = {
        embeds: [{
          title: notification.title,
          description: notification.message,
          color: colorMap[notification.priority],
          fields: [
            { name: '类型', value: notification.type, inline: true },
            { name: '优先�?, value: notification.priority, inline: true },
            ...(notification.deviceId ? [{ name: '设备ID', value: notification.deviceId, inline: true }] : []),
          ],
          footer: { text: 'Ruinos' },
          timestamp: new Date(notification.timestamp).toISOString(),
        }],
      };

      await fetch(this.config.discordWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error('Failed to send Discord notification:', error);
    }
  }

  // ============= 辅助方法 =============

  private shouldSend(notification: Notification): boolean {
    // 检查类型是否被静音
    if (this.config.mutedTypes.includes(notification.type)) {
      return false;
    }

    // 检查优先级
    const priorityOrder: Record<NotificationPriority, number> = {
      low: 0,
      normal: 1,
      high: 2,
      urgent: 3,
    };

    return priorityOrder[notification.priority] >= priorityOrder[this.config.minPriority];
  }

  private generateNotificationId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `notif_${timestamp}_${random}`;
  }

  private async storeNotification(notification: Notification): Promise<void> {
    try {
      const key = `notification:${notification.id}`;
      await this.env.KV.put(key, JSON.stringify(notification), {
        expirationTtl: 86400 * 30, // 保留 30 �?
      });
    } catch (error) {
      console.error('Failed to store notification:', error);
    }
  }

  private async computeWebhookSignature(payload: any): Promise<string> {
    const secret = this.config.webhookSecret || this.env.WEBHOOK_SECRET || 'default-secret';
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(payload));
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, data);
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
  }

  // ============= 查询方法 =============

  /**
   * 获取未读通知
   */
  async getUnreadNotifications(limit: number = 50): Promise<Notification[]> {
    try {
      const keys = await this.env.KV.list({ prefix: 'notification:', limit: limit * 2 });
      const notifications: Notification[] = [];

      for (const key of keys.keys) {
        if (key.name.includes(':pending:') || key.name.includes(':pending_list')) continue;
        
        const data = await this.env.KV.get(key.name);
        if (data) {
          const notification: Notification = JSON.parse(data);
          if (!notification.read) {
            notifications.push(notification);
          }
        }
        
        if (notifications.length >= limit) break;
      }

      return notifications.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      console.error('Failed to get unread notifications:', error);
      return [];
    }
  }

  /**
   * 标记通知已读
   */
  async markAsRead(notificationId: string): Promise<boolean> {
    try {
      const key = `notification:${notificationId}`;
      const data = await this.env.KV.get(key);
      if (!data) return false;

      const notification: Notification = JSON.parse(data);
      notification.read = true;
      notification.readAt = Date.now();

      await this.env.KV.put(key, JSON.stringify(notification), {
        expirationTtl: 86400 * 30,
      });

      return true;
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
      return false;
    }
  }

  /**
   * 获取待推送的 WebSocket 通知
   */
  async getPendingWebSocketNotifications(): Promise<Notification[]> {
    try {
      const listKey = 'notification:pending_list';
      const pendingIds = await this.env.KV.get<string[]>(listKey, 'json') || [];
      
      const notifications: Notification[] = [];
      for (const id of pendingIds) {
        const pendingKey = `notification:pending:${id}`;
        const data = await this.env.KV.get(pendingKey);
        if (data) {
          notifications.push(JSON.parse(data));
          await this.env.KV.delete(pendingKey);
        }
      }

      // 清空待推送列�?
      await this.env.KV.delete(listKey);

      return notifications;
    } catch (error) {
      console.error('Failed to get pending WebSocket notifications:', error);
      return [];
    }
  }

  /**
   * 更新通知配置
   */
  updateConfig(config: Partial<NotificationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取当前配置
   */
  getConfig(): NotificationConfig {
    return { ...this.config };
  }
}

/**
 * 创建通知服务实例
 */
export function createNotificationService(env: Env, config?: Partial<NotificationConfig>): NotificationService {
  return new NotificationService(env, config);
}

/**
 * 设备离线检测定时任�?
 * 检查长时间未心跳的设备并发送通知
 */
export async function checkOfflineDevices(env: Env, notificationService: NotificationService): Promise<void> {
  try {
    const offlineThreshold = 5 * 60 * 1000; // 5 分钟无心跳视为离�?
    const cutoffTime = Date.now() - offlineThreshold;

    // 查询离线设备
    const offlineDevices = await env.DB.prepare(`
      SELECT id, platform, last_seen, status 
      FROM devices 
      WHERE last_seen < ? AND status = 'online'
    `).bind(cutoffTime).all();

    for (const device of offlineDevices.results || []) {
      // 更新设备状�?
      await env.DB.prepare(`
        UPDATE devices SET status = 'offline' WHERE id = ?
      `).bind(device.id).run();

      // 发送离线通知
      await notificationService.notifyDeviceOffline(
        device.id as string,
        device.last_seen as number,
        device.platform as string
      );
    }

    if ((offlineDevices.results?.length || 0) > 0) {
      console.log(`Detected ${offlineDevices.results?.length} offline devices`);
    }
  } catch (error) {
    console.error('Failed to check offline devices:', error);
  }
}
