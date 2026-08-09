import type { ServiceUser } from '@care/shared';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
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
import { type ActiveFilter, fetchServiceUsers } from '../lib/service-users';

/**
 * Service user list: a table (manager pattern, not mobile cards) with an
 * active/inactive/all filter. Rows link through to the detail view. Managers also get
 * a link to create; auditors see the list read-only. The filter is part of the query
 * key so switching it refetches.
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
                  <TableHead>Address</TableHead>
                  <TableHead>Contracted hours</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((su) => (
                  <ServiceUserRow key={su.id} serviceUser={su} />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function ServiceUserRow({ serviceUser }: { serviceUser: ServiceUser }) {
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
      <TableCell className="text-muted-foreground">{serviceUser.address ?? '—'}</TableCell>
      <TableCell className="text-muted-foreground">{serviceUser.contractedHours}</TableCell>
      <TableCell>
        {serviceUser.active ? (
          <Badge variant="success">Active</Badge>
        ) : (
          <Badge variant="secondary">Inactive</Badge>
        )}
      </TableCell>
    </TableRow>
  );
}
