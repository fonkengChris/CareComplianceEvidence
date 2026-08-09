import type { HealthStatus } from '@care/shared';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { apiFetch } from '../lib/api';
import StaffDashboardPage from './StaffDashboardPage';

/**
 * Landing page. STAFF get their recording dashboard (assigned service users + week plans);
 * managers/auditors see the greeting + API/DB health (Phase 2 stand-in) for now.
 */
export default function DashboardPage() {
  const { user } = useAuth();
  const isStaff = user?.role === 'STAFF';
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isStaff) return;
    apiFetch('/api/health')
      .then((res) => res.json())
      .then((data: HealthStatus) => setHealth(data))
      .catch(() => setError('Could not reach the API'));
  }, [isStaff]);

  if (isStaff) return <StaffDashboardPage />;

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Welcome, {user?.name}</h1>
      {error && <p className="text-red-600">{error}</p>}
      {health && (
        <p role="status" className="text-green-700">
          API status: {health.status} · DB: {health.db}
        </p>
      )}
    </section>
  );
}
