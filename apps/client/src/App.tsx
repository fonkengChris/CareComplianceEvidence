import { Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute';
import NavShell from './components/NavShell';
import AuditHistoryPage from './pages/AuditHistoryPage';
import ComplianceSettingsPage from './pages/ComplianceSettingsPage';
import DashboardPage from './pages/DashboardPage';
import HomeDetailPage from './pages/HomeDetailPage';
import HomeFormPage from './pages/HomeFormPage';
import HomesPage from './pages/HomesPage';
import LoginPage from './pages/LoginPage';
import ManagerSummaryPage from './pages/ManagerSummaryPage';
import RecordWeekPage from './pages/RecordWeekPage';
import ServiceUserDetailPage from './pages/ServiceUserDetailPage';
import ServiceUserFormPage from './pages/ServiceUserFormPage';
import ServiceUsersPage from './pages/ServiceUsersPage';
import UserFormPage from './pages/UserFormPage';
import UsersPage from './pages/UsersPage';
import WeekPlanDetailPage from './pages/WeekPlanDetailPage';
import WeekPlanFormPage from './pages/WeekPlanFormPage';

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
          {/* Read-only views for auditors: summary (Phase 7), audit history (Phase 9),
              plus browsing service users and week plans (Phase 10). The pages render
              their write controls only for managers; the server enforces this too. */}
          <Route element={<ProtectedRoute roles={['MANAGER', 'AUDITOR']} />}>
            <Route path="/reports" element={<ManagerSummaryPage />} />
            <Route path="/audit" element={<AuditHistoryPage />} />
            <Route path="/service-users" element={<ServiceUsersPage />} />
            <Route path="/service-users/:id" element={<ServiceUserDetailPage />} />
            <Route path="/homes" element={<HomesPage />} />
            <Route path="/homes/:id" element={<HomeDetailPage />} />
            <Route path="/week-plans/:id" element={<WeekPlanDetailPage />} />
          </Route>
          {/* Staff recording (Phase 5): STAFF (scoped to their group) and managers. */}
          <Route element={<ProtectedRoute roles={['STAFF', 'MANAGER']} />}>
            <Route path="/week-plans/:id/record" element={<RecordWeekPage />} />
          </Route>
          {/* Service user / user management and planning writes are MANAGER-only
              (server-enforced too). */}
          <Route element={<ProtectedRoute roles={['MANAGER']} />}>
            <Route path="/users" element={<UsersPage />} />
            <Route path="/users/new" element={<UserFormPage />} />
            <Route path="/users/:id/edit" element={<UserFormPage />} />
            <Route path="/homes/new" element={<HomeFormPage />} />
            <Route path="/homes/:id/edit" element={<HomeFormPage />} />
            <Route path="/service-users/new" element={<ServiceUserFormPage />} />
            <Route path="/service-users/:id/edit" element={<ServiceUserFormPage />} />
            {/* Weekly planning is MANAGER-only (server-enforced too). */}
            <Route
              path="/service-users/:serviceUserId/week-plans/new"
              element={<WeekPlanFormPage />}
            />
            <Route path="/week-plans/:id/edit" element={<WeekPlanFormPage />} />
            {/* Compliance thresholds (Phase 6) — MANAGER-only (server-enforced too). */}
            <Route path="/compliance-settings" element={<ComplianceSettingsPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
