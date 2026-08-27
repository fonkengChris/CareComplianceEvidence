import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, LayoutTemplate, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Badge } from '../components/ui/badge';
import { Button, buttonVariants } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select } from '../components/ui/select';
import { toErrorMessage } from '../lib/errors';
import { fetchHomes } from '../lib/homes';
import { fetchServiceUser, setServiceUserActive } from '../lib/service-users';
import { assignStaff, fetchStaffForServiceUser, unassignStaff } from '../lib/staff-assignments';
import { fetchUsers } from '../lib/users';
import { generateWeekFromTemplate } from '../lib/week-plan-templates';
import { fetchWeekPlans } from '../lib/week-plans';

/**
 * Read-only detail view for a service user. Managers get an Edit link and a
 * Deactivate/Reactivate toggle (soft delete). The active toggle is a mutation that
 * invalidates the cached list + detail so the change is reflected everywhere.
 */
export default function ServiceUserDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isManager = user?.role === 'MANAGER';
  const [staffToAdd, setStaffToAdd] = useState('');
  const [generateWeek, setGenerateWeek] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['service-users', id],
    queryFn: () => fetchServiceUser(id!),
    enabled: Boolean(id),
  });

  const toggle = useMutation({
    mutationFn: (active: boolean) => setServiceUserActive(id!, active),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-users'] });
    },
  });

  const weekPlans = useQuery({
    queryKey: ['week-plans', 'by-service-user', id],
    queryFn: () => fetchWeekPlans(id!),
    enabled: Boolean(id),
  });

  // Generate a new week plan from this service user's template, then open it to adjust.
  const generate = useMutation({
    mutationFn: () => generateWeekFromTemplate(id!, generateWeek),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['week-plans', 'by-service-user', id] });
      navigate(`/week-plans/${created.id}`);
    },
  });

  // Homes, to resolve the service user's homeId to a name (includes inactive homes).
  const homes = useQuery({ queryKey: ['homes', 'all'], queryFn: () => fetchHomes('all') });

  // Supervision group (managers only): staff assigned to this service user, and the
  // pool of STAFF users to pick from.
  const assignedStaff = useQuery({
    queryKey: ['assignments', 'service-user', id],
    queryFn: () => fetchStaffForServiceUser(id!),
    enabled: isManager && Boolean(id),
  });
  const allUsers = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
    enabled: isManager,
  });

  const assign = useMutation({
    mutationFn: (staffId: string) => assignStaff(staffId, id!),
    onSuccess: () => {
      setStaffToAdd('');
      queryClient.invalidateQueries({ queryKey: ['assignments', 'service-user', id] });
    },
  });
  const unassign = useMutation({
    mutationFn: (staffId: string) => unassignStaff(staffId, id!),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['assignments', 'service-user', id] }),
  });

  if (isLoading) {
    return (
      <p role="status" className="text-muted-foreground">
        Loading…
      </p>
    );
  }
  if (isError || !data) {
    return (
      <p role="alert" className="text-sm font-medium text-destructive">
        Could not load this service user.
      </p>
    );
  }

  // Staff not yet assigned to this service user — the pool the Assign picker offers.
  const unassignedStaff = (allUsers.data ?? []).filter(
    (u) => u.role === 'STAFF' && !(assignedStaff.data ?? []).some((a) => a.id === u.id),
  );

  return (
    <section className="flex flex-col gap-6">
      <Link
        to="/service-users"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to service users
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{data.name}</h1>
          {data.active ? (
            <Badge variant="success">Active</Badge>
          ) : (
            <Badge variant="secondary">Inactive</Badge>
          )}
        </div>
        {isManager && (
          <div className="flex gap-2">
            <Link
              to={`/service-users/${data.id}/edit`}
              className={buttonVariants({ variant: 'outline' })}
            >
              Edit
            </Link>
            <Button
              type="button"
              variant="outline"
              disabled={toggle.isPending}
              onClick={() => toggle.mutate(!data.active)}
            >
              {data.active ? 'Deactivate' : 'Reactivate'}
            </Button>
          </div>
        )}
      </div>

      {toggle.isError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {toErrorMessage(toggle.error)}
        </p>
      )}

      <Card>
        <CardContent className="grid grid-cols-[max-content_1fr] gap-x-8 gap-y-3 py-6">
          <dt className="text-sm text-muted-foreground">Address</dt>
          <dd className="text-sm">{data.address ?? '—'}</dd>
          <dt className="text-sm text-muted-foreground">Contracted hours</dt>
          <dd className="text-sm">{data.contractedHours}</dd>
          <dt className="text-sm text-muted-foreground">Home</dt>
          <dd className="text-sm">
            {data.homeId ? (
              <Link to={`/homes/${data.homeId}`} className="text-primary hover:underline">
                {homes.data?.find((h) => h.id === data.homeId)?.name ?? 'View home'}
              </Link>
            ) : (
              '—'
            )}
          </dd>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Week plans</CardTitle>
          {isManager && (
            <div className="flex gap-2">
              <Link
                to={`/service-users/${data.id}/template`}
                className={buttonVariants({ size: 'sm', variant: 'outline' })}
              >
                <LayoutTemplate className="size-4" />
                Edit template
              </Link>
              <Link
                to={`/service-users/${data.id}/week-plans/new`}
                className={buttonVariants({ size: 'sm', variant: 'outline' })}
              >
                <Plus className="size-4" />
                New week plan
              </Link>
            </div>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {isManager && (
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-4">
              <p className="text-sm font-medium">Generate a week from the template</p>
              {generate.isError && (
                <p role="alert" className="text-sm font-medium text-destructive">
                  {toErrorMessage(generate.error)}
                </p>
              )}
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="generate-week">Week commencing</Label>
                  <Input
                    id="generate-week"
                    type="date"
                    aria-label="Generate week commencing"
                    value={generateWeek}
                    onChange={(e) => setGenerateWeek(e.target.value)}
                    className="w-44"
                  />
                </div>
                <Button
                  type="button"
                  onClick={() => generate.mutate()}
                  disabled={!generateWeek || generate.isPending}
                >
                  {generate.isPending ? 'Generating…' : 'Generate week'}
                </Button>
              </div>
            </div>
          )}
          {weekPlans.isLoading && (
            <p role="status" className="text-muted-foreground">
              Loading…
            </p>
          )}
          {weekPlans.data && weekPlans.data.length === 0 && (
            <p className="text-sm text-muted-foreground">No week plans yet.</p>
          )}
          {weekPlans.data && weekPlans.data.length > 0 && (
            <ul className="flex flex-col gap-2">
              {weekPlans.data.map((plan) => (
                <li key={plan.id}>
                  <Link
                    to={`/week-plans/${plan.id}`}
                    className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                  >
                    <CalendarDays className="size-4" />
                    Week of {plan.weekCommencing}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {isManager && (
        <Card>
          <CardHeader>
            <CardTitle>Assigned staff</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {(assign.isError || unassign.isError) && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {toErrorMessage(assign.error ?? unassign.error)}
              </p>
            )}
            {assignedStaff.data && assignedStaff.data.length === 0 && (
              <p className="text-sm text-muted-foreground">No staff assigned yet.</p>
            )}
            {assignedStaff.data && assignedStaff.data.length > 0 && (
              <ul className="flex flex-col gap-2">
                {assignedStaff.data.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3">
                    <span className="text-sm">{s.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => unassign.mutate(s.id)}
                      disabled={unassign.isPending}
                      className="text-destructive hover:text-destructive"
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="assign-staff">Assign a staff member</Label>
                <Select
                  id="assign-staff"
                  aria-label="Assign a staff member"
                  value={staffToAdd}
                  onChange={(e) => setStaffToAdd(e.target.value)}
                  className="min-w-56"
                >
                  <option value="">— Select —</option>
                  {unassignedStaff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                type="button"
                onClick={() => assign.mutate(staffToAdd)}
                disabled={!staffToAdd || assign.isPending}
              >
                {assign.isPending ? 'Assigning…' : 'Assign'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
