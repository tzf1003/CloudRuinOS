import { useEffect, useCallback, useRef } from 'react';
import { Session } from '../types/api';
import { useDeleteSession } from './useApi';

interface SessionCleanupOptions {
  sessions: Session[];
  autoCleanup?: boolean;
  cleanupInterval?: number; // 毫秒
  warningThreshold?: number; // 毫秒，过期前多久开始警告
  onSessionExpiring?: (session: Session, timeRemaining: number) => void;
  onSessionExpired?: (session: Session) => void;
  onSessionCleaned?: (sessionId: string) => void;
}

interface SessionCleanupResult {
  expiringSessions: Session[];
  expiredSessions: Session[];
  cleanupExpiredSessions: () => void;
  getTimeRemaining: (session: Session) => number;
  isSessionExpiring: (session: Session) => boolean;
  isSessionExpired: (session: Session) => boolean;
}

export function useSessionCleanup({
  sessions,
  autoCleanup = true,
  cleanupInterval = 30000, // 30秒检查一次
  warningThreshold = 300000, // 5分钟警告
  onSessionExpiring,
  onSessionExpired,
  onSessionCleaned,
}: SessionCleanupOptions): SessionCleanupResult {
  const deleteSession = useDeleteSession();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const notifiedExpiring = useRef<Set<string>>(new Set());
  const notifiedExpired = useRef<Set<string>>(new Set());

  // 获取会话剩余时间
  const getTimeRemaining = useCallback((session: Session): number => {
    const now = Date.now();
    const expiresAt = (session.expiresAt || 0) * 1000;
    return expiresAt - now;
  }, []);

  // 检查会话是否即将过期
  const isSessionExpiring = useCallback((session: Session): boolean => {
    const timeRemaining = getTimeRemaining(session);
    return timeRemaining > 0 && timeRemaining <= warningThreshold;
  }, [getTimeRemaining, warningThreshold]);

  // 检查会话是否已过期
  const isSessionExpired = useCallback((session: Session): boolean => {
    return getTimeRemaining(session) <= 0;
  }, [getTimeRemaining]);

  // 获取即将过期的会话
  const expiringSessions = sessions.filter(session => 
    isSessionExpiring(session) && !isSessionExpired(session)
  );

  // 获取已过期的会话
  const expiredSessions = sessions.filter(isSessionExpired);

  // 清理过期会话
  const cleanupExpiredSessions = useCallback(() => {
    expiredSessions.forEach(session => {
      if (session.status !== 'expired') {
        deleteSession.mutate(session.id, {
          onSuccess: () => {
            onSessionCleaned?.(session.id);
          },
          onError: (error) => {
            console.error(`Failed to cleanup expired session ${session.id}:`, error);
          }
        });
      }
    });
  }, [expiredSessions, deleteSession, onSessionCleaned]);

  // 检查和通知会话状态
  const checkSessionStatus = useCallback(() => {
    const now = Date.now();

    sessions.forEach(session => {
      const timeRemaining = getTimeRemaining(session);
      const sessionId = session.id;

      // 检查即将过期的会话
      if (isSessionExpiring(session) && !notifiedExpiring.current.has(sessionId)) {
        notifiedExpiring.current.add(sessionId);
        onSessionExpiring?.(session, timeRemaining);
      }

      // 检查已过期的会话
      if (isSessionExpired(session) && !notifiedExpired.current.has(sessionId)) {
        notifiedExpired.current.add(sessionId);
        onSessionExpired?.(session);
        
        // 自动清理过期会话
        if (autoCleanup && session.status !== 'expired') {
          deleteSession.mutate(sessionId, {
            onSuccess: () => {
              onSessionCleaned?.(sessionId);
            },
            onError: (error) => {
              console.error(`Failed to auto-cleanup expired session ${sessionId}:`, error);
            }
          });
        }
      }

      // 清理已恢复的会话通知状态
      if (timeRemaining > warningThreshold) {
        notifiedExpiring.current.delete(sessionId);
      }
      if (timeRemaining > 0) {
        notifiedExpired.current.delete(sessionId);
      }
    });

    // 清理不存在会话的通知状态
    const currentSessionIds = new Set(sessions.map(s => s.id));
    notifiedExpiring.current.forEach(sessionId => {
      if (!currentSessionIds.has(sessionId)) {
        notifiedExpiring.current.delete(sessionId);
      }
    });
    notifiedExpired.current.forEach(sessionId => {
      if (!currentSessionIds.has(sessionId)) {
        notifiedExpired.current.delete(sessionId);
      }
    });
  }, [
    sessions,
    getTimeRemaining,
    isSessionExpiring,
    isSessionExpired,
    autoCleanup,
    warningThreshold,
    onSessionExpiring,
    onSessionExpired,
    onSessionCleaned,
    deleteSession
  ]);

  // 设置定时检查
  useEffect(() => {
    if (autoCleanup && sessions.length > 0) {
      // 立即检查一次
      checkSessionStatus();

      // 设置定时检查
      intervalRef.current = setInterval(checkSessionStatus, cleanupInterval);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }
  }, [autoCleanup, sessions.length, checkSessionStatus, cleanupInterval]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    expiringSessions,
    expiredSessions,
    cleanupExpiredSessions,
    getTimeRemaining,
    isSessionExpiring,
    isSessionExpired,
  };
}