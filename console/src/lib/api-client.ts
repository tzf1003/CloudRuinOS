import axios, { AxiosInstance, AxiosError } from 'axios';
import { getStoredToken } from '../contexts/AuthContext';
import {
  Device,
  Session,
  FileInfo,
  EnrollmentTokenRequest,
  EnrollmentTokenResponse,
  SessionCreateRequest,
  SessionCreateResponse,
  AuditFilters,
  AuditResponse,
  ApiError,
  HealthData,
  SystemMetrics,
  EnrollmentToken,
  HealthStatus,
  Configuration,
  CreateConfigurationRequest,
  ConfigurationScope
} from '../types/api';

// Retry configuration interface
interface RetryConfig {
  maxRetries: number;
  retryDelay: number;
  backoffMultiplier: number;
}

// Prometheus metrics interface
interface PrometheusMetrics {
  [key: string]: {
    help: string;
    type: string;
    value: number;
    labels?: Record<string, string>;
  };
}

class ApiClient {
  private client: AxiosInstance;
  private retryConfig: RetryConfig;

  constructor(baseURL?: string, retryConfig?: Partial<RetryConfig>) {
    this.retryConfig = {
      maxRetries: 3,
      retryDelay: 1000,
      backoffMultiplier: 2,
      ...retryConfig
    };

    this.client = axios.create({
      baseURL: baseURL || '/api',
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor for adding auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = getStoredToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        const apiError: ApiError = {
          error: 'API Error',
          message: error.message,
          code: error.code,
        };

        if (error.response?.data) {
          const responseData = error.response.data as any;
          apiError.error = responseData.error || apiError.error;
          apiError.message = responseData.message || apiError.message;
        }

        return Promise.reject(apiError);
      }
    );
  }

  // Retry mechanism for API calls
  private async withRetry<T>(
    operation: () => Promise<T>,
    retries: number = this.retryConfig.maxRetries
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (retries > 0 && this.isRetryableError(error)) {
        const delay = this.retryConfig.retryDelay * 
          Math.pow(this.retryConfig.backoffMultiplier, this.retryConfig.maxRetries - retries);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.withRetry(operation, retries - 1);
      }
      throw error;
    }
  }

  // Check if error is retryable
  private isRetryableError(error: any): boolean {
    if (error.code === 'ECONNABORTED' || error.code === 'ENOTFOUND') {
      return true; // Network errors
    }
    
    if (error.response?.status) {
      const status = error.response.status;
      return status >= 500 || status === 408 || status === 429; // Server errors, timeout, rate limit
    }
    
    return false;
  }

  // Parse Prometheus metrics format
  private parsePrometheusMetrics(metricsText: string): PrometheusMetrics {
    const metrics: PrometheusMetrics = {};
    const lines = metricsText.split('\n');
    
    let currentMetric = '';
    let help = '';
    let type = '';
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      if (trimmedLine.startsWith('# HELP ')) {
        const parts = trimmedLine.split(' ');
        currentMetric = parts[2];
        help = parts.slice(3).join(' ');
      } else if (trimmedLine.startsWith('# TYPE ')) {
        const parts = trimmedLine.split(' ');
        type = parts[3];
      } else if (trimmedLine && !trimmedLine.startsWith('#')) {
        const spaceIndex = trimmedLine.lastIndexOf(' ');
        if (spaceIndex > 0) {
          const metricPart = trimmedLine.substring(0, spaceIndex);
          const value = parseFloat(trimmedLine.substring(spaceIndex + 1));
          
          let metricName = metricPart;
          let labels: Record<string, string> = {};
          
          // Parse labels if present
          const labelStart = metricPart.indexOf('{');
          if (labelStart > 0) {
            metricName = metricPart.substring(0, labelStart);
            const labelPart = metricPart.substring(labelStart + 1, metricPart.lastIndexOf('}'));
            
            // Simple label parsing
            const labelPairs = labelPart.split(',');
            for (const pair of labelPairs) {
              const [key, val] = pair.split('=');
              if (key && val) {
                labels[key.trim()] = val.trim().replace(/"/g, '');
              }
            }
          }
          
          metrics[metricName] = {
            help: help || '',
            type: type || 'gauge',
            value,
            labels: Object.keys(labels).length > 0 ? labels : undefined
          };
        }
      }
    }
    
    return metrics;
  }

  // Device Management
  async getDevices(): Promise<Device[]> {
    const response = await this.client.get<{success: boolean, devices: Device[], total: number, timestamp: number}>('/devices');
    return response.data.devices;
  }

  async getDevice(deviceId: string): Promise<Device> {
    const response = await this.client.get<{success: boolean, device: Device, timestamp: number}>(`/devices/${deviceId}`);
    return response.data.device;
  }

  async generateEnrollmentToken(request: EnrollmentTokenRequest = {}): Promise<EnrollmentTokenResponse> {
    const response = await this.client.post<{success: boolean, token: string, description?: string, expiresAt: number | null, expiresIn: number | 'never', maxUsage: number, createdBy: string, timestamp: number}>('/enrollment/token', request);
    return {
      token: response.data.token,
      description: response.data.description,
      expiresAt: response.data.expiresAt,
      expiresIn: response.data.expiresIn,
      maxUsage: response.data.maxUsage,
      createdBy: response.data.createdBy,
    };
  }

  // Enrollment Token Management
  async getEnrollmentTokens(params: {
    limit?: number;
    offset?: number;
    status?: 'active' | 'expired' | 'used' | 'all';
    search?: string;
  } = {}): Promise<{tokens: EnrollmentToken[], total: number}> {
    const response = await this.client.get<{success: boolean, tokens: EnrollmentToken[], total: number, limit: number, offset: number, timestamp: number}>('/enrollment/tokens', {
      params
    });
    return {
      tokens: response.data.tokens,
      total: response.data.total,
    };
  }

  async updateEnrollmentToken(id: number, data: {description?: string, isActive?: boolean}): Promise<void> {
    await this.client.put(`/enrollment/token/${id}`, data);
  }

  async deleteEnrollmentToken(id: number): Promise<void> {
    await this.client.delete(`/enrollment/token/${id}`);
  }

  // Session Management
  async getSessions(): Promise<Session[]> {
    const response = await this.client.get<{success: boolean, sessions: Session[], total: number, timestamp: number}>('/sessions');
    return response.data.sessions;
  }

  async createSession(request: SessionCreateRequest): Promise<SessionCreateResponse> {
    const response = await this.client.post<SessionCreateResponse>('/sessions', request);
    return response.data;
  }

  async getSession(sessionId: string): Promise<Session> {
    const response = await this.client.get<Session>(`/sessions/${sessionId}`);
    return response.data;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.client.delete(`/sessions/${sessionId}`);
  }

  // File Management
  async listFiles(deviceId: string, path: string = '/'): Promise<FileInfo[]> {
    const response = await this.client.post<FileInfo[]>('/files/list', {
      device_id: deviceId,
      path,
    });
    return response.data;
  }

  async downloadFile(deviceId: string, path: string): Promise<Blob> {
    const response = await this.client.post('/files/download', {
      device_id: deviceId,
      path,
    }, {
      responseType: 'blob',
    });
    return response.data;
  }

  async uploadFile(deviceId: string, path: string, file: File, onProgress?: (progress: number) => void): Promise<void> {
    const formData = new FormData();
    formData.append('device_id', deviceId);
    formData.append('path', path);
    formData.append('file', file);

    await this.client.post('/files/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
            onProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total));
        }
      }
    });
  }

  // Helper to map DB row to frontend interface
  private mapResponseToConfiguration(row: any): Configuration {
      let configContent = {};
      try {
          configContent = typeof row.content === 'string' ? JSON.parse(row.content) : row.content;
      } catch (e) {
          console.warn('Failed to parse config content for id ' + row.id, e);
      }
      return {
          id: row.id,
          scope: row.scope,
          target: row.target_id || (row.scope === 'global' ? 'default' : '-'),
          config: configContent || {},
          version: row.version,
          updatedAt: row.updated_at * 1000, // Convert to ms for JS Date if needed, or keep as seconds? 
          // Frontend usually expects ms or Date. Backend seems to store seconds (unixepoch()). 
          // Let's assume frontend treats number as timestamp. If backend sends seconds, we might need * 1000?
          // Looking at device lastSeen, it is usually seconds or ms. 
          // Let's check other usages. DeviceRow has created_at INTEGER.
          // Let's multiply by 1000 just in case to match JS Date.now() usually being ms.
          // However, user's JSON showed: "created_at": 1767684109. This is seconds.
          // If frontend uses new Date(timestamp), it expects ms. If it uses moment.unix(), it expects seconds.
          // Let's stick to what it was or check usage.
          // ConfigManagementPage uses: new Date(config.updatedAt).toLocaleString() ?? 
          // No, it just shows {config.updatedBy}. It doesn't show date in the list snippet I saw?
          // Wait, I saw it in list: NO.
          // I saw detailed view: "最新版本 v... 由 ... 更新". No date shown.
          // But let's check DeviceCard.tsx or similar if I can.
          // Anyway, I'll pass raw value for now or assume seconds-to-ms if standard JS Date is used.
          // 1767684109 seconds = year 2026. This matches current date context.
          // JS Date takes ms. So 1767684109 * 1000.
          updatedBy: row.updated_by
      } as Configuration;
  }

  // Configuration Management
  async getConfigurations(scope?: ConfigurationScope, target?: string): Promise<Configuration[]> {
    const response = await this.client.get<any>('/admin/config', {
      params: { scope, target }
    });
    
    let rawData: any[] = [];
    if (response.data && Array.isArray(response.data.data)) {
      rawData = response.data.data;
    } else if (Array.isArray(response.data)) {
      rawData = response.data;
    }

    return rawData.map(row => this.mapResponseToConfiguration(row));
  }

  async getConfiguration(scope: ConfigurationScope, target = 'default'): Promise<Configuration | null> {
    try {
      const response = await this.client.get<any>('/admin/config', {
        params: { scope, target }
      });
      
      let data = response.data;
      if (data && data.data && Array.isArray(data.data)) {
        data = data.data;
      }

      if (Array.isArray(data) && data.length > 0) {
        return this.mapResponseToConfiguration(data[0]);
      }
      return null;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null; // Return null if not found
      }
      throw error;
    }
  }

  async createConfiguration(config: CreateConfigurationRequest): Promise<Configuration> {
    // Backend uses UPSERT on PUT /admin/config
    const response = await this.client.put<Configuration>('/admin/config', {
      scope: config.scope,
      target_id: config.target,
      content: config.config
    });
    return response.data;
  }

  async updateConfiguration(scope: ConfigurationScope, target: string, config: Record<string, any>): Promise<Configuration> {
    // Backend expects { scope, target_id, content } in body
    const response = await this.client.put<Configuration>('/admin/config', {
      scope,
      target_id: target,
      content: config
    });
    return response.data;
  }

  async deleteConfiguration(id: number): Promise<void> {
    await this.client.delete(`/admin/config/${id}`);
  }

  // Audit Logs
  async getAuditLogs(filters: AuditFilters = {}): Promise<AuditResponse> {
    const response = await this.client.get<AuditResponse>('/audit', {
      params: filters,
    });
    return response.data;
  }

  // Command Execution (via WebSocket - this is just for reference)
  createWebSocket(websocketUrl: string): WebSocket {
    return new WebSocket(websocketUrl);
  }

  // Health Monitoring with enhanced error handling and retry
  async getHealth(): Promise<HealthData> {
    return this.withRetry(async () => {
      const response = await this.client.get<HealthData>('/health');
      return response.data;
    });
  }

  async getDetailedHealth(): Promise<HealthData> {
    return this.withRetry(async () => {
      const response = await this.client.get<HealthData>('/health/detailed');
      return response.data;
    });
  }

  async getReadiness(): Promise<{ status: string; timestamp: number }> {
    return this.withRetry(async () => {
      const response = await this.client.get<{ status: string; timestamp: number }>('/health/ready');
      return response.data;
    });
  }

  async getLiveness(): Promise<{ status: string; timestamp: number }> {
    return this.withRetry(async () => {
      const response = await this.client.get<{ status: string; timestamp: number }>('/health/live');
      return response.data;
    });
  }

  async getMetrics(): Promise<SystemMetrics & { prometheus?: PrometheusMetrics }> {
    return this.withRetry(async () => {
      try {
        // Try to get structured metrics first
        const response = await this.client.get<SystemMetrics>('/metrics');
        return response.data;
      } catch (error) {
        // Fallback to Prometheus format if structured format fails
        try {
          const prometheusResponse = await this.client.get<string>('/metrics', {
            headers: { 'Accept': 'text/plain' }
          });
          
          const prometheusMetrics = this.parsePrometheusMetrics(prometheusResponse.data);
          
          // Convert Prometheus metrics to SystemMetrics format
          const systemMetrics: SystemMetrics = {
            uptime: prometheusMetrics['process_uptime_seconds']?.value || 0,
            requestCount: prometheusMetrics['http_requests_total']?.value || 0,
            errorRate: prometheusMetrics['http_request_error_rate']?.value || 0,
            averageResponseTime: prometheusMetrics['http_request_duration_seconds']?.value || 0,
            activeConnections: prometheusMetrics['http_active_connections']?.value || 0,
            memoryUsage: prometheusMetrics['process_memory_usage_bytes']?.value
          };
          
          return {
            ...systemMetrics,
            prometheus: prometheusMetrics
          };
        } catch (prometheusError) {
          throw error; // Re-throw original error if Prometheus parsing also fails
        }
      }
    });
  }

  // Enhanced health check with comprehensive error information
  async getHealthWithDetails(): Promise<{
    health: HealthData;
    readiness: { status: string; timestamp: number };
    liveness: { status: string; timestamp: number };
    metrics: SystemMetrics & { prometheus?: PrometheusMetrics };
    errors: Array<{ endpoint: string; error: string }>;
  }> {
    const errors: Array<{ endpoint: string; error: string }> = [];
    let health: HealthData | null = null;
    let readiness: { status: string; timestamp: number } | null = null;
    let liveness: { status: string; timestamp: number } | null = null;
    let metrics: SystemMetrics & { prometheus?: PrometheusMetrics } | null = null;

    // Collect all health data, tracking errors
    try {
      health = await this.getHealth();
    } catch (error) {
      errors.push({ endpoint: '/health', error: (error as ApiError).message });
    }

    try {
      readiness = await this.getReadiness();
    } catch (error) {
      errors.push({ endpoint: '/health/ready', error: (error as ApiError).message });
    }

    try {
      liveness = await this.getLiveness();
    } catch (error) {
      errors.push({ endpoint: '/health/live', error: (error as ApiError).message });
    }

    try {
      metrics = await this.getMetrics();
    } catch (error) {
      errors.push({ endpoint: '/metrics', error: (error as ApiError).message });
    }

    // Provide fallback data if primary health check failed
    if (!health) {
      health = {
        status: 'unhealthy',
        timestamp: Date.now(),
        version: 'unknown',
        environment: 'unknown',
        checks: {
          database: { status: 'unhealthy', lastCheck: Date.now(), error: 'Health check failed' },
          kv: { status: 'unhealthy', lastCheck: Date.now(), error: 'Health check failed' },
          r2: { status: 'unhealthy', lastCheck: Date.now(), error: 'Health check failed' },
          durableObjects: { status: 'unhealthy', lastCheck: Date.now(), error: 'Health check failed' },
          secrets: { status: 'unhealthy', lastCheck: Date.now(), error: 'Health check failed' }
        }
      };
    }

    if (!readiness) {
      readiness = { status: 'not ready', timestamp: Date.now() };
    }

    if (!liveness) {
      liveness = { status: 'not alive', timestamp: Date.now() };
    }

    if (!metrics) {
      metrics = {
        uptime: 0,
        requestCount: 0,
        errorRate: 1,
        averageResponseTime: 0,
        activeConnections: 0
      };
    }

    return {
      health,
      readiness,
      liveness,
      metrics,
      errors
    };
  }
}

// Create singleton instance with environment-based URL
const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';
export const apiClient = new ApiClient(baseURL);
export default ApiClient;