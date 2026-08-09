import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { fetchServiceUser, setServiceUserActive } from '../lib/service-users';
import {
  assignStaff,
  fetchStaffForServiceUser,
  unassignStaff,
} from '../lib/staff-assignments';
import { fetchUsers } from '../lib/users';
import { fetchWeekPlans } from '../lib/week-plans';

/**
 * Read-only detail view for a service user. Managers get an Edit link and a
 * Deactivate/Reactivate toggle (soft delete). The active toggle is a mutation that
 * invalidates the cached list + detail so the change is reflected everywhere.
 */
export default function ServiceUserDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isManager = user?.role === 'MANAGER';
  const [staffToAdd, setStaffToAdd] = useState('');

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
      <p role="status" className="text-gray-500">
        Loading…
      </p>
    );
  }
  if (isError || !data) {
    return (
      <p role="alert" className="text-red-600">
        Could not load this service user.
      </p>
    );
  }

  // Staff not yet assigned to this service user — the pool the Assign picker offers.
  const unassignedStaff = (allUsers.data ?? []).filter(
    (u) => u.role === 'STAFF' && !(assignedStaff.data ?? []).some((a) => a.id === u.id),
  );

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{data.name}</h1>
        {isManager && (
          <div className="flex gap-2">
            <Link
              to={`/service-users/${data.id}/edit`}
              className="rounded border border-gray-300 px-3 py-2"
            >
              Edit
            </Link>
            <button
              type="button"
              disabled={toggle.isPending}
              onClick={() => toggle.mutate(!data.active)}
              className="rounded border border-gray-300 px-3 py-2 disabled:opacity-50"
            >
              {data.active ? 'Deactivate' : 'Reactivate'}
            </button>
          </div>
        )}
      </div>

      {toggle.isError && (
        <p role="alert" className="text-red-600">
          {(toggle.error as Error).message}
        </p>
      )}

      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2">
        <dt className="text-gray-500">Address</dt>
        <dd>{data.address ?? '—'}</dd>
        <dt className="text-gray-500">Contracted hours</dt>
        <dd>{data.contractedHours}</dd>
        <dt className="text-gray-500">Status</dt>
        <dd>
          {data.active ? (
            <span className="text-green-700">Active</span>
          ) : (
            <span className="text-gray-500">Inactive</span>
          )}
        </dd>
      </dl>

      <div className="flex flex-col gap-2 border-t border-gray-200 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-medium">Week plans</h2>
          {isManager && (
            <Link
              to={`/service-users/${data.id}/week-plans/new`}
              className="rounded bg-blue-600 px-3 py-2 font-medium text-white"
            >
              New week plan
            </Link>
          )}
        </div>
        {weekPlans.isLoading && (
          <p role="status" className="text-gray-500">
            Loading…
          </p>
        )}
        {weekPlans.data && weekPlans.data.length === 0 && (
          <p className="text-gray-500">No week plans yet.</p>
        )}
        {weekPlans.data && weekPlans.data.length > 0 && (
          <ul className="flex flex-col gap-1">
            {weekPlans.data.map((plan) => (
              <li key={plan.id}>
                <Link to={`/week-plans/${plan.id}`} className="text-blue-700 underline">
                  Week of {plan.weekCommencing}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {isManager && (
        <div className="flex flex-col gap-2 border-t border-gray-200 pt-4">
          <h2 className="text-lg font-medium">Assigned staff</h2>
          {(assign.isError || unassign.isError) && (
            <p role="alert" className="text-red-600">
              {((assign.error ?? unassign.error) as Error).message}
            </p>
          )}
          {assignedStaff.data && assignedStaff.data.length === 0 && (
            <p className="text-gray-500">No staff assigned yet.</p>
          )}
          {assignedStaff.data && assignedStaff.data.length > 0 && (
            <ul className="flex flex-col gap-1">
              {assignedStaff.data.map((s) => (
                <li key={s.id} className="flex items-center gap-3">
                  <span>{s.name}</span>
                  <button
                    type="button"
                    onClick={() => unassign.mutate(s.id)}
                    disabled={unassign.isPending}
                    className="rounded border border-gray-300 px-2 py-1 text-sm text-red-700 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Assign a staff member</span>
              <select
                aria-label="Assign a staff member"
                value={staffToAdd}
                onChange={(e) => setStaffToAdd(e.target.value)}
                className="rounded border border-gray-300 p-2"
              >
                <option value="">— Select —</option>
                {unassignedStaff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => assign.mutate(staffToAdd)}
              disabled={!staffToAdd || assign.isPending}
              className="rounded bg-blue-600 px-3 py-2 font-medium text-white disabled:opacity-50"
            >
              {assign.isPending ? 'Assigning…' : 'Assign'}
            </button>
          </div>
        </div>
      )}

      <Link to="/service-users" className="text-blue-700 underline">
        ← Back to service users
      </Link>
    </section>
  );
}
