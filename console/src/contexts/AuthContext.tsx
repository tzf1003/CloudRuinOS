import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  expiresAt: number | null;
}

interface AuthContextType extends AuthState {
  login: (password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const AUTH_STORAGE_KEY = 'rmm_auth_token';
const AUTH_EXPIRES_KEY = 'rmm_auth_expires';

// 从环境变量或配置获取 API 基础 URL
const getApiBaseUrl = (): string => {
  // 优先使用环境变量
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  // 开发环境默认指向本地 Worker
  if (import.meta.env.DEV) {
    return 'http://127.0.0.1:8787';
  }
  // 生产环境使用相对路径或同源 API
  return '';
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>(() => {
    // 从 localStorage 恢复认证状态
    const savedToken = localStorage.getItem(AUTH_STORAGE_KEY);
    const savedExpires = localStorage.getItem(AUTH_EXPIRES_KEY);
    
    if (savedToken && savedExpires) {
      const expiresAt = parseInt(savedExpires, 10);
      // 检查 token 是否过期
      if (expiresAt > Date.now()) {
        return {
          isAuthenticated: true,
          token: savedToken,
          expiresAt,
        };
      }
      // Token 已过期，清理
      localStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.removeItem(AUTH_EXPIRES_KEY);
    }
    
    return {
      isAuthenticated: false,
      token: null,
      expiresAt: null,
    };
  });
  
  const [isLoading, setIsLoading] = useState(false);

  // 登录
  const login = useCallback(async (password: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      const apiUrl = getApiBaseUrl();
      const response = await fetch(`${apiUrl}/admin/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (response.ok && data.status === 'ok' && data.token) {
        const expiresAt = data.expires_at || (Date.now() + 24 * 60 * 60 * 1000);
        
        // 保存到 localStorage
        localStorage.setItem(AUTH_STORAGE_KEY, data.token);
        localStorage.setItem(AUTH_EXPIRES_KEY, expiresAt.toString());
        
        setAuthState({
          isAuthenticated: true,
          token: data.token,
          expiresAt,
        });
        
        return { success: true };
      }
      
      return { success: false, error: data.error || '登录失败' };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: '网络错误，请检查连接' };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 登出
  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(AUTH_EXPIRES_KEY);
    setAuthState({
      isAuthenticated: false,
      token: null,
      expiresAt: null,
    });
  }, []);

  // 定期检查 token 是否过期
  useEffect(() => {
    if (!authState.expiresAt) return;

    const checkExpiry = () => {
      if (authState.expiresAt && authState.expiresAt <= Date.now()) {
        logout();
      }
    };

    // 每分钟检查一次
    const interval = setInterval(checkExpiry, 60000);
    return () => clearInterval(interval);
  }, [authState.expiresAt, logout]);

  return (
    <AuthContext.Provider value={{
      ...authState,
      login,
      logout,
      isLoading,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// 获取当前存储的 token（供 API client 使用）
export function getStoredToken(): string | null {
  const token = localStorage.getItem(AUTH_STORAGE_KEY);
  const expiresStr = localStorage.getItem(AUTH_EXPIRES_KEY);
  
  if (!token || !expiresStr) return null;
  
  const expiresAt = parseInt(expiresStr, 10);
  if (expiresAt <= Date.now()) {
    // Token 已过期
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(AUTH_EXPIRES_KEY);
    return null;
  }
  
  return token;
}
