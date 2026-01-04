import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import {
  AuditFilters,
  EnrollmentTokenRequest,
  SessionCreateRequest,
} from '../types/api';

// Query Keys
export const queryKeys = {
  devices: ['devices'] as const,
  device: (id: string) => ['devices', id] as const,
  sessions: ['sessions'] as const,
  session: (id: string) => ['sessions', id] as const,
  auditLogs: (filters: AuditFilters) => ['audit', filters] as const,
  files: (deviceId: string, path: string) => ['files', deviceId, path] as const,
};

// Device Hooks
export function useDevices() {
  return useQuery({
    queryKey: queryKeys.devices,
    queryFn: () => apiClient.getDevices(),
    refetchInterval: 30000, // Refresh every 30 seconds for device status
  });
}

export function useDevice(deviceId: string) {
  return useQuery({
    queryKey: queryKeys.device(deviceId),
    queryFn: () => apiClient.getDevice(deviceId),
    enabled: !!deviceId,
  });
}

export function useGenerateEnrollmentToken() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (request: EnrollmentTokenRequest) => 
      apiClient.generateEnrollmentToken(request),
    onSuccess: () => {
      // Invalidate tokens query to refresh the list
      queryClient.invalidateQueries({ queryKey: ['enrollmentTokens'] });
    },
  });
}

// Enrollment Token Management Hooks
export function useEnrollmentTokens(params: {
  limit?: number;
  offset?: number;
  status?: 'active' | 'expired' | 'used' | 'all';
  search?: string;
} = {}) {
  return useQuery({
    queryKey: ['enrollmentTokens', params],
    queryFn: () => apiClient.getEnrollmentTokens(params),
  });
}

export function useUpdateEnrollmentToken() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: {description?: string, isActive?: boolean} }) =>
      apiClient.updateEnrollmentToken(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrollmentTokens'] });
    },
  });
}

export function useDeleteEnrollmentToken() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: number) => apiClient.deleteEnrollmentToken(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrollmentTokens'] });
    },
  });
}

// Session Hooks
export function useSessions() {
  return useQuery({
    queryKey: queryKeys.sessions,
    queryFn: () => apiClient.getSessions(),
    refetchInterval: 10000, // Refresh every 10 seconds for session status
  });
}

export function useSession(sessionId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.session(sessionId),
    queryFn: () => apiClient.getSession(sessionId),
    enabled: !!sessionId && (options?.enabled !== false),
    refetchInterval: 5000, // 每5秒刷新一次会话详情
  });
}

export function useCreateSession() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (request: SessionCreateRequest) => 
      apiClient.createSession(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
    },
  });
}

export function useDeleteSession() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (sessionId: string) => apiClient.deleteSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
    },
  });
}

// File Management Hooks
export function useFiles(deviceId: string, path: string = '/') {
  return useQuery({
    queryKey: queryKeys.files(deviceId, path),
    queryFn: () => apiClient.listFiles(deviceId, path),
    enabled: !!deviceId,
  });
}

export function useDownloadFile() {
  return useMutation({
    mutationFn: ({ deviceId, path }: { deviceId: string; path: string }) =>
      apiClient.downloadFile(deviceId, path),
  });
}

export function useUploadFile() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ deviceId, path, file }: { deviceId: string; path: string; file: File }) =>
      apiClient.uploadFile(deviceId, path, file),
    onSuccess: (_data, variables) => {
      // Invalidate the file list for the directory
      const dirPath = variables.path.split('/').slice(0, -1).join('/') || '/';
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.files(variables.deviceId, dirPath) 
      });
    },
  });
}

// Audit Logs Hook
export function useAuditLogs(filters: AuditFilters = {}) {
  return useQuery({
    queryKey: queryKeys.auditLogs(filters),
    queryFn: () => apiClient.getAuditLogs(filters),
  });
}