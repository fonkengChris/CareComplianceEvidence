import type { ServiceUser } from '@care/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
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
import { fetchHomes } from '../lib/homes';
import { type ActiveFilter, deleteServiceUser, fetchServiceUsers } from '../lib/service-users';

/**
 * Service user list: a table (manager pattern, not mobile cards) with an
 * active/inactive/all filter. Rows link through to the detail view and show the home each
 * service user belongs to (homes hold the address, so service users have none of their own). Managers also get
 * a link to create and a delete button (confirmed first; the server refuses once the
 * service user has week plans — those can only be deactivated). The filter is part of the
 * query key so switching it refetches.
 */

const FILTERS: { value: ActiveFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

export default function ServiceUsersPage() {
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';
  const [filter, setFilter] = useState<ActiveFilter>('active');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['service-users', filter],
    queryFn: () => fetchServiceUsers(filter),
  });
  // All homes (incl. inactive) so every row's home resolves to a name; the server already
  // scopes this list to what the viewer may see.
  const homes = useQuery({ queryKey: ['homes', 'all'], queryFn: () => fetchHomes('all') });
  const homeNameById = new Map(homes.data?.map((h) => [h.id, h.name]));
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: string) => deleteServiceUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-users'] });
    },
  });

  function confirmDelete(serviceUser: ServiceUser) {
    if (
      window.confirm(
        `Permanently delete ${serviceUser.name}? This cannot be undone. Service users with week plans can only be deactivated.`,
      )
    ) {
      remove.mutate(serviceUser.id);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Service Users</h1>
          <p className="text-sm text-muted-foreground">
            People receiving 1-to-1 support and their contracted hours.
          </p>
        </div>
        {isManager && (
          <Link to="/service-users/new" className={buttonVariants()}>
            <Plus className="size-4" />
            New service user
          </Link>
        )}
      </div>

      <div className="flex gap-2" role="group" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            type="button"
            size="sm"
            variant={filter === f.value ? 'default' : 'outline'}
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {isLoading && (
        <p role="status" className="text-muted-foreground">
          Loading…
        </p>
      )}
      {isError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          Could not load service users.
        </p>
      )}
      {remove.isError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {toErrorMessage(remove.error, 'Could not delete the service user.')}
        </p>
      )}

      {data && data.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            No service users found.
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
                  <TableHead>Home</TableHead>
                  <TableHead>Contracted hours</TableHead>
                  <TableHead>Status</TableHead>
                  {isManager && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((su) => (
                  <ServiceUserRow
                    key={su.id}
                    serviceUser={su}
                    homeName={su.homeId ? homeNameById.get(su.homeId) : undefined}
                    isManager={isManager}
                    onDelete={confirmDelete}
                    deleting={remove.isPending && remove.variables === su.id}
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

function ServiceUserRow({
  serviceUser,
  homeName,
  isManager,
  onDelete,
  deleting,
}: {
  serviceUser: ServiceUser;
  homeName: string | undefined;
  isManager: boolean;
  onDelete: (serviceUser: ServiceUser) => void;
  deleting: boolean;
}) {
  return (
    <TableRow>
      <TableCell>
        <Link
          to={`/service-users/${serviceUser.id}`}
          className="font-medium text-primary hover:underline"
        >
          {serviceUser.name}
        </Link>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {serviceUser.homeId ? (
          <Link to={`/homes/${serviceUser.homeId}`} className="hover:underline">
            {homeName ?? 'View home'}
          </Link>
        ) : (
          '—'
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">{serviceUser.contractedHours}</TableCell>
      <TableCell>
        {serviceUser.active ? (
          <Badge variant="success">Active</Badge>
        ) : (
          <Badge variant="secondary">Inactive</Badge>
        )}
      </TableCell>
      {isManager && (
        <TableCell className="text-right">
          <div className="flex justify-end gap-2">
            <Link
              to={`/service-users/${serviceUser.id}/edit`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Edit
            </Link>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              aria-label={`Delete ${serviceUser.name}`}
              disabled={deleting}
              onClick={() => onDelete(serviceUser)}
            >
              <Trash2 />
              Delete
            </Button>
          </div>
        </TableCell>
      )}
    </TableRow>
  );
}
