import React, { createContext, useContext, useReducer, ReactNode } from 'react';

// UI状态类型定义
interface UIState {
  // 全局加载状态
  globalLoading: boolean;
  loadingMessage?: string;
  
  // 操作进度
  operations: Record<string, OperationProgress>;
  
  // 通知系统
  notifications: Notification[];
  
  // 模态框状态
  modals: {
    deviceDetails: boolean;
    fileUpload: boolean;
    sessionCreate: boolean;
    confirmDialog: boolean;
  };
  
  // 主题和布局
  theme: 'light' | 'dark';
  sidebarCollapsed: boolean;
}

interface OperationProgress {
  id: string;
  type: 'upload' | 'download' | 'api' | 'websocket';
  status: 'pending' | 'progress' | 'success' | 'error';
  progress: number; // 0-100
  message?: string;
  error?: string;
  startTime: number;
  endTime?: number;
}

interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number; // 自动消失时间，毫秒
  persistent?: boolean; // 是否持久显示
  timestamp: number;
}

// Action类型定义
type UIAction =
  | { type: 'SET_GLOBAL_LOADING'; payload: { loading: boolean; message?: string } }
  | { type: 'START_OPERATION'; payload: OperationProgress }
  | { type: 'UPDATE_OPERATION'; payload: { id: string; updates: Partial<OperationProgress> } }
  | { type: 'COMPLETE_OPERATION'; payload: { id: string; success: boolean; message?: string } }
  | { type: 'REMOVE_OPERATION'; payload: string }
  | { type: 'ADD_NOTIFICATION'; payload: Omit<Notification, 'id' | 'timestamp'> }
  | { type: 'REMOVE_NOTIFICATION'; payload: string }
  | { type: 'CLEAR_NOTIFICATIONS' }
  | { type: 'TOGGLE_MODAL'; payload: { modal: keyof UIState['modals']; open?: boolean } }
  | { type: 'SET_THEME'; payload: 'light' | 'dark' }
  | { type: 'TOGGLE_SIDEBAR' };

// 初始状态
const initialState: UIState = {
  globalLoading: false,
  operations: {},
  notifications: [],
  modals: {
    deviceDetails: false,
    fileUpload: false,
    sessionCreate: false,
    confirmDialog: false,
  },
  theme: 'light',
  sidebarCollapsed: false,
};

// Reducer函数
function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case 'SET_GLOBAL_LOADING':
      return {
        ...state,
        globalLoading: action.payload.loading,
        loadingMessage: action.payload.message,
      };

    case 'START_OPERATION':
      return {
        ...state,
        operations: {
          ...state.operations,
          [action.payload.id]: action.payload,
        },
      };

    case 'UPDATE_OPERATION':
      const existingOperation = state.operations[action.payload.id];
      if (!existingOperation) return state;
      
      return {
        ...state,
        operations: {
          ...state.operations,
          [action.payload.id]: {
            ...existingOperation,
            ...action.payload.updates,
          },
        },
      };

    case 'COMPLETE_OPERATION':
      const operation = state.operations[action.payload.id];
      if (!operation) return state;
      
      return {
        ...state,
        operations: {
          ...state.operations,
          [action.payload.id]: {
            ...operation,
            status: action.payload.success ? 'success' : 'error',
            progress: 100,
            message: action.payload.message,
            endTime: Date.now(),
          },
        },
      };

    case 'REMOVE_OPERATION':
      const { [action.payload]: removed, ...remainingOperations } = state.operations;
      return {
        ...state,
        operations: remainingOperations,
      };

    case 'ADD_NOTIFICATION':
      const notification: Notification = {
        ...action.payload,
        id: `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
      };
      
      return {
        ...state,
        notifications: [...state.notifications, notification],
      };

    case 'REMOVE_NOTIFICATION':
      return {
        ...state,
        notifications: state.notifications.filter(n => n.id !== action.payload),
      };

    case 'CLEAR_NOTIFICATIONS':
      return {
        ...state,
        notifications: [],
      };

    case 'TOGGLE_MODAL':
      return {
        ...state,
        modals: {
          ...state.modals,
          [action.payload.modal]: action.payload.open ?? !state.modals[action.payload.modal],
        },
      };

    case 'SET_THEME':
      return {
        ...state,
        theme: action.payload,
      };

    case 'TOGGLE_SIDEBAR':
      return {
        ...state,
        sidebarCollapsed: !state.sidebarCollapsed,
      };

    default:
      return state;
  }
}

// Context创建
const UIContext = createContext<{
  state: UIState;
  dispatch: React.Dispatch<UIAction>;
} | null>(null);

// Provider组件
interface UIProviderProps {
  children: ReactNode;
}

export function UIProvider({ children }: UIProviderProps) {
  const [state, dispatch] = useReducer(uiReducer, initialState);

  return (
    <UIContext.Provider value={{ state, dispatch }}>
      {children}
    </UIContext.Provider>
  );
}

// Hook for using UI context
export function useUI() {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
}

// 便捷的Hook函数
export function useGlobalLoading() {
  const { state, dispatch } = useUI();
  
  const setGlobalLoading = (loading: boolean, message?: string) => {
    dispatch({ type: 'SET_GLOBAL_LOADING', payload: { loading, message } });
  };
  
  return {
    isLoading: state.globalLoading,
    message: state.loadingMessage,
    setGlobalLoading,
  };
}

export function useOperations() {
  const { state, dispatch } = useUI();
  
  const startOperation = (operation: Omit<OperationProgress, 'startTime'>) => {
    dispatch({
      type: 'START_OPERATION',
      payload: {
        ...operation,
        startTime: Date.now(),
      },
    });
  };
  
  const updateOperation = (id: string, updates: Partial<OperationProgress>) => {
    dispatch({ type: 'UPDATE_OPERATION', payload: { id, updates } });
  };
  
  const completeOperation = (id: string, success: boolean, message?: string) => {
    dispatch({ type: 'COMPLETE_OPERATION', payload: { id, success, message } });
  };
  
  const removeOperation = (id: string) => {
    dispatch({ type: 'REMOVE_OPERATION', payload: id });
  };
  
  return {
    operations: Object.values(state.operations),
    startOperation,
    updateOperation,
    completeOperation,
    removeOperation,
  };
}

export function useNotifications() {
  const { state, dispatch } = useUI();
  
  const addNotification = (notification: Omit<Notification, 'id' | 'timestamp'>) => {
    const id = Date.now().toString();
    dispatch({ type: 'ADD_NOTIFICATION', payload: notification });
    
    // 自动移除通知（如果设置了duration）
    if (notification.duration && !notification.persistent) {
      setTimeout(() => {
        dispatch({ type: 'REMOVE_NOTIFICATION', payload: id });
      }, notification.duration);
    }
  };
  
  const removeNotification = (id: string) => {
    dispatch({ type: 'REMOVE_NOTIFICATION', payload: id });
  };
  
  const clearNotifications = () => {
    dispatch({ type: 'CLEAR_NOTIFICATIONS' });
  };
  
  return {
    notifications: state.notifications,
    addNotification,
    removeNotification,
    clearNotifications,
  };
}

export function useModals() {
  const { state, dispatch } = useUI();
  
  const toggleModal = (modal: keyof UIState['modals'], open?: boolean) => {
    dispatch({ type: 'TOGGLE_MODAL', payload: { modal, open } });
  };
  
  return {
    modals: state.modals,
    toggleModal,
  };
}

export { UIContext };
export type { UIState, OperationProgress, Notification };