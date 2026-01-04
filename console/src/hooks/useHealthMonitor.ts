import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../lib/api-client';
import { HealthData, SystemMetrics } from '../types/api';

interface HealthMonitorConfig {
  refreshInterval?: number; // milliseconds, default 30000 (30 seconds)
  autoRefresh?: boolean; // default true
  retryOnError?: boolean; // default true
  maxRetries?: number; // default 3
  retryDelay?: number; // milliseconds, default 5000 (5 seconds)
}

interface HealthMonitorState {
  health: HealthData | null;
  readiness: { status: string; timestamp: number } | null;
  liveness: { status: string; timestamp: number } | null;
  metrics: (SystemMetrics & { prometheus?: any }) | null;
  loading: boolean;
  error: string | null;
  lastUpdate: number | null;
  isConnected: boolean;
  retryCount: number;
}

interface HealthMonitorActions {
  refresh: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
  reset: () => void;
  toggleAutoRefresh: () => void;
}

export function useHealthMonitor(config: HealthMonitorConfig = {}): HealthMonitorState & HealthMonitorActions {
  const {
    refreshInterval = 30000,
    autoRefresh = true,
    retryOnError = true,
    maxRetries = 3,
    retryDelay = 5000
  } = config;

  const [state, setState] = useState<HealthMonitorState>({
    health: null,
    readiness: null,
    liveness: null,
    metrics: null,
    loading: false,
    error: null,
    lastUpdate: null,
    isConnected: false,
    retryCount: 0
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);
  const configRef = useRef(config);

  // Update config ref when config changes
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    isPollingRef.current = false;
  }, []);

  // Fetch health data with comprehensive error handling
  const fetchHealthData = useCallback(async (): Promise<void> => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      // Use the enhanced health check method that handles errors gracefully
      const healthDetails = await apiClient.getHealthWithDetails();
      
      setState(prev => ({
        ...prev,
        health: healthDetails.health,
        readiness: healthDetails.readiness,
        liveness: healthDetails.liveness,
        metrics: healthDetails.metrics,
        loading: false,
        error: healthDetails.errors.length > 0 
          ? `Partial failure: ${healthDetails.errors.map(e => e.endpoint).join(', ')}` 
          : null,
        lastUpdate: Date.now(),
        isConnected: true,
        retryCount: 0
      }));

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage,
        isConnected: false,
        retryCount: prev.retryCount + 1
      }));

      // Implement retry logic
      if (retryOnError && state.retryCount < maxRetries) {
        retryTimeoutRef.current = setTimeout(() => {
          fetchHealthData();
        }, retryDelay);
      }
    }
  }, [retryOnError, maxRetries, retryDelay, state.retryCount]);

  // Manual refresh function
  const refresh = useCallback(async (): Promise<void> => {
    // Reset retry count on manual refresh
    setState(prev => ({ ...prev, retryCount: 0 }));
    await fetchHealthData();
  }, [fetchHealthData]);

  // Start polling
  const startPolling = useCallback(() => {
    if (isPollingRef.current) return;
    
    isPollingRef.current = true;
    
    // Initial fetch
    fetchHealthData();
    
    // Set up interval
    intervalRef.current = setInterval(() => {
      if (isPollingRef.current) {
        fetchHealthData();
      }
    }, refreshInterval);
  }, [fetchHealthData, refreshInterval]);

  // Stop polling
  const stopPolling = useCallback(() => {
    cleanup();
  }, [cleanup]);

  // Reset state
  const reset = useCallback(() => {
    cleanup();
    setState({
      health: null,
      readiness: null,
      liveness: null,
      metrics: null,
      loading: false,
      error: null,
      lastUpdate: null,
      isConnected: false,
      retryCount: 0
    });
  }, [cleanup]);

  // Toggle auto refresh
  const toggleAutoRefresh = useCallback(() => {
    if (isPollingRef.current) {
      stopPolling();
    } else {
      startPolling();
    }
  }, [startPolling, stopPolling]);

  // Auto-start polling if enabled
  useEffect(() => {
    if (autoRefresh) {
      startPolling();
    }

    // Cleanup on unmount
    return cleanup;
  }, [autoRefresh, startPolling, cleanup]);

  // Handle visibility change to pause/resume polling
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Page is hidden, stop polling to save resources
        if (isPollingRef.current) {
          stopPolling();
        }
      } else {
        // Page is visible, resume polling if auto-refresh is enabled
        if (autoRefresh && !isPollingRef.current) {
          startPolling();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [autoRefresh, startPolling, stopPolling]);

  // Handle online/offline events
  useEffect(() => {
    const handleOnline = () => {
      if (autoRefresh && !isPollingRef.current) {
        startPolling();
      }
    };

    const handleOffline = () => {
      stopPolling();
      setState(prev => ({
        ...prev,
        isConnected: false,
        error: 'Network connection lost'
      }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [autoRefresh, startPolling, stopPolling]);

  return {
    ...state,
    refresh,
    startPolling,
    stopPolling,
    reset,
    toggleAutoRefresh
  };
}

export default useHealthMonitor;