import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMe } from './api/hooks';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import ProjectsPage from './pages/ProjectsPage';

// Heavy screens (That Open, Three.js, MapLibre) are code-split.
const NewProjectPage = lazy(() => import('./pages/NewProjectPage'));
const WorkspacePage = lazy(() => import('./pages/WorkspacePage'));
const ComparePage = lazy(() => import('./pages/ComparePage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

function Loading() {
  const { t } = useTranslation();
  return <div className="p-8 text-muted">{t('app.loading')}</div>;
}

function Private({ children }: { children: ReactNode }) {
  const me = useMe();
  if (me.isLoading) return <Loading />;
  if (me.isError) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/" element={<Private><ProjectsPage /></Private>} />
          <Route path="/projects/new" element={<Private><NewProjectPage /></Private>} />
          <Route path="/projects/:id" element={<Private><WorkspacePage /></Private>} />
          <Route path="/projects/:id/compare" element={<Private><ComparePage /></Private>} />
          <Route path="/projects/:id/settings" element={<Private><SettingsPage /></Private>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
