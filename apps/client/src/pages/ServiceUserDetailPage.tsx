import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { fetchServiceUser, setServiceUserActive } from '../lib/service-users';

/**
 * Read-only detail view for a service user. Managers get an Edit link and a
 * Deactivate/Reactivate toggle (soft delete). The active toggle is a mutation that
 * invalidates the cached list + detail so the change is reflected everywhere.
 */
export default function ServiceUserDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();

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

  const isManager = user?.role === 'MANAGER';

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

      <Link to="/service-users" className="text-blue-700 underline">
        ← Back to service users
      </Link>
    </section>
  );
}
