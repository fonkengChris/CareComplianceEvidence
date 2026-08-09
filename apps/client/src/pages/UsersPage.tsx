import type { User } from '@care/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchUsers } from '../lib/users';

/**
 * Manager users-management list: a table of every account with its role and status,
 * plus a link to add a new user. MANAGER-only (route-guarded + server-enforced). This
 * is the manager/table pattern, not the mobile-card staff pattern.
 */
export default function UsersPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Users</h1>
        <Link to="/users/new" className="rounded bg-blue-600 px-3 py-2 font-medium text-white">
          Add new user
        </Link>
      </div>

      {isLoading && (
        <p role="status" className="text-gray-500">
          Loading…
        </p>
      )}
      {isError && (
        <p role="alert" className="text-red-600">
          Could not load users.
        </p>
      )}

      {data && data.length === 0 && <p className="text-gray-500">No users found.</p>}

      {data && data.length > 0 && (
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-gray-200 text-sm text-gray-600">
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Role</th>
              <th className="py-2 pr-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map((u) => (
              <UserRow key={u.id} user={u} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function UserRow({ user }: { user: User }) {
  return (
    <tr className="border-b border-gray-100">
      <td className="py-2 pr-4">{user.name}</td>
      <td className="py-2 pr-4 text-gray-700">{user.email}</td>
      <td className="py-2 pr-4 text-gray-700">{user.role}</td>
      <td className="py-2 pr-4">
        {user.active ? (
          <span className="text-green-700">Active</span>
        ) : (
          <span className="text-gray-500">Inactive</span>
        )}
      </td>
    </tr>
  );
}
