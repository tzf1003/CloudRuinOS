/**
 * Rollback and recovery system
 * Handles automatic rollback on deployment failures
 */

import { Env } from '../index';

export interface RollbackConfig {
  enabled: boolean;
  healthCheckUrl: string;
  healthCheckTimeout: number;
  maxRetries: number;
  retryDelay: number;
  rollbackOnFailure: boolean;
}

export interface DeploymentStatus {
  version: string;
  timestamp: number;
  status: 'deploying' | 'healthy' | 'unhealthy' | 'rolled_back';
  healthChecks: HealthCheckResult[];
  rollbackReason?: string;
}

export interface HealthCheckResult {
  timestamp: number;
  status: 'success' | 'failure';
  responseTime: number;
  error?: string;
}

/**
 * Rollback manager class
 */
export class RollbackManager {
  private env: Env;
  private config: RollbackConfig;

  constructor(env: Env, config?: Partial<RollbackConfig>) {
    this.env = env;
    this.config = {
      enabled: true,
      healthCheckUrl: '/health',
      healthCheckTimeout: 30000, // 30 seconds
      maxRetries: 3,
      retryDelay: 10000, // 10 seconds
      rollbackOnFailure: true,
      ...config,
    };
  }

  /**
   * Perform post-deployment health check
   */
  async performPostDeploymentCheck(version: string): Promise<DeploymentStatus> {
    const deploymentStatus: DeploymentStatus = {
      version,
      timestamp: Date.now(),
      status: 'deploying',
      healthChecks: [],
    };

    if (!this.config.enabled) {
      deploymentStatus.status = 'healthy';
      return deploymentStatus;
    }

    // Perform health checks with retries
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      const healthCheck = await this.performHealthCheck();
      deploymentStatus.healthChecks.push(healthCheck);

      if (healthCheck.status === 'success') {
        deploymentStatus.status = 'healthy';
        await this.recordSuccessfulDeployment(deploymentStatus);
        return deploymentStatus;
      }

      // Wait before retry (except for last attempt)
      if (attempt < this.config.maxRetries) {
        await this.sleep(this.config.retryDelay);
      }
    }

    // All health checks failed
    deploymentStatus.status = 'unhealthy';
    deploymentStatus.rollbackReason = 'Health checks failed after deployment';

    // Trigger rollback if enabled
    if (this.config.rollbackOnFailure) {
      await this.triggerRollback(deploymentStatus);
    }

    return deploymentStatus;
  }

  /**
   * Perform a single health check
   */
  private async performHealthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      // In a real deployment, this would check the actual deployed service
      // For now, we'll simulate a health check
      const response = await this.makeHealthCheckRequest();
      const responseTime = Date.now() - startTime;

      if (response.ok) {
        return {
          timestamp: Date.now(),
          status: 'success',
          responseTime,
        };
      } else {
        return {
          timestamp: Date.now(),
          status: 'failure',
          responseTime,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }
    } catch (error) {
      return {
        timestamp: Date.now(),
        status: 'failure',
        responseTime: Date.now() - startTime,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Make health check request
   */
  private async makeHealthCheckRequest(): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.healthCheckTimeout);

    try {
      // In production, this would be the actual service URL
      const baseUrl = this.getServiceBaseUrl();
      const healthCheckUrl = `${baseUrl}${this.config.healthCheckUrl}`;

      const response = await fetch(healthCheckUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'RMM-Rollback-System/1.0',
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Get service base URL
   */
  private getServiceBaseUrl(): string {
    // In production, this would be determined from environment
    const environment = this.env.ENVIRONMENT || 'development';
    
    switch (environment) {
      case 'production':
        return 'https://ruinos-server-prod.your-subdomain.workers.dev';
      case 'test':
        return 'https://ruinos-server-test.your-subdomain.workers.dev';
      default:
        return 'http://localhost:8787';
    }
  }

  /**
   * Trigger rollback
   */
  private async triggerRollback(deploymentStatus: DeploymentStatus): Promise<void> {
    try {
      console.log(`Triggering rollback for version ${deploymentStatus.version}`);
      
      // Record rollback event
      deploymentStatus.status = 'rolled_back';
      await this.recordRollbackEvent(deploymentStatus);

      // In production, this would trigger actual rollback via Cloudflare API
      // For now, we'll just log the rollback
      await this.executeRollback(deploymentStatus.version);

      console.log(`Rollback completed for version ${deploymentStatus.version}`);
    } catch (error) {
      console.error('Rollback failed:', error);
      await this.recordRollbackFailure(deploymentStatus, (error as Error).message);
    }
  }

  /**
   * Execute the actual rollback
   */
  private async executeRollback(version: string): Promise<void> {
    // In production, this would use Cloudflare API to rollback
    // For now, we'll simulate the rollback process
    
    const previousVersion = await this.getPreviousVersion();
    if (!previousVersion) {
      throw new Error('No previous version found for rollback');
    }

    console.log(`Rolling back from ${version} to ${previousVersion}`);
    
    // Simulate rollback delay
    await this.sleep(5000);
    
    // In production, this would:
    // 1. Call Cloudflare API to rollback the Worker
    // 2. Update DNS if needed
    // 3. Rollback database migrations if necessary
    // 4. Clear CDN cache
    
    console.log(`Rollback to ${previousVersion} completed`);
  }

  /**
   * Get previous deployment version
   */
  private async getPreviousVersion(): Promise<string | null> {
    try {
      const deploymentHistory = await this.getDeploymentHistory(2);
      return deploymentHistory.length > 1 ? deploymentHistory[1].version : null;
    } catch (error) {
      console.error('Failed to get previous version:', error);
      return null;
    }
  }

  /**
   * Record successful deployment
   */
  private async recordSuccessfulDeployment(deploymentStatus: DeploymentStatus): Promise<void> {
    try {
      await this.env.KV.put(
        `deployment:${deploymentStatus.version}`,
        JSON.stringify(deploymentStatus),
        { expirationTtl: 86400 * 30 } // Keep for 30 days
      );

      // Update latest deployment pointer
      await this.env.KV.put('deployment:latest', deploymentStatus.version);
    } catch (error) {
      console.error('Failed to record successful deployment:', error);
    }
  }

  /**
   * Record rollback event
   */
  private async recordRollbackEvent(deploymentStatus: DeploymentStatus): Promise<void> {
    try {
      await this.env.KV.put(
        `rollback:${deploymentStatus.version}:${Date.now()}`,
        JSON.stringify(deploymentStatus),
        { expirationTtl: 86400 * 30 } // Keep for 30 days
      );

      // Record in audit log
      await this.env.DB.prepare(`
        INSERT INTO audit_logs (device_id, session_id, action_type, action_data, result, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        'system',
        null,
        'deployment_rollback',
        JSON.stringify({
          version: deploymentStatus.version,
          reason: deploymentStatus.rollbackReason,
          healthChecks: deploymentStatus.healthChecks.length,
        }),
        'rollback_triggered',
        Date.now()
      ).run();
    } catch (error) {
      console.error('Failed to record rollback event:', error);
    }
  }

  /**
   * Record rollback failure
   */
  private async recordRollbackFailure(deploymentStatus: DeploymentStatus, error: string): Promise<void> {
    try {
      await this.env.KV.put(
        `rollback_failure:${deploymentStatus.version}:${Date.now()}`,
        JSON.stringify({
          ...deploymentStatus,
          rollbackError: error,
        }),
        { expirationTtl: 86400 * 30 } // Keep for 30 days
      );

      // Record in audit log
      await this.env.DB.prepare(`
        INSERT INTO audit_logs (device_id, session_id, action_type, action_data, result, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        'system',
        null,
        'deployment_rollback',
        JSON.stringify({
          version: deploymentStatus.version,
          reason: deploymentStatus.rollbackReason,
          error,
        }),
        'rollback_failed',
        Date.now()
      ).run();
    } catch (dbError) {
      console.error('Failed to record rollback failure:', dbError);
    }
  }

  /**
   * Get deployment history
   */
  async getDeploymentHistory(limit: number = 10): Promise<DeploymentStatus[]> {
    try {
      const keys = await this.env.KV.list({ prefix: 'deployment:', limit });
      const deployments: DeploymentStatus[] = [];

      for (const key of keys.keys) {
        if (key.name === 'deployment:latest') continue;
        
        const deploymentData = await this.env.KV.get(key.name);
        if (deploymentData) {
          deployments.push(JSON.parse(deploymentData));
        }
      }

      // Sort by timestamp descending
      return deployments.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      console.error('Failed to get deployment history:', error);
      return [];
    }
  }

  /**
   * Get rollback history
   */
  async getRollbackHistory(limit: number = 10): Promise<DeploymentStatus[]> {
    try {
      const keys = await this.env.KV.list({ prefix: 'rollback:', limit });
      const rollbacks: DeploymentStatus[] = [];

      for (const key of keys.keys) {
        const rollbackData = await this.env.KV.get(key.name);
        if (rollbackData) {
          rollbacks.push(JSON.parse(rollbackData));
        }
      }

      // Sort by timestamp descending
      return rollbacks.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      console.error('Failed to get rollback history:', error);
      return [];
    }
  }

  /**
   * Check if rollback is needed based on current health
   */
  async checkRollbackNeeded(): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }

    const healthCheck = await this.performHealthCheck();
    return healthCheck.status === 'failure';
  }

  /**
   * Manual rollback trigger
   */
  async manualRollback(version: string, reason: string): Promise<DeploymentStatus> {
    const deploymentStatus: DeploymentStatus = {
      version,
      timestamp: Date.now(),
      status: 'rolled_back',
      healthChecks: [],
      rollbackReason: reason,
    };

    await this.executeRollback(version);
    await this.recordRollbackEvent(deploymentStatus);

    return deploymentStatus;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create rollback manager
 */
export function createRollbackManager(env: Env, config?: Partial<RollbackConfig>): RollbackManager {
  return new RollbackManager(env, config);
}

/**
 * Deployment health check handler for CI/CD
 */
export async function handleDeploymentHealthCheck(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const version = url.searchParams.get('version');
  
  if (!version) {
    return new Response(JSON.stringify({
      error: 'Version parameter required',
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const rollbackManager = createRollbackManager(env);
  const deploymentStatus = await rollbackManager.performPostDeploymentCheck(version);

  const httpStatus = deploymentStatus.status === 'healthy' ? 200 : 503;

  return new Response(JSON.stringify(deploymentStatus), {
    status: httpStatus,
    headers: { 'Content-Type': 'application/json' },
  });
}