import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PageLoader } from './components/ui';
import { RequireAuth } from './lib/auth';
import { PublicSurveyPage, SurveyCompletePage, SurveyResumePage } from './pages/public/PublicSurveyPage';

// admin is code-split so respondents only download the survey renderer
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const LoginPage = lazy(() => import('./pages/admin/LoginPage'));
const DashboardPage = lazy(() => import('./pages/admin/DashboardPage'));
const SurveysPage = lazy(() => import('./pages/admin/SurveysPage'));
const SurveyLayout = lazy(() => import('./pages/admin/survey/SurveyLayout'));
const DefaultSurveyTab = lazy(() => import('./pages/admin/survey/SurveyLayout').then((m) => ({ default: m.DefaultSurveyTab })));
const BuilderPage = lazy(() => import('./pages/admin/survey/BuilderPage'));
const PreviewPage = lazy(() => import('./pages/admin/survey/PreviewPage'));
const DistributionPage = lazy(() => import('./pages/admin/survey/DistributionPage'));
const ResponsesPage = lazy(() => import('./pages/admin/survey/ResponsesPage'));
const AnalyticsPage = lazy(() => import('./pages/admin/survey/AnalyticsPage'));
const SurveySettingsPage = lazy(() => import('./pages/admin/survey/SettingsPage'));
const TemplatesPage = lazy(() => import('./pages/admin/TemplatesPage'));
const UsersPage = lazy(() => import('./pages/admin/UsersPage'));
const ProjectsPage = lazy(() => import('./pages/admin/ProjectsPage'));
const AuditPage = lazy(() => import('./pages/admin/AuditPage'));
const HomePage = lazy(() => import('./pages/HomePage'));

export function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/s/:slug" element={<PublicSurveyPage />} />
        <Route path="/s/:slug/complete" element={<SurveyCompletePage />} />
        <Route path="/s/:slug/resume" element={<SurveyResumePage />} />

        <Route path="/admin/login" element={<LoginPage />} />
        <Route path="/admin" element={<RequireAuth><AdminLayout /></RequireAuth>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="surveys" element={<SurveysPage />} />
          <Route path="surveys/:id" element={<SurveyLayout />}>
            <Route index element={<DefaultSurveyTab />} />
            <Route path="builder" element={<BuilderPage />} />
            <Route path="preview" element={<PreviewPage />} />
            <Route path="distribution" element={<DistributionPage />} />
            <Route path="responses" element={<ResponsesPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="settings" element={<SurveySettingsPage />} />
          </Route>
          <Route path="templates" element={<TemplatesPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="audit" element={<AuditPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
