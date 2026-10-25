import { isAssignmentScoped } from '@care/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Badge } from '../components/ui/badge';
import { Button, buttonVariants } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { toErrorMessage } from '../lib/errors';
import { fetchHome, fetchHomeServiceUsers, setHomeActive } from '../lib/homes';
import { endShift, fetchHomeShifts, shiftTime } from '../lib/shifts';
import {
  assignStaffToHome,
  fetchStaffForHome,
  unassignStaffFromHome,
} from '../lib/staff-assignments';
import { fetchUsers } from '../lib/users';

/**
 * Home detail view. Shows the home's service users and — for managers — who is on shift
 * now and the staff assigned to it. Assigning a staff member to the home lets them start a
 * shift there; only while on shift do they reach its service users (enforced server-side).
 * A manager can end anyone's shift from here. Managers also get
 * Edit and Deactivate/Reactivate (soft delete). Auditors see it read-only.
 */
export default function HomeDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isManager = user?.role === 'MANAGER';
  const [selected, setSelected] = useState<string[]>([]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['homes', id],
    queryFn: () => fetchHome(id!),
    enabled: Boolean(id),
  });

  const serviceUsers = useQuery({
    queryKey: ['homes', id, 'service-users'],
    queryFn: () => fetchHomeServiceUsers(id!),
    enabled: Boolean(id),
  });

  const toggle = useMutation({
    mutationFn: (active: boolean) => setHomeActive(id!, active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['homes'] }),
  });

  const assignedStaff = useQuery({
    queryKey: ['home-assignments', id],
    queryFn: () => fetchStaffForHome(id!),
    enabled: isManager && Boolean(id),
  });
  const allUsers = useQuery({ queryKey: ['users'], queryFn: fetchUsers, enabled: isManager });

  // Assign every ticked staff member in one go. The POST is idempotent, so retrying after a
  // partial failure is safe; refresh the list either way so successes show up.
  const assign = useMutation({
    mutationFn: (staffIds: string[]) =>
      Promise.all(staffIds.map((staffId) => assignStaffToHome(staffId, id!))),
    onSuccess: () => setSelected([]),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['home-assignments', id] }),
  });
  const unassign = useMutation({
    mutationFn: (staffId: string) => unassignStaffFromHome(staffId, id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['home-assignments', id] }),
  });

  const shifts = useQuery({
    queryKey: ['shifts', 'home', id],
    queryFn: () => fetchHomeShifts(id!),
    enabled: isManager && Boolean(id),
  });
  const endSession = useMutation({
    mutationFn: endShift,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shifts', 'home', id] }),
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
        Could not load this home.
      </p>
    );
  }

  const unassignedStaff = (allUsers.data ?? []).filter(
    (u) => isAssignmentScoped(u.role) && !(assignedStaff.data ?? []).some((a) => a.id === u.id),
  );

  return (
    <section className="flex flex-col gap-6">
      <Link
        to="/homes"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to homes
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
            <Link to={`/homes/${data.id}/edit`} className={buttonVariants({ variant: 'outline' })}>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Service users</CardTitle>
        </CardHeader>
        <CardContent>
          {serviceUsers.isLoading && (
            <p role="status" className="text-muted-foreground">
              Loading…
            </p>
          )}
          {serviceUsers.data && serviceUsers.data.length === 0 && (
            <p className="text-sm text-muted-foreground">No service users in this home yet.</p>
          )}
          {serviceUsers.data && serviceUsers.data.length > 0 && (
            <ul className="flex flex-col gap-2">
              {serviceUsers.data.map((su) => (
                <li key={su.id}>
                  <Link
                    to={`/service-users/${su.id}`}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    {su.name}
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
            <CardTitle>On shift now</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {endSession.isError && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {toErrorMessage(endSession.error)}
              </p>
            )}
            {shifts.data && shifts.data.length === 0 && (
              <p className="text-sm text-muted-foreground">Nobody is on shift here right now.</p>
            )}
            {shifts.data && shifts.data.length > 0 && (
              <ul className="flex flex-col gap-2">
                {shifts.data.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3">
                    <span className="text-sm">
                      {s.staffName}{' '}
                      <span className="text-muted-foreground">
                        · {shiftTime(s.startedAt)}–{shiftTime(s.expiresAt)}
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => endSession.mutate(s.id)}
                      disabled={endSession.isPending}
                      className="text-destructive hover:text-destructive"
                    >
                      End shift
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {isManager && (
        <Card>
          <CardHeader>
            <CardTitle>Assigned staff</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Staff assigned here can start a shift at this home. Only while on shift can they view
              and record for its service users.
            </p>
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

            {unassignedStaff.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                All staff are already assigned to this home.
              </p>
            ) : (
              <div role="group" aria-labelledby="assign-staff" className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span id="assign-staff" className="text-sm font-medium">
                    Assign staff
                  </span>
                  {unassignedStaff.length > 1 && (
                    <div className="flex gap-3 text-sm">
                      <button
                        type="button"
                        className="text-primary hover:underline"
                        onClick={() => setSelected(unassignedStaff.map((s) => s.id))}
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        className="text-muted-foreground hover:underline"
                        onClick={() => setSelected([])}
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>
                <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-md border border-border p-2">
                  {unassignedStaff.map((s) => (
                    <li key={s.id}>
                      <label className="flex cursor-pointer items-center gap-3 rounded px-2 py-2 text-sm hover:bg-accent">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={selected.includes(s.id)}
                          onChange={(e) =>
                            setSelected((prev) =>
                              e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id),
                            )
                          }
                        />
                        {s.name}
                      </label>
                    </li>
                  ))}
                </ul>
                <div>
                  <Button
                    type="button"
                    onClick={() => assign.mutate(selected)}
                    disabled={selected.length === 0 || assign.isPending}
                  >
                    {assign.isPending ? 'Assigning…' : `Assign selected (${selected.length})`}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
