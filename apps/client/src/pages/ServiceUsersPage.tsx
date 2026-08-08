import type { ServiceUser } from '@care/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { type ActiveFilter, fetchServiceUsers } from '../lib/service-users';

/**
 * Manager list of service users: a table (manager pattern, not mobile cards) with an
 * active/inactive/all filter and a link to create. Rows link through to the detail
 * view. The filter is part of the query key so switching it refetches.
 */

const FILTERS: { value: ActiveFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

export default function ServiceUsersPage() {
  const [filter, setFilter] = useState<ActiveFilter>('active');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['service-users', filter],
    queryFn: () => fetchServiceUsers(filter),
  });

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Service Users</h1>
        <Link
          to="/service-users/new"
          className="rounded bg-blue-600 px-3 py-2 font-medium text-white"
        >
          New service user
        </Link>
      </div>

      <div className="flex gap-2" role="group" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={`rounded border px-3 py-1 ${
              filter === f.value
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-gray-300 text-gray-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading && (
        <p role="status" className="text-gray-500">
          Loading…
        </p>
      )}
      {isError && (
        <p role="alert" className="text-red-600">
          Could not load service users.
        </p>
      )}

      {data && data.length === 0 && <p className="text-gray-500">No service users found.</p>}

      {data && data.length > 0 && (
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-gray-200 text-sm text-gray-600">
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Address</th>
              <th className="py-2 pr-4">Contracted hours</th>
              <th className="py-2 pr-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map((su) => (
              <ServiceUserRow key={su.id} serviceUser={su} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function ServiceUserRow({ serviceUser }: { serviceUser: ServiceUser }) {
  return (
    <tr className="border-b border-gray-100">
      <td className="py-2 pr-4">
        <Link to={`/service-users/${serviceUser.id}`} className="text-blue-700 underline">
          {serviceUser.name}
        </Link>
      </td>
      <td className="py-2 pr-4 text-gray-700">{serviceUser.address ?? '—'}</td>
      <td className="py-2 pr-4 text-gray-700">{serviceUser.contractedHours}</td>
      <td className="py-2 pr-4">
        {serviceUser.active ? (
          <span className="text-green-700">Active</span>
        ) : (
          <span className="text-gray-500">Inactive</span>
        )}
      </td>
    </tr>
  );
}
