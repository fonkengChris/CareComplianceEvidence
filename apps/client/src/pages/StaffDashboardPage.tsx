import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { fetchMyAssignments } from '../lib/staff-assignments';
import { fetchWeekPlans } from '../lib/week-plans';

/**
 * Staff landing page (Phase 5): the service users the signed-in staff member supervises,
 * each with its week plans linking straight into the mobile recording screen. Both queries
 * are scoped to the caller's supervision group server-side, so nothing outside the group
 * is shown.
 */
export default function StaffDashboardPage() {
  const { user } = useAuth();
  const assignments = useQuery({ queryKey: ['assignments', 'me'], queryFn: fetchMyAssignments });
  const weekPlans = useQuery({ queryKey: ['week-plans'], queryFn: () => fetchWeekPlans() });

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Welcome, {user?.name}</h1>
      <h2 className="text-lg font-medium">Your service users</h2>

      {(assignments.isLoading || weekPlans.isLoading) && (
        <p role="status" className="text-gray-500">
          Loading…
        </p>
      )}
      {assignments.isError && (
        <p role="alert" className="text-red-600">
          Could not load your assignments.
        </p>
      )}
      {assignments.data && assignments.data.length === 0 && (
        <p className="text-gray-500">You have no assigned service users yet.</p>
      )}

      {assignments.data && assignments.data.length > 0 && (
        <ul className="flex flex-col gap-4">
          {assignments.data.map((su) => {
            const plans = (weekPlans.data ?? []).filter((p) => p.serviceUserId === su.id);
            return (
              <li key={su.id} className="flex flex-col gap-1 rounded-lg border border-gray-200 p-4">
                <span className="font-medium">{su.name}</span>
                {plans.length === 0 ? (
                  <span className="text-sm text-gray-500">No week plans yet.</span>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {plans.map((plan) => (
                      <li key={plan.id}>
                        <Link
                          to={`/week-plans/${plan.id}/record`}
                          className="text-blue-700 underline"
                        >
                          Record — week of {plan.weekCommencing}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
