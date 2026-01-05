import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { ErrorBoundary, RouteErrorBoundary } from './components/ErrorBoundary';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider } from './contexts/AuthContext';
import { DashboardPage } from './pages/DashboardPage';
import { DevicesPage } from './pages/DevicesPage';
import { FileManagerPage } from './pages/FileManagerPage';
import { SessionsPage } from './pages/SessionsPage';
import { AuditPage } from './pages/AuditPage';
import { StatusPage } from './pages/StatusPage';
import { TokensPage } from './pages/TokensPage';
import { TerminalTestPage } from './pages/TerminalTestPage';
import { LoginPage } from './pages/LoginPage';
import { UIProvider } from './contexts/UIContext';
import { GlobalLoadingOverlay, OperationProgress } from './components/LoadingIndicator';
import { NotificationSystem } from './components/NotificationSystem';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <UIProvider>
            <Router>
              <Routes>
                {/* 公开路由 - 登录页 */}
                <Route path="/login" element={<LoginPage />} />
                
                {/* 受保护的路由 */}
                <Route path="/*" element={
                  <ProtectedRoute>
                    <Layout>
                      <Routes>
                        <Route path="/" element={<Navigate to="/dashboard" replace />} />
                        <Route path="/dashboard" element={
                          <RouteErrorBoundary routeName="仪表盘">
                            <DashboardPage />
                          </RouteErrorBoundary>
                        } />
                        <Route path="/devices" element={
                          <RouteErrorBoundary routeName="设备管理">
                            <DevicesPage />
                          </RouteErrorBoundary>
                        } />
                        <Route path="/files" element={
                          <RouteErrorBoundary routeName="文件管理">
                            <FileManagerPage />
                          </RouteErrorBoundary>
                        } />
                        <Route path="/sessions" element={
                          <RouteErrorBoundary routeName="会话管理">
                            <SessionsPage />
                          </RouteErrorBoundary>
                        } />
                        <Route path="/tokens" element={
                          <RouteErrorBoundary routeName="令牌管理">
                            <TokensPage />
                          </RouteErrorBoundary>
                        } />
                        <Route path="/audit" element={
                          <RouteErrorBoundary routeName="审计日志">
                            <AuditPage />
                          </RouteErrorBoundary>
                        } />
                        <Route path="/status" element={
                          <RouteErrorBoundary routeName="系统状态">
                            <StatusPage />
                          </RouteErrorBoundary>
                        } />
                        <Route path="/terminal-test" element={
                          <RouteErrorBoundary routeName="终端测试">
                            <TerminalTestPage />
                          </RouteErrorBoundary>
                        } />
                      </Routes>
                    </Layout>
                    
                    {/* 全局UI组件 */}
                    <GlobalLoadingOverlay />
                    <OperationProgress />
                    <NotificationSystem />
                  </ProtectedRoute>
                } />
              </Routes>
            </Router>
          </UIProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;