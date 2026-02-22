import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { LanguageProvider } from './context/LanguageContext';
import { ProtectedRoute } from './components/routing/ProtectedRoute';
import { AdminRoute } from './components/routing/AdminRoute';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AdminPanel from './pages/AdminPanel';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import Dashboard from './components/views/Dashboard';
import Cases from './components/views/Cases';
import Acquisition from './components/views/Acquisition';
import RecoveryEngine from './components/views/RecoveryEngine';
import ArtifactAnalysis from './components/views/ArtifactAnalysis';
import Timeline from './components/views/Timeline';
import Visualization from './components/views/Visualization';
import Reports from './components/views/Reports';
import Settings from './components/views/Settings';

export type ViewId =
  | 'dashboard'
  | 'cases'
  | 'acquisition'
  | 'recovery'
  | 'artifacts'
  | 'timeline'
  | 'visualization'
  | 'reports'
  | 'settings';

const viewComponents: Record<ViewId, React.FC> = {
  dashboard: Dashboard,
  cases: Cases,
  acquisition: Acquisition,
  recovery: RecoveryEngine,
  artifacts: ArtifactAnalysis,
  timeline: Timeline,
  visualization: Visualization,
  reports: Reports,
  settings: Settings,
};

/**
 * Authenticated app shell.
 * Uses local view state for the internal SPA navigation (no URL changes per-view).
 * The sidebar's onNavigate drives which view component renders.
 */
function AppShell() {
  const [activeView, setActiveView] = useState<ViewId>('dashboard');
  const navigate = useNavigate();
  const ActiveView = viewComponents[activeView];

  // Allow sidebar to navigate to /admin as well as to internal views
  function handleNavigate(view: ViewId | 'admin') {
    if (view === 'admin') {
      navigate('/admin');
    } else {
      setActiveView(view as ViewId);
    }
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      <Sidebar activeView={activeView} onNavigate={handleNavigate} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar activeView={activeView} />
        <main
          className="flex-1 overflow-auto animate-fade-in"
          style={{ background: 'var(--bg-primary)' }}
        >
          <ActiveView />
        </main>
      </div>
    </div>
  );
}

/**
 * Admin shell — same layout as AppShell but renders AdminPanel.
 * Back-navigation to /dashboard works via sidebar "← Dashboard" or browser back.
 */
function AdminShell() {
  const navigate = useNavigate();

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      <Sidebar activeView={'dashboard'} onNavigate={(view) => {
        if (view === 'admin') return; // already here
        navigate('/dashboard');       // any sidebar click → back to dashboard
      }} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar activeView={'dashboard'} />
        <main
          className="flex-1 overflow-auto animate-fade-in"
          style={{ background: 'var(--bg-primary)' }}
        >
          <AdminPanel />
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <LanguageProvider>
            <Routes>
              {/* Public */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />

              {/* Protected — all authenticated users */}
              <Route element={<ProtectedRoute />}>
                <Route path="/dashboard" element={<AppShell />} />
                <Route path="/dashboard/*" element={<AppShell />} />
              </Route>

              {/* Admin only */}
              <Route element={<AdminRoute />}>
                <Route path="/admin" element={<AdminShell />} />
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </LanguageProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
