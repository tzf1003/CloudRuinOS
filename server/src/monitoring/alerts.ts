/**
 * Monitoring and alerting system
 * Handles system alerts and notifications
 */

import { Env } from '../index';

export interface AlertRule {
  id: string;
  name: string;
  condition: AlertCondition;
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  cooldownMinutes: number;
  notificationChannels: string[];
}

export interface AlertCondition {
  metric: string;
  operator: 'gt' | 'lt' | 'eq' | 'ne' | 'gte' | 'lte';
  threshold: number;
  duration?: number; // Duration in seconds the condition must be true
}

export interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: number;
  resolved: boolean;
  resolvedAt?: number;
  metadata?: Record<string, any>;
}

export interface NotificationChannel {
  id: string;
  type: 'webhook' | 'email' | 'slack' | 'discord';
  config: Record<string, any>;
  enabled: boolean;
}

/**
 * Default alert rules for the RMM system
 */
export const DEFAULT_ALERT_RULES: AlertRule[] = [
  {
    id: 'high_error_rate',
    name: 'High Error Rate',
    condition: {
      metric: 'error_rate',
      operator: 'gt',
      threshold: 5, // 5% error rate
      duration: 300, // 5 minutes
    },
    severity: 'high',
    enabled: true,
    cooldownMinutes: 15,
    notificationChannels: ['default_webhook'],
  },
  {
    id: 'database_unhealthy',
    name: 'Database Unhealthy',
    condition: {
      metric: 'database_health',
      operator: 'eq',
      threshold: 0, // 0 = unhealthy
    },
    severity: 'critical',
    enabled: true,
    cooldownMinutes: 5,
    notificationChannels: ['default_webhook', 'critical_alerts'],
  },
  {
    id: 'high_response_time',
    name: 'High Response Time',
    condition: {
      metric: 'avg_response_time',
      operator: 'gt',
      threshold: 5000, // 5 seconds
      duration: 600, // 10 minutes
    },
    severity: 'medium',
    enabled: true,
    cooldownMinutes: 30,
    notificationChannels: ['default_webhook'],
  },
  {
    id: 'low_active_devices',
    name: 'Low Active Devices',
    condition: {
      metric: 'active_devices',
      operator: 'lt',
      threshold: 1, // Less than 1 active device
      duration: 1800, // 30 minutes
    },
    severity: 'low',
    enabled: true,
    cooldownMinutes: 60,
    notificationChannels: ['default_webhook'],
  },
  {
    id: 'failed_heartbeats',
    name: 'High Failed Heartbeat Rate',
    condition: {
      metric: 'failed_heartbeat_rate',
      operator: 'gt',
      threshold: 10, // 10% failed heartbeats
      duration: 300, // 5 minutes
    },
    severity: 'medium',
    enabled: true,
    cooldownMinutes: 20,
    notificationChannels: ['default_webhook'],
  },
];

/**
 * Alert manager class
 */
export class AlertManager {
  private env: Env;
  private rules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private lastAlertTimes: Map<string, number> = new Map();

  constructor(env: Env) {
    this.env = env;
    this.loadDefaultRules();
  }

  /**
   * Load default alert rules
   */
  private loadDefaultRules() {
    for (const rule of DEFAULT_ALERT_RULES) {
      this.rules.set(rule.id, rule);
    }
  }

  /**
   * Add or update an alert rule
   */
  addRule(rule: AlertRule) {
    this.rules.set(rule.id, rule);
  }

  /**
   * Remove an alert rule
   */
  removeRule(ruleId: string) {
    this.rules.delete(ruleId);
  }

  /**
   * Get all alert rules
   */
  getRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values()).filter(alert => !alert.resolved);
  }

  /**
   * Evaluate metrics against alert rules
   */
  async evaluateMetrics(metrics: Record<string, number>): Promise<Alert[]> {
    const triggeredAlerts: Alert[] = [];

    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      const alert = await this.evaluateRule(rule, metrics);
      if (alert) {
        triggeredAlerts.push(alert);
      }
    }

    return triggeredAlerts;
  }

  /**
   * Evaluate a single rule against metrics
   */
  private async evaluateRule(rule: AlertRule, metrics: Record<string, number>): Promise<Alert | null> {
    const metricValue = metrics[rule.condition.metric];
    if (metricValue === undefined) {
      return null;
    }

    const conditionMet = this.evaluateCondition(rule.condition, metricValue);
    if (!conditionMet) {
      // If condition is not met, resolve any active alert for this rule
      await this.resolveAlert(rule.id);
      return null;
    }

    // Check cooldown period
    const lastAlertTime = this.lastAlertTimes.get(rule.id) || 0;
    const cooldownMs = rule.cooldownMinutes * 60 * 1000;
    if (Date.now() - lastAlertTime < cooldownMs) {
      return null;
    }

    // Check if we already have an active alert for this rule
    const existingAlert = this.activeAlerts.get(rule.id);
    if (existingAlert && !existingAlert.resolved) {
      return null;
    }

    // Create new alert
    const alert: Alert = {
      id: `${rule.id}_${Date.now()}`,
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      message: this.generateAlertMessage(rule, metricValue),
      timestamp: Date.now(),
      resolved: false,
      metadata: {
        metricValue,
        threshold: rule.condition.threshold,
        operator: rule.condition.operator,
      },
    };

    this.activeAlerts.set(rule.id, alert);
    this.lastAlertTimes.set(rule.id, Date.now());

    // Send notifications
    await this.sendNotifications(alert, rule.notificationChannels);

    return alert;
  }

  /**
   * Evaluate a condition against a metric value
   */
  private evaluateCondition(condition: AlertCondition, value: number): boolean {
    switch (condition.operator) {
      case 'gt':
        return value > condition.threshold;
      case 'lt':
        return value < condition.threshold;
      case 'eq':
        return value === condition.threshold;
      case 'ne':
        return value !== condition.threshold;
      case 'gte':
        return value >= condition.threshold;
      case 'lte':
        return value <= condition.threshold;
      default:
        return false;
    }
  }

  /**
   * Generate alert message
   */
  private generateAlertMessage(rule: AlertRule, value: number): string {
    const { condition } = rule;
    const operatorText = {
      gt: 'greater than',
      lt: 'less than',
      eq: 'equal to',
      ne: 'not equal to',
      gte: 'greater than or equal to',
      lte: 'less than or equal to',
    }[condition.operator];

    return `${rule.name}: ${condition.metric} is ${value} (${operatorText} ${condition.threshold})`;
  }

  /**
   * Resolve an alert
   */
  private async resolveAlert(ruleId: string) {
    const alert = this.activeAlerts.get(ruleId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = Date.now();

      // Send resolution notification
      const rule = this.rules.get(ruleId);
      if (rule) {
        await this.sendResolutionNotifications(alert, rule.notificationChannels);
      }
    }
  }

  /**
   * Send alert notifications
   */
  private async sendNotifications(alert: Alert, channels: string[]) {
    for (const channelId of channels) {
      try {
        await this.sendNotification(alert, channelId);
      } catch (error) {
        console.error(`Failed to send notification to channel ${channelId}:`, error);
      }
    }
  }

  /**
   * Send resolution notifications
   */
  private async sendResolutionNotifications(alert: Alert, channels: string[]) {
    for (const channelId of channels) {
      try {
        await this.sendResolutionNotification(alert, channelId);
      } catch (error) {
        console.error(`Failed to send resolution notification to channel ${channelId}:`, error);
      }
    }
  }

  /**
   * Send a single notification
   */
  private async sendNotification(alert: Alert, channelId: string) {
    // For now, just log the alert
    // In production, this would integrate with actual notification services
    console.log(`ALERT [${alert.severity.toUpperCase()}] ${alert.message}`);
    
    // Store alert in KV for persistence
    await this.env.KV.put(
      `alert:${alert.id}`,
      JSON.stringify(alert),
      { expirationTtl: 86400 * 7 } // Keep for 7 days
    );

    // If webhook channel is configured, send webhook
    if (channelId === 'default_webhook' && this.env.WEBHOOK_SECRET) {
      await this.sendWebhookNotification(alert);
    }
  }

  /**
   * Send resolution notification
   */
  private async sendResolutionNotification(alert: Alert, channelId: string) {
    console.log(`RESOLVED [${alert.severity.toUpperCase()}] ${alert.ruleName} - Alert resolved`);
    
    // Update alert in KV
    await this.env.KV.put(
      `alert:${alert.id}`,
      JSON.stringify(alert),
      { expirationTtl: 86400 * 7 } // Keep for 7 days
    );
  }

  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(alert: Alert) {
    try {
      const webhookUrl = await this.env.KV.get('webhook_url');
      if (!webhookUrl) {
        return;
      }

      const payload = {
        type: 'alert',
        alert: {
          id: alert.id,
          severity: alert.severity,
          message: alert.message,
          timestamp: alert.timestamp,
          environment: this.env.ENVIRONMENT,
        },
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'RMM-Alert-System/1.0',
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
   * Get alert history
   */
  async getAlertHistory(limit: number = 100): Promise<Alert[]> {
    try {
      const keys = await this.env.KV.list({ prefix: 'alert:', limit });
      const alerts: Alert[] = [];

      for (const key of keys.keys) {
        const alertData = await this.env.KV.get(key.name);
        if (alertData) {
          alerts.push(JSON.parse(alertData));
        }
      }

      // Sort by timestamp descending
      return alerts.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      console.error('Failed to get alert history:', error);
      return [];
    }
  }

  /**
   * Clear resolved alerts older than specified days
   */
  async cleanupOldAlerts(daysOld: number = 30) {
    try {
      const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
      const keys = await this.env.KV.list({ prefix: 'alert:' });

      for (const key of keys.keys) {
        const alertData = await this.env.KV.get(key.name);
        if (alertData) {
          const alert: Alert = JSON.parse(alertData);
          if (alert.resolved && alert.resolvedAt && alert.resolvedAt < cutoffTime) {
            await this.env.KV.delete(key.name);
          }
        }
      }
    } catch (error) {
      console.error('Failed to cleanup old alerts:', error);
    }
  }
}

/**
 * Create and configure alert manager
 */
export function createAlertManager(env: Env): AlertManager {
  return new AlertManager(env);
}

/**
 * Collect system metrics for alerting
 */
export async function collectAlertingMetrics(env: Env): Promise<Record<string, number>> {
  const metrics: Record<string, number> = {};

  try {
    // Database health (1 = healthy, 0 = unhealthy)
    try {
      await env.DB.prepare('SELECT 1').first();
      metrics.database_health = 1;
    } catch {
      metrics.database_health = 0;
    }

    // KV health (1 = healthy, 0 = unhealthy)
    try {
      await env.KV.get('health_check');
      metrics.kv_health = 1;
    } catch {
      metrics.kv_health = 0;
    }

    // R2 health (1 = healthy, 0 = unhealthy)
    try {
      await env.R2.list({ limit: 1 });
      metrics.r2_health = 1;
    } catch {
      metrics.r2_health = 0;
    }

    // Count active devices (devices with heartbeat in last 5 minutes)
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    const activeDevicesResult = await env.DB.prepare(`
      SELECT COUNT(*) as count 
      FROM devices 
      WHERE last_seen > ?
    `).bind(fiveMinutesAgo).first();
    
    metrics.active_devices = (activeDevicesResult as any)?.count || 0;

    // Calculate error rate from recent audit logs (last hour)
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const errorLogsResult = await env.DB.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN result LIKE '%error%' OR result LIKE '%failed%' THEN 1 ELSE 0 END) as errors
      FROM audit_logs 
      WHERE timestamp > ?
    `).bind(oneHourAgo).first();
    
    const total = (errorLogsResult as any)?.total || 0;
    const errors = (errorLogsResult as any)?.errors || 0;
    metrics.error_rate = total > 0 ? (errors / total) * 100 : 0;

    // Calculate failed heartbeat rate (last hour)
    const failedHeartbeatsResult = await env.DB.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN result LIKE '%failed%' OR result LIKE '%error%' THEN 1 ELSE 0 END) as failed
      FROM audit_logs 
      WHERE action_type = 'heartbeat' AND timestamp > ?
    `).bind(oneHourAgo).first();
    
    const totalHeartbeats = (failedHeartbeatsResult as any)?.total || 0;
    const failedHeartbeats = (failedHeartbeatsResult as any)?.failed || 0;
    metrics.failed_heartbeat_rate = totalHeartbeats > 0 ? (failedHeartbeats / totalHeartbeats) * 100 : 0;

    // Average response time (simplified - would be tracked in production)
    metrics.avg_response_time = 100; // Placeholder

  } catch (error) {
    console.error('Failed to collect alerting metrics:', error);
  }

  return metrics;
}