// API Types for RMM Console
export interface Device {
  id: string;
  deviceId: string;
  name?: string;
  platform: string;
  version: string;
  status: 'online' | 'offline' | 'busy';
  lastSeen: number;
  enrolledAt: number;
  publicKey: string;
  // 添加组件中使用的时间戳字段
  created_at?: number;
  updated_at?: number;
  last_seen?: number;
}

// Enhanced Device Info for detailed view
export interface DetailedDeviceInfo extends Device {
  systemInfo: {
    os: string;
    version: string;
    architecture: string;
    hostname: string;
    uptime: number;
  };
  hardwareInfo: {
    cpu: {
      model: string;
      cores: number;
      usage: number;
    };
    memory: {
      total: number;
      used: number;
      available: number;
    };
    disk: Array<{
      device: string;
      mountpoint: string;
      total: number;
      used: number;
      available: number;
    }>;
  };
  networkInfo: {
    interfaces: Array<{
      name: string;
      type: string;
      ipAddress: string;
      macAddress: string;
      status: 'up' | 'down';
    }>;
    connections: number;
  };
  agentInfo: {
    version: string;
    startTime: number;
    configPath: string;
    logLevel: string;
    features: string[];
  };
}

// Health Monitoring Types
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime?: number;
  error?: string;
  lastCheck: number;
}

export interface HealthData {
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

export interface SystemMetrics {
  uptime: number;
  requestCount: number;
  errorRate: number;
  averageResponseTime: number;
  activeConnections: number;
  memoryUsage?: number;
}

export interface Session {
  id: string;
  device_id: string;
  durableObjectId?: string;
  status: 'pending' | 'active' | 'connected' | 'inactive' | 'expired';
  created_at: number;
  expires_at: number;
  last_activity?: number;
  device_platform?: string;
  device_version?: string;
  // 兼容字段
  deviceId?: string;
  createdAt?: number;
  expiresAt?: number;
  lastActivity?: number;
}

export interface AuditLog {
  id: number;
  device_id: string;
  session_id?: string;
  action_type: string;
  action_data?: string;
  result?: string;
  timestamp: number;
}

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  is_directory: boolean;
  modified: number;
  permissions?: string;
}

export interface CommandResult {
  id: string;
  command: string;
  exit_code: number;
  stdout: string;
  stderr: string;
  timestamp: number;
}

// WebSocket and Terminal Types
export interface TerminalSession {
  id: string;
  deviceId: string;
  websocket: WebSocket | null;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  history: TerminalMessage[];
  currentCommand?: string;
}

export interface TerminalMessage {
  id: string;
  type: 'command' | 'output' | 'error' | 'system';
  content: string;
  timestamp: number;
  exitCode?: number;
}

export interface CommandExecution {
  id: string;
  command: string;
  startTime: number;
  endTime?: number;
  exitCode?: number;
  stdout: string;
  stderr: string;
}

// WebSocket Message Types
export type WebSocketMessage = 
  | AuthMessage
  | CommandMessage
  | CommandResultMessage
  | FileListMessage
  | FileListResultMessage
  | FileGetMessage
  | FileGetResultMessage
  | FilePutMessage
  | FilePutResultMessage
  | PresenceMessage
  | ErrorMessage
  | HeartbeatMessage;

export interface AuthMessage {
  type: 'auth';
  deviceId: string;
  sessionId: string;
  signature: string;
}

export interface CommandMessage {
  type: 'cmd';
  id: string;
  command: string;
  args: string[];
  timeout?: number;
}

export interface CommandResultMessage {
  type: 'cmd_result';
  id: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

export interface FileListMessage {
  type: 'file_list';
  id: string;
  path: string;
}

export interface FileListResultMessage {
  type: 'file_list_result';
  id: string;
  files: FileInfo[];
}

export interface FileGetMessage {
  type: 'file_get';
  id: string;
  path: string;
}

export interface FileGetResultMessage {
  type: 'file_get_result';
  id: string;
  content: string;
  error?: string;
}

export interface FilePutMessage {
  type: 'file_put';
  id: string;
  path: string;
  content: string;
}

export interface FilePutResultMessage {
  type: 'file_put_result';
  id: string;
  success: boolean;
  error?: string;
}

export interface PresenceMessage {
  type: 'presence';
  timestamp: number;
}

export interface ErrorMessage {
  type: 'error';
  error: string;
  message: string;
}

export interface HeartbeatMessage {
  type: 'heartbeat';
  timestamp: number;
}

// File Management Types
export interface FileOperation {
  type: 'list' | 'download' | 'upload' | 'delete';
  path: string;
  status: 'pending' | 'progress' | 'success' | 'error';
  progress?: number;
  error?: string;
}

export interface UploadProgress {
  file: File;
  progress: number;
  status: 'uploading' | 'success' | 'error';
  error?: string;
}

// API Request/Response Types
export interface EnrollmentTokenRequest {
  expiresIn?: number | 'never'; // seconds or 'never' for permanent
  description?: string;
  createdBy?: string;
  maxUsage?: number;
}

export interface EnrollmentTokenResponse {
  token: string;
  description?: string;
  expires_at: number | null;
  expiresIn: number | 'never';
  maxUsage: number;
  createdBy: string;
}

export interface EnrollmentToken {
  id: number;
  token: string;
  description?: string;
  createdBy: string;
  createdAt: number;
  expiresAt: number | null;
  usedAt?: number;
  usedByDevice?: string;
  isActive: boolean;
  usageCount: number;
  maxUsage: number;
  status: 'active' | 'expired' | 'used' | 'disabled';
  isExpired: boolean;
  isPermanent: boolean;
}

export interface SessionCreateRequest {
  device_id: string;
}

export interface SessionCreateResponse {
  session_id: string;
  websocket_url: string;
  expires_at: number;
}

export interface AuditFilters {
  device_id?: string;
  action_type?: string;
  start_time?: number;
  end_time?: number;
  limit?: number;
  offset?: number;
  severity?: 'info' | 'warning' | 'error';
  search?: string;
}

export interface AuditLogEntry {
  id: number;
  deviceId: string;
  sessionId?: string;
  actionType: string;
  actionData?: any;
  result?: string;
  timestamp: number;
  severity: 'info' | 'warning' | 'error';
  userAgent?: string;
  ipAddress?: string;
}

export interface AuditResponse {
  logs: AuditLog[];
  total: number;
  has_more: boolean;
}

export interface ApiError {
  error: string;
  message: string;
  code?: string;
}

// UI State Management Types
export interface AppState {
  health: HealthState;
  devices: DevicesState;
  files: FilesState;
  sessions: SessionsState;
  audit: AuditState;
  ui: UIState;
}

export interface HealthState {
  current: HealthData | null;
  history: HealthData[];
  loading: boolean;
  error: string | null;
  lastUpdate: number;
}

export interface DevicesState {
  devices: Device[];
  selectedDevice: DetailedDeviceInfo | null;
  loading: boolean;
  error: string | null;
}

export interface FilesState {
  currentPath: string;
  files: FileInfo[];
  operations: FileOperation[];
  loading: boolean;
  error: string | null;
}

export interface SessionsState {
  sessions: TerminalSession[];
  activeSession: string | null;
  loading: boolean;
  error: string | null;
}

export interface AuditState {
  logs: AuditLogEntry[];
  filters: AuditFilters;
  total: number;
  loading: boolean;
  error: string | null;
}

export interface UIState {
  notifications: Notification[];
  modals: {
    deviceDetails: boolean;
    fileUpload: boolean;
    sessionCreate: boolean;
  };
  theme: 'light' | 'dark';
  sidebarCollapsed: boolean;
}

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: number;
  duration?: number;
}

// API Response Format
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: number;
  requestId?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}