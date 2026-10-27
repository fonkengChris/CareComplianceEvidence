import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute';
import AppShell from './components/AppShell';
import AccountPage from './pages/AccountPage';
import AuditHistoryPage from './pages/AuditHistoryPage';
import DashboardPage from './pages/DashboardPage';
import HomeDetailPage from './pages/HomeDetailPage';
import HomeFormPage from './pages/HomeFormPage';
import HomesPage from './pages/HomesPage';
import LoginPage from './pages/LoginPage';
import RecordWeekPage from './pages/RecordWeekPage';
import ReportsPage from './pages/ReportsPage';
import ServiceUserDetailPage from './pages/ServiceUserDetailPage';
import ServiceUserFormPage from './pages/ServiceUserFormPage';
import ServiceUsersPage from './pages/ServiceUsersPage';
import ShiftsPage from './pages/ShiftsPage';
import UserFormPage from './pages/UserFormPage';
import UsersPage from './pages/UsersPage';
import WeekPlanDetailPage from './pages/WeekPlanDetailPage';
import WeekPlanFormPage from './pages/WeekPlanFormPage';
import WeekPlanTemplatePage from './pages/WeekPlanTemplatePage';

/**
 * Route map. `/login` is public; everything else sits behind ProtectedRoute (auth)
 * and the AppShell frame. Role-scoped sections pass `roles` to a nested guard.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          {/* Every role can edit their own name, email and password. */}
          <Route path="/account" element={<AccountPage />} />
          {/* Reports are the only page an auditor sees — scoped server-side to the service
              users a manager approved them to audit. Key workers see their own caseload. */}
          <Route element={<ProtectedRoute roles={['MANAGER', 'AUDITOR', 'KEY_WORKER']} />}>
            <Route path="/reports" element={<ReportsPage />} />
          </Route>
          {/* Read-only manager views: audit history (Phase 9), service users, homes and week
              plans. The server enforces the same roles. */}
          <Route element={<ProtectedRoute roles={['MANAGER']} />}>
            <Route path="/audit" element={<AuditHistoryPage />} />
            <Route path="/service-users" element={<ServiceUsersPage />} />
            <Route path="/service-users/:id" element={<ServiceUserDetailPage />} />
            <Route path="/homes" element={<HomesPage />} />
            <Route path="/homes/:id" element={<HomeDetailPage />} />
            <Route path="/shifts" element={<ShiftsPage />} />
            <Route path="/week-plans/:id" element={<WeekPlanDetailPage />} />
          </Route>
          {/* Staff recording (Phase 5): STAFF/KEY_WORKER (scoped to their group) and managers. */}
          <Route element={<ProtectedRoute roles={['STAFF', 'KEY_WORKER', 'MANAGER']} />}>
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
            {/* Reusable per-service-user template new weeks are generated from. */}
            <Route
              path="/service-users/:serviceUserId/template"
              element={<WeekPlanTemplatePage />}
            />
            <Route path="/week-plans/:id/edit" element={<WeekPlanFormPage />} />
          </Route>
          {/* Compliance thresholds (Phase 6) now live on the Reports page; keep the old
              path working as a redirect for bookmarks. */}
          <Route path="/compliance-settings" element={<Navigate to="/reports" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
