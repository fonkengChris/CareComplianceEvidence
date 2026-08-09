import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
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
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome, {user?.name}</h1>
        <p className="text-sm text-muted-foreground">Your assigned service users and week plans.</p>
      </div>

      {(assignments.isLoading || weekPlans.isLoading) && (
        <p role="status" className="text-muted-foreground">
          Loading…
        </p>
      )}
      {assignments.isError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          Could not load your assignments.
        </p>
      )}
      {assignments.data && assignments.data.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            You have no assigned service users yet.
          </CardContent>
        </Card>
      )}

      {assignments.data && assignments.data.length > 0 && (
        <ul className="flex flex-col gap-4">
          {assignments.data.map((su) => {
            const plans = (weekPlans.data ?? []).filter((p) => p.serviceUserId === su.id);
            return (
              <li key={su.id}>
                <Card>
                  <CardHeader>
                    <CardTitle>{su.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {plans.length === 0 ? (
                      <span className="text-sm text-muted-foreground">No week plans yet.</span>
                    ) : (
                      <ul className="flex flex-col gap-2">
                        {plans.map((plan) => (
                          <li key={plan.id}>
                            <Link
                              to={`/week-plans/${plan.id}/record`}
                              className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium transition-colors hover:bg-accent"
                            >
                              <span className="flex items-center gap-2">
                                <CalendarDays className="size-4 text-muted-foreground" />
                                Record — week of {plan.weekCommencing}
                              </span>
                              <ChevronRight className="size-4 text-muted-foreground" />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
