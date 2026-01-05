/**
 * Health check and monitoring endpoints
 * Provides system health status and monitoring metrics
 */

import { Env } from '../../index';

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  version: string;
  environment: string;
  checks: {
    database: HealthStatus;
    kv: HealthStatus;
    r2: HealthStatus;
    durableObjects: HealthStatus;
    secrets: HealthStatus;
  };
  metrics?: SystemMetrics;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime?: number;
  error?: string;
  lastCheck: number;
}

export interface SystemMetrics {
  uptime: number;
  requestCount: number;
  errorRate: number;
  averageResponseTime: number;
  activeConnections: number;
  memoryUsage?: number;
}

/**
 * Basic health check endpoint
 */
export async function handleHealthCheck(request: Request, env: Env): Promise<Response> {
  const startTime = Date.now();
  
  try {
    const healthResult = await performHealthChecks(env);
    const responseTime = Date.now() - startTime;
    
    // Add response time to result
    healthResult.metrics = {
      ...healthResult.metrics,
      averageResponseTime: responseTime,
      uptime: Date.now() - (Date.now() % 86400000), // Simplified uptime
      requestCount: 0, // Would be tracked in production
      errorRate: 0, // Would be calculated from metrics
      activeConnections: 0, // Would be tracked from Durable Objects
    };
    
    const httpStatus = getHttpStatusFromHealth(healthResult.status);
    
    return new Response(JSON.stringify(healthResult), {
      status: httpStatus,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Health-Status': healthResult.status,
        'X-Response-Time': responseTime.toString(),
      },
    });
  } catch (error) {
    console.error('Health check failed:', error);
    
    const errorResult: HealthCheckResult = {
      status: 'unhealthy',
      timestamp: Date.now(),
      version: env.API_VERSION || 'unknown',
      environment: env.ENVIRONMENT || 'unknown',
      checks: {
        database: { status: 'unhealthy', error: 'Health check failed', lastCheck: Date.now() },
        kv: { status: 'unhealthy', error: 'Health check failed', lastCheck: Date.now() },
        r2: { status: 'unhealthy', error: 'Health check failed', lastCheck: Date.now() },
        durableObjects: { status: 'unhealthy', error: 'Health check failed', lastCheck: Date.now() },
        secrets: { status: 'unhealthy', error: 'Health check failed', lastCheck: Date.now() },
      },
    };
    
    return new Response(JSON.stringify(errorResult), {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'X-Health-Status': 'unhealthy',
      },
    });
  }
}

/**
 * Detailed health check with metrics
 */
export async function handleDetailedHealthCheck(request: Request, env: Env): Promise<Response> {
  const startTime = Date.now();
  
  try {
    const healthResult = await performDetailedHealthChecks(env);
    const responseTime = Date.now() - startTime;
    
    // Add detailed metrics
    healthResult.metrics = await getDetailedMetrics(env, responseTime);
    
    const httpStatus = getHttpStatusFromHealth(healthResult.status);
    
    return new Response(JSON.stringify(healthResult), {
      status: httpStatus,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Health-Status': healthResult.status,
        'X-Response-Time': responseTime.toString(),
      },
    });
  } catch (error) {
    console.error('Detailed health check failed:', error);
    
    return new Response(JSON.stringify({
      status: 'unhealthy',
      error: 'Detailed health check failed',
      timestamp: Date.now(),
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Readiness probe for Kubernetes/container orchestration
 */
export async function handleReadinessCheck(request: Request, env: Env): Promise<Response> {
  try {
    // Check if all critical services are ready
    const checks = await Promise.all([
      checkDatabaseReadiness(env),
      checkSecretsReadiness(env),
    ]);
    
    const allReady = checks.every(check => check.status === 'healthy');
    
    if (allReady) {
      return new Response('Ready', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    } else {
      return new Response('Not Ready', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
  } catch (error) {
    return new Response('Not Ready', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

/**
 * Liveness probe for Kubernetes/container orchestration
 */
export async function handleLivenessCheck(request: Request, env: Env): Promise<Response> {
  // Simple liveness check - if we can respond, we're alive
  return new Response('Alive', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
}

/**
 * Metrics endpoint for monitoring systems
 */
export async function handleMetrics(request: Request, env: Env): Promise<Response> {
  try {
    const metrics = await getDetailedMetrics(env, 0);
    
    // Return metrics in Prometheus format if requested
    const acceptHeader = request.headers.get('Accept') || '';
    if (acceptHeader.includes('text/plain') || acceptHeader.includes('application/openmetrics-text')) {
      const prometheusMetrics = formatPrometheusMetrics(metrics, env);
      return new Response(prometheusMetrics, {
        status: 200,
        headers: { 'Content-Type': 'text/plain; version=0.0.4' },
      });
    }
    
    // Return JSON metrics by default
    return new Response(JSON.stringify(metrics), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Metrics collection failed:', error);
    return new Response('Metrics collection failed', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

/**
 * Perform basic health checks
 */
async function performHealthChecks(env: Env): Promise<HealthCheckResult> {
  const timestamp = Date.now();
  
  const [dbCheck, kvCheck, r2Check, doCheck, secretsCheck] = await Promise.allSettled([
    checkDatabaseHealth(env),
    checkKVHealth(env),
    checkR2Health(env),
    checkDurableObjectsHealth(env),
    checkSecretsHealth(env),
  ]);
  
  const checks = {
    database: getCheckResult(dbCheck),
    kv: getCheckResult(kvCheck),
    r2: getCheckResult(r2Check),
    durableObjects: getCheckResult(doCheck),
    secrets: getCheckResult(secretsCheck),
  };
  
  // Determine overall status
  const statuses = Object.values(checks).map(check => check.status);
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  
  if (statuses.every(status => status === 'healthy')) {
    overallStatus = 'healthy';
  } else if (statuses.some(status => status === 'unhealthy')) {
    overallStatus = 'unhealthy';
  } else {
    overallStatus = 'degraded';
  }
  
  return {
    status: overallStatus,
    timestamp,
    version: env.API_VERSION || '1.0.0',
    environment: env.ENVIRONMENT || 'unknown',
    checks,
  };
}

/**
 * Perform detailed health checks with timing
 */
async function performDetailedHealthChecks(env: Env): Promise<HealthCheckResult> {
  const result = await performHealthChecks(env);
  
  // Add more detailed checks here if needed
  // For example, check specific database tables, KV keys, etc.
  
  return result;
}

/**
 * Check database health
 */
async function checkDatabaseHealth(env: Env): Promise<HealthStatus> {
  const startTime = Date.now();
  
  try {
    // Simple query to check database connectivity
    const result = await env.DB.prepare('SELECT 1 as test').first();
    const responseTime = Date.now() - startTime;
    
    if (result && result.test === 1) {
      return {
        status: 'healthy',
        responseTime,
        lastCheck: Date.now(),
      };
    } else {
      return {
        status: 'unhealthy',
        error: 'Database query returned unexpected result',
        responseTime,
        lastCheck: Date.now(),
      };
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      error: `Database error: ${(error as Error).message}`,
      responseTime: Date.now() - startTime,
      lastCheck: Date.now(),
    };
  }
}

/**
 * Check database readiness
 */
async function checkDatabaseReadiness(env: Env): Promise<HealthStatus> {
  try {
    // Check if required tables exist
    const tables = await env.DB.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name IN ('devices', 'sessions', 'audit_logs')
    `).all();
    
    const requiredTables = ['devices', 'sessions', 'audit_logs'];
    const existingTables = tables.results.map((row: any) => row.name);
    const missingTables = requiredTables.filter(table => !existingTables.includes(table));
    
    if (missingTables.length === 0) {
      return { status: 'healthy', lastCheck: Date.now() };
    } else {
      return {
        status: 'unhealthy',
        error: `Missing tables: ${missingTables.join(', ')}`,
        lastCheck: Date.now(),
      };
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      error: `Database readiness check failed: ${(error as Error).message}`,
      lastCheck: Date.now(),
    };
  }
}

/**
 * Check KV health
 */
async function checkKVHealth(env: Env): Promise<HealthStatus> {
  const startTime = Date.now();
  
  try {
    const testKey = `health_check_${Date.now()}`;
    const testValue = 'test';
    
    // Write test value
    await env.KV.put(testKey, testValue, { expirationTtl: 60 });
    
    // Read test value
    const result = await env.KV.get(testKey);
    
    // Clean up
    await env.KV.delete(testKey);
    
    const responseTime = Date.now() - startTime;
    
    if (result === testValue) {
      return {
        status: 'healthy',
        responseTime,
        lastCheck: Date.now(),
      };
    } else {
      return {
        status: 'unhealthy',
        error: 'KV read/write test failed',
        responseTime,
        lastCheck: Date.now(),
      };
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      error: `KV error: ${(error as Error).message}`,
      responseTime: Date.now() - startTime,
      lastCheck: Date.now(),
    };
  }
}

/**
 * Check R2 health
 */
async function checkR2Health(env: Env): Promise<HealthStatus> {
  const startTime = Date.now();
  
  try {
    // Simple list operation to check R2 connectivity
    const result = await env.R2.list({ limit: 1 });
    const responseTime = Date.now() - startTime;
    
    return {
      status: 'healthy',
      responseTime,
      lastCheck: Date.now(),
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: `R2 error: ${(error as Error).message}`,
      responseTime: Date.now() - startTime,
      lastCheck: Date.now(),
    };
  }
}

/**
 * Check Durable Objects health
 */
async function checkDurableObjectsHealth(env: Env): Promise<HealthStatus> {
  const startTime = Date.now();
  
  try {
    // Create a test Durable Object instance
    const id = env.SESSION_DO.idFromName('health_check');
    const stub = env.SESSION_DO.get(id);
    
    // Make a simple request to check if DO is responsive
    const response = await stub.fetch('http://localhost/session/status');
    const responseTime = Date.now() - startTime;
    
    if (response.ok) {
      return {
        status: 'healthy',
        responseTime,
        lastCheck: Date.now(),
      };
    } else {
      return {
        status: 'degraded',
        error: `Durable Object returned status ${response.status}`,
        responseTime,
        lastCheck: Date.now(),
      };
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      error: `Durable Objects error: ${(error as Error).message}`,
      responseTime: Date.now() - startTime,
      lastCheck: Date.now(),
    };
  }
}

/**
 * Check secrets health
 */
async function checkSecretsHealth(env: Env): Promise<HealthStatus> {
  try {
    const requiredSecrets = [
      'ENROLLMENT_SECRET',
      'JWT_SECRET',
      'WEBHOOK_SECRET',
      'DB_ENCRYPTION_KEY',
      'ADMIN_API_KEY'
    ];
    
    const missingSecrets: string[] = [];
    
    for (const secret of requiredSecrets) {
      if (!(env as any)[secret] || (env as any)[secret].trim() === '') {
        missingSecrets.push(secret);
      }
    }
    
    if (missingSecrets.length === 0) {
      return { status: 'healthy', lastCheck: Date.now() };
    } else {
      return {
        status: 'unhealthy',
        error: `Missing secrets: ${missingSecrets.join(', ')}`,
        lastCheck: Date.now(),
      };
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      error: `Secrets check failed: ${(error as Error).message}`,
      lastCheck: Date.now(),
    };
  }
}

/**
 * Check secrets readiness
 */
async function checkSecretsReadiness(env: Env): Promise<HealthStatus> {
  return checkSecretsHealth(env);
}

/**
 * Get detailed system metrics
 */
async function getDetailedMetrics(env: Env, responseTime: number): Promise<SystemMetrics> {
  // In a real implementation, these would be tracked over time
  // For now, return basic metrics
  
  return {
    uptime: Date.now() - (Date.now() % 86400000), // Simplified uptime
    requestCount: 0, // Would be tracked in production
    errorRate: 0, // Would be calculated from error logs
    averageResponseTime: responseTime,
    activeConnections: 0, // Would be tracked from Durable Objects
  };
}

/**
 * Format metrics in Prometheus format
 */
function formatPrometheusMetrics(metrics: SystemMetrics, env: Env): string {
  const environment = env.ENVIRONMENT || 'unknown';
  const version = env.API_VERSION || 'unknown';
  
  return `
# HELP ruinos_uptime_seconds Total uptime in seconds
# TYPE ruinos_uptime_seconds counter
ruinos_uptime_seconds{environment="${environment}",version="${version}"} ${Math.floor(metrics.uptime / 1000)}

# HELP ruinos_requests_total Total number of requests
# TYPE ruinos_requests_total counter
ruinos_requests_total{environment="${environment}",version="${version}"} ${metrics.requestCount}

# HELP ruinos_error_rate Error rate percentage
# TYPE ruinos_error_rate gauge
ruinos_error_rate{environment="${environment}",version="${version}"} ${metrics.errorRate}

# HELP ruinos_response_time_ms Average response time in milliseconds
# TYPE ruinos_response_time_ms gauge
ruinos_response_time_ms{environment="${environment}",version="${version}"} ${metrics.averageResponseTime}

# HELP ruinos_active_connections Number of active WebSocket connections
# TYPE ruinos_active_connections gauge
ruinos_active_connections{environment="${environment}",version="${version}"} ${metrics.activeConnections}
`.trim();
}

/**
 * Helper function to get check result from Promise.allSettled result
 */
function getCheckResult(settledResult: PromiseSettledResult<HealthStatus>): HealthStatus {
  if (settledResult.status === 'fulfilled') {
    return settledResult.value;
  } else {
    return {
      status: 'unhealthy',
      error: settledResult.reason?.message || 'Check failed',
      lastCheck: Date.now(),
    };
  }
}

/**
 * Convert health status to HTTP status code
 */
function getHttpStatusFromHealth(status: 'healthy' | 'degraded' | 'unhealthy'): number {
  switch (status) {
    case 'healthy':
      return 200;
    case 'degraded':
      return 200; // Still operational but with issues
    case 'unhealthy':
      return 503;
    default:
      return 503;
  }
}