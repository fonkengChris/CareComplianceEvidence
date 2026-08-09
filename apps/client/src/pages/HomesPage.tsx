import type { Home } from '@care/shared';
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
import { type ActiveFilter, fetchHomes } from '../lib/homes';

/**
 * Home list: the residences/groups service users belong to. Managers can create and
 * open each home to manage its service users and assigned staff; auditors browse
 * read-only. The active/inactive/all filter is part of the query key so switching
 * refetches.
 */

const FILTERS: { value: ActiveFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

export default function HomesPage() {
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';
  const [filter, setFilter] = useState<ActiveFilter>('active');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['homes', filter],
    queryFn: () => fetchHomes(filter),
  });

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Homes</h1>
          <p className="text-sm text-muted-foreground">
            Residences service users belong to. Staff assigned to a home reach everyone in it.
          </p>
        </div>
        {isManager && (
          <Link to="/homes/new" className={buttonVariants()}>
            <Plus className="size-4" />
            New home
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
          Could not load homes.
        </p>
      )}

      {data && data.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">No homes found.</CardContent>
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
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((home) => (
                  <HomeRow key={home.id} home={home} />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function HomeRow({ home }: { home: Home }) {
  return (
    <TableRow>
      <TableCell>
        <Link to={`/homes/${home.id}`} className="font-medium text-primary hover:underline">
          {home.name}
        </Link>
      </TableCell>
      <TableCell className="text-muted-foreground">{home.address ?? '—'}</TableCell>
      <TableCell>
        {home.active ? (
          <Badge variant="success">Active</Badge>
        ) : (
          <Badge variant="secondary">Inactive</Badge>
        )}
      </TableCell>
    </TableRow>
  );
}
