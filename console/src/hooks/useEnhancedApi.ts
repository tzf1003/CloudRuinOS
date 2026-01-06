import React from 'react';
import { useQuery, useMutation, useQueryClient, UseQueryOptions, UseMutationOptions } from '@tanstack/react-query';
import { useGlobalLoading, useOperations } from '../contexts/UIContext';
import { useToast } from '../components/NotificationSystem';
import { apiClient } from '../lib/api-client';
import { 
  AuditFilters, 
  EnrollmentTokenRequest, 
  SessionCreateRequest,
  Device,
  Session,
  AuditLogEntry,
  FileInfo
} from '../types/api';

// 增强的查询Hook，自动处理加载状态
export function useEnhancedQuery<TData, TError = Error>(
  options: UseQueryOptions<TData, TError> & {
    showGlobalLoading?: boolean;
    loadingMessage?: string;
    successMessage?: string;
    errorMessage?: string;
  }
) {
  const { setGlobalLoading } = useGlobalLoading();
  const toast = useToast();

  const query = useQuery({
    ...options,
    onSuccess: (data) => {
      if (options.showGlobalLoading) {
        setGlobalLoading(false);
      }
      if (options.successMessage) {
        toast.success(options.successMessage);
      }
      options.onSuccess?.(data);
    },
    onError: (error) => {
      if (options.showGlobalLoading) {
        setGlobalLoading(false);
      }
      if (options.errorMessage) {
        toast.error(options.errorMessage, error instanceof Error ? error.message : '未知错误');
      }
      options.onError?.(error);
    },
  });

  // 设置全局加载状态
  React.useEffect(() => {
    if (options.showGlobalLoading && query.isLoading) {
      setGlobalLoading(true, options.loadingMessage);
    }
  }, [query.isLoading, options.showGlobalLoading, options.loadingMessage, setGlobalLoading]);

  return query;
}

// 增强的变更Hook，自动处理操作进度和通知
export function useEnhancedMutation<TData, TError = Error, TVariables = void>(
  options: UseMutationOptions<TData, TError, TVariables> & {
    operationType?: 'upload' | 'download' | 'api' | 'websocket';
    operationMessage?: string;
    successMessage?: string;
    errorMessage?: string;
    showProgress?: boolean;
  }
) {
  const { startOperation, updateOperation, completeOperation } = useOperations();
  const toast = useToast();

  const mutation = useMutation({
    ...options,
    onMutate: (variables) => {
      let operationId: string | undefined;
      
      if (options.showProgress) {
        operationId = `operation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        startOperation({
          id: operationId,
          type: options.operationType || 'api',
          status: 'pending',
          progress: 0,
          message: options.operationMessage,
        });
      }

      const result = options.onMutate?.(variables);
      return { ...(result as any), operationId };
    },
    onSuccess: (data, variables, context) => {
      const ctx = context as any;
      if (ctx?.operationId) {
        completeOperation(ctx.operationId, true, options.successMessage);
      } else if (options.successMessage) {
        toast.success(options.successMessage);
      }
      
      options.onSuccess?.(data, variables, context);
    },
    onError: (error, variables, context) => {
      const ctx = context as any;
      if (ctx?.operationId) {
        completeOperation(
          ctx.operationId, 
          false, 
          error instanceof Error ? error.message : '操作失败'
        );
      } else if (options.errorMessage) {
        toast.error(
          options.errorMessage, 
          error instanceof Error ? error.message : '未知错误'
        );
      }
      
      options.onError?.(error, variables, context);
    },
  });

  // 提供更新进度的方法
  const updateProgress = (progress: number, message?: string) => {
    const context = mutation.context as any;
    if (context?.operationId) {
      updateOperation(context.operationId, { 
        status: 'progress', 
        progress, 
        message 
      });
    }
  };

  return {
    ...mutation,
    updateProgress,
  };
}

// 设备相关的增强Hook
export function useEnhancedDevices() {
  return useEnhancedQuery({
    queryKey: ['devices'],
    queryFn: () => apiClient.getDevices(),
    refetchInterval: 30000,
    errorMessage: '获取设备列表失败',
  });
}

export function useEnhancedDevice(deviceId: string) {
  return useEnhancedQuery({
    queryKey: ['devices', deviceId],
    queryFn: () => apiClient.getDevice(deviceId),
    enabled: !!deviceId,
    errorMessage: '获取设备详情失败',
  });
}

// 文件管理相关的增强Hook
export function useEnhancedFiles(deviceId: string, path: string = '/') {
  return useEnhancedQuery({
    queryKey: ['files', deviceId, path],
    queryFn: () => apiClient.listFiles(deviceId, path),
    enabled: !!deviceId,
    errorMessage: '获取文件列表失败',
  });
}

export function useEnhancedFileUpload() {
  const queryClient = useQueryClient();
  
  return useEnhancedMutation({
    mutationFn: ({ deviceId, path, file }: { deviceId: string; path: string; file: File }) =>
      apiClient.uploadFile(deviceId, path, file),
    operationType: 'upload',
    showProgress: true,
    successMessage: '文件上传成功',
    errorMessage: '文件上传失败',
    onSuccess: (_data, variables) => {
      const dirPath = variables.path.split('/').slice(0, -1).join('/') || '/';
      queryClient.invalidateQueries({ 
        queryKey: ['files', variables.deviceId, dirPath] 
      });
    },
  });
}

export function useEnhancedFileDownload() {
  return useEnhancedMutation({
    mutationFn: ({ deviceId, path }: { deviceId: string; path: string }) =>
      apiClient.downloadFile(deviceId, path),
    operationType: 'download',
    showProgress: true,
    successMessage: '文件下载成功',
    errorMessage: '文件下载失败',
  });
}

// 会话管理相关的增强Hook
export function useEnhancedSessions() {
  return useEnhancedQuery({
    queryKey: ['sessions'],
    queryFn: () => apiClient.getSessions(),
    refetchInterval: 10000,
    errorMessage: '获取会话列表失败',
  });
}

export function useEnhancedCreateSession() {
  const queryClient = useQueryClient();
  
  return useEnhancedMutation({
    mutationFn: (request: SessionCreateRequest) => apiClient.createSession(request),
    operationType: 'api',
    showProgress: true,
    operationMessage: '正在创建会话...',
    successMessage: '会话创建成功',
    errorMessage: '会话创建失败',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

export function useEnhancedDeleteSession() {
  const queryClient = useQueryClient();
  
  return useEnhancedMutation({
    mutationFn: (sessionId: string) => apiClient.deleteSession(sessionId),
    operationType: 'api',
    showProgress: true,
    operationMessage: '正在终止会话...',
    successMessage: '会话已终止',
    errorMessage: '会话终止失败',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

// 审计日志相关的增强Hook
export function useEnhancedAuditLogs(filters: AuditFilters = {}) {
  return useEnhancedQuery({
    queryKey: ['audit', filters],
    queryFn: () => apiClient.getAuditLogs(filters),
    errorMessage: '获取审计日志失败',
  });
}

// 令牌管理相关的增强Hook
export function useEnhancedEnrollmentTokens(params: {
  limit?: number;
  offset?: number;
  status?: 'active' | 'expired' | 'used' | 'all';
  search?: string;
} = {}) {
  return useEnhancedQuery({
    queryKey: ['enrollmentTokens', params],
    queryFn: () => apiClient.getEnrollmentTokens(params),
    errorMessage: '获取注册令牌失败',
  });
}

export function useEnhancedGenerateToken() {
  const queryClient = useQueryClient();
  
  return useEnhancedMutation({
    mutationFn: (request: EnrollmentTokenRequest) => 
      apiClient.generateEnrollmentToken(request),
    operationType: 'api',
    showProgress: true,
    operationMessage: '正在生成令牌...',
    successMessage: '令牌生成成功',
    errorMessage: '令牌生成失败',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrollmentTokens'] });
    },
  });
}