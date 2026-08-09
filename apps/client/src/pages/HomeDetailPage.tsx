import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Badge } from '../components/ui/badge';
import { Button, buttonVariants } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Label } from '../components/ui/label';
import { Select } from '../components/ui/select';
import { toErrorMessage } from '../lib/errors';
import { fetchHome, fetchHomeServiceUsers, setHomeActive } from '../lib/homes';
import {
  assignStaffToHome,
  fetchStaffForHome,
  unassignStaffFromHome,
} from '../lib/staff-assignments';
import { fetchUsers } from '../lib/users';

/**
 * Home detail view. Shows the home's service users and — for managers — the staff
 * assigned to it. Assigning a staff member to the home grants them access to every
 * service user in it (group-based supervision, enforced server-side). Managers also get
 * Edit and Deactivate/Reactivate (soft delete). Auditors see it read-only.
 */
export default function HomeDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isManager = user?.role === 'MANAGER';
  const [staffToAdd, setStaffToAdd] = useState('');

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

  const assign = useMutation({
    mutationFn: (staffId: string) => assignStaffToHome(staffId, id!),
    onSuccess: () => {
      setStaffToAdd('');
      queryClient.invalidateQueries({ queryKey: ['home-assignments', id] });
    },
  });
  const unassign = useMutation({
    mutationFn: (staffId: string) => unassignStaffFromHome(staffId, id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['home-assignments', id] }),
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
    (u) => u.role === 'STAFF' && !(assignedStaff.data ?? []).some((a) => a.id === u.id),
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
            <CardTitle>Assigned staff</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Staff assigned here can view and record for every service user in this home.
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
