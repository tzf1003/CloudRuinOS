import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { DevicesPage } from './pages/DevicesPage';
import { FileManagerPage } from './pages/FileManagerPage';
import { SessionsPage } from './pages/SessionsPage';
import { AuditPage } from './pages/AuditPage';
import { StatusPage } from './pages/StatusPage';
import { TokensPage } from './pages/TokensPage';
import { TerminalTestPage } from './pages/TerminalTestPage';
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
    <QueryClientProvider client={queryClient}>
      <UIProvider>
        <Router>
          <Layout>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/devices" element={<DevicesPage />} />
              <Route path="/files" element={<FileManagerPage />} />
              <Route path="/sessions" element={<SessionsPage />} />
              <Route path="/tokens" element={<TokensPage />} />
              <Route path="/audit" element={<AuditPage />} />
              <Route path="/status" element={<StatusPage />} />
              <Route path="/terminal-test" element={<TerminalTestPage />} />
            </Routes>
          </Layout>
          
          {/* 全局UI组件 */}
          <GlobalLoadingOverlay />
          <OperationProgress />
          <NotificationSystem />
        </Router>
      </UIProvider>
    </QueryClientProvider>
  );
}

export default App;