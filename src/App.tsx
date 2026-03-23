import { BrowserRouter, Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { LanguageProvider } from './context/LanguageContext';
import { ProtectedRoute } from './components/routing/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AdminRoute } from './components/routing/AdminRoute';
import { SocketProvider } from './context/SocketContext';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AdminPanel from './pages/AdminPanel';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import Dashboard from './components/views/Dashboard';
import Cases from './components/views/Cases';
import CaseDetails from './components/views/CaseDetails';
import Acquisition from './components/views/Acquisition';
import RecoveryEngine from './components/views/RecoveryEngine';
import ArtifactAnalysis from './components/views/ArtifactAnalysis';
import Timeline from './components/views/Timeline';
import Visualization from './components/views/Visualization';
import Reports from './components/views/Reports';
import Settings, { GeneralSettings, SecuritySettings, StorageSettings, DisplaySettings, AlertsSettings, AuthSettings } from './components/views/Settings';
import FileExplorer from './components/views/FileExplorer';
import HexViewer from './components/views/HexViewer';
import AuditLog from './components/views/AuditLog';
import Workspace from './components/views/Workspace';

export type ViewId = string;

/**
 * Authenticated app shell.
 * Uses URL path to determine current view and pass it to layout.
 * Navigation is completely handled by React Router (Outlet).
 */
function AppShell() {
  const location = useLocation();
  const pathParts = location.pathname.split('/').filter(Boolean);
  const currentView = pathParts[0] || 'dashboard';

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar activeView={currentView} />
        <main
          className="flex-1 overflow-auto animate-fade-in"
          style={{ background: 'var(--bg-primary)' }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/**
 * Admin shell — same layout as AppShell but renders AdminPanel inside an Outlet or directly.
 */
function AdminShell() {
  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar activeView={'dashboard'} />
        <main
          className="flex-1 overflow-auto animate-fade-in"
          style={{ background: 'var(--bg-primary)' }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Toaster position="bottom-right" reverseOrder={false} />
      <BrowserRouter>
        <AuthProvider>
          <ThemeProvider>
            <LanguageProvider>
              <SocketProvider>
                <Routes>
                  {/* Public */}
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/register" element={<RegisterPage />} />

                  {/* Protected — all authenticated users */}
                  <Route element={<ProtectedRoute />}>
                    <Route element={<AppShell />}>
                      <Route path="/dashboard" element={<Dashboard />} />
                      <Route path="/cases" element={<Cases />} />
                      <Route path="/cases/:caseId" element={<CaseDetails />} />
                      {/* Case-scoped routes (accessed from CaseDetails actions) */}
                      <Route path="/cases/:caseId/recovery" element={<RecoveryEngine />} />
                      <Route path="/cases/:caseId/artifacts" element={<ArtifactAnalysis />} />
                      <Route path="/cases/:caseId/filesystem" element={<FileExplorer />} />
                      <Route path="/cases/:caseId/hex" element={<HexViewer />} />
                      <Route path="/cases/:caseId/timeline" element={<Timeline />} />
                      <Route path="/cases/:caseId/visualization" element={<Visualization />} />
                      <Route path="/cases/:caseId/reports" element={<Reports />} />
                      <Route path="/cases/:caseId/audit" element={<AuditLog />} />
                      {/* Standalone routes (work without a selected case) */}
                      <Route path="/recovery" element={<RecoveryEngine />} />
                      <Route path="/artifacts" element={<ArtifactAnalysis />} />
                      <Route path="/timeline" element={<Timeline />} />
                      <Route path="/visualization" element={<Visualization />} />
                      <Route path="/reports" element={<Reports />} />
                      <Route path="/acquisition" element={<Acquisition />} />
                      <Route path="/workspace" element={<Workspace />} />
                      <Route path="/settings" element={<Settings />}>
                        <Route index element={<Navigate to="general" replace />} />
                        <Route path="general" element={<GeneralSettings />} />
                        <Route path="security" element={<SecuritySettings />} />
                        <Route path="storage" element={<StorageSettings />} />
                        <Route path="display" element={<DisplaySettings />} />
                        <Route path="alerts" element={<AlertsSettings />} />
                        <Route path="auth" element={<AuthSettings />} />
                      </Route>
                    </Route>
                  </Route>

                  {/* Admin only */}
                  <Route element={<AdminRoute />}>
                    <Route element={<AdminShell />}>
                      <Route path="/admin" element={<AdminPanel />} />
                    </Route>
                  </Route>

                  {/* Fallback */}
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </SocketProvider>
            </LanguageProvider>
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
