import type { User } from '@care/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Badge } from '../components/ui/badge';
import { Button, buttonVariants } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { toErrorMessage } from '../lib/errors';
import { deleteUser, fetchUsers } from '../lib/users';

/**
 * Manager users-management list: a table of every account with its role and status,
 * plus a link to add a new user and a delete button (confirmed first). The server refuses
 * to delete your own account or anyone on the audit trail — those can only be deactivated.
 * MANAGER-only (route-guarded + server-enforced). This is the manager/table pattern, not
 * the mobile-card staff pattern.
 */
export default function UsersPage() {
  const { user: me } = useAuth();
  const { data, isLoading, isError } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  function confirmDelete(user: User) {
    if (
      window.confirm(
        `Permanently delete ${user.name}'s account? This cannot be undone. Users who have recorded changes can only be deactivated.`,
      )
    ) {
      remove.mutate(user.id);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">
            Staff, manager and auditor accounts with access to the tracker.
          </p>
        </div>
        <Link to="/users/new" className={buttonVariants()}>
          <Plus className="size-4" />
          Add new user
        </Link>
      </div>

      {isLoading && (
        <p role="status" className="text-muted-foreground">
          Loading…
        </p>
      )}
      {isError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          Could not load users.
        </p>
      )}
      {remove.isError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {toErrorMessage(remove.error, 'Could not delete the user.')}
        </p>
      )}

      {data && data.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            No users found.
          </CardContent>
        </Card>
      )}

      {data && data.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    isSelf={u.id === me?.id}
                    onDelete={confirmDelete}
                    deleting={remove.isPending && remove.variables === u.id}
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function UserRow({
  user,
  isSelf,
  onDelete,
  deleting,
}: {
  user: User;
  isSelf: boolean;
  onDelete: (user: User) => void;
  deleting: boolean;
}) {
  return (
    <TableRow>
      <TableCell className="font-medium">{user.name}</TableCell>
      <TableCell className="text-muted-foreground">{user.email}</TableCell>
      <TableCell>
        <Badge variant="outline">{user.role}</Badge>
      </TableCell>
      <TableCell>
        {user.active ? (
          <Badge variant="success">Active</Badge>
        ) : (
          <Badge variant="secondary">Inactive</Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Link
            to={`/users/${user.id}/edit`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Edit
          </Link>
          {/* No delete on your own row — the server refuses it too. */}
          {!isSelf && (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              aria-label={`Delete ${user.name}`}
              disabled={deleting}
              onClick={() => onDelete(user)}
            >
              <Trash2 />
              Delete
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
