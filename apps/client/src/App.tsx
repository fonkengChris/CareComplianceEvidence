import { Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute';
import NavShell from './components/NavShell';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import ServiceUserDetailPage from './pages/ServiceUserDetailPage';
import ServiceUserFormPage from './pages/ServiceUserFormPage';
import ServiceUsersPage from './pages/ServiceUsersPage';

/**
 * Route map. `/login` is public; everything else sits behind ProtectedRoute (auth)
 * and the NavShell frame. Role-scoped sections pass `roles` to a nested guard.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<NavShell />}>
          <Route path="/" element={<DashboardPage />} />
          {/* Service user management is MANAGER-only (server-enforced too). */}
          <Route element={<ProtectedRoute roles={['MANAGER']} />}>
            <Route path="/service-users" element={<ServiceUsersPage />} />
            <Route path="/service-users/new" element={<ServiceUserFormPage />} />
            <Route path="/service-users/:id" element={<ServiceUserDetailPage />} />
            <Route path="/service-users/:id/edit" element={<ServiceUserFormPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
