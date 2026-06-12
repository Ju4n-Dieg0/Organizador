import { Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ClientsPage } from './pages/ClientsPage';
import { ClientDetailPage } from './pages/ClientDetailPage';
import { PlansPage } from './pages/PlansPage';
import { TeamPage } from './pages/TeamPage';
import { TasksPage } from './pages/TasksPage';
import { RequestsPage } from './pages/RequestsPage';
import { ROUTES } from './constants/routes';

export function App() {
  return (
    <Routes>
      <Route path={ROUTES.login} element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path={ROUTES.dashboard} element={<DashboardPage />} />
        <Route path={ROUTES.clients} element={<ClientsPage />} />
        <Route path={ROUTES.clientDetail} element={<ClientDetailPage />} />
        <Route path={ROUTES.plans} element={<PlansPage />} />
        <Route path={ROUTES.team} element={<TeamPage />} />
        <Route path={ROUTES.tasks} element={<TasksPage />} />
        <Route path={ROUTES.requests} element={<RequestsPage />} />
      </Route>
      <Route path="*" element={<LoginPage />} />
    </Routes>
  );
}
