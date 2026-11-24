import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
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
import { fetchCheckTemplates, scheduleLabel, setCheckTemplateActive } from '../lib/house-checks';

/**
 * Manager list of house-check templates: each check's schedule and question count, with links
 * to edit it and a toggle to retire/restore it. A retired check stops falling due at every home;
 * its past submissions and PDFs stay.
 */
export default function CheckTemplatesPage() {
  const queryClient = useQueryClient();
  const templates = useQuery({
    queryKey: ['house-checks', 'templates'],
    queryFn: fetchCheckTemplates,
  });
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      setCheckTemplateActive(id, active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['house-checks'] }),
  });

  return (
    <section className="flex flex-col gap-6">
      <Link
        to="/checks"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Back to checks
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Manage checks</h1>
          <p className="text-sm text-muted-foreground">
            The forms staff complete and when they fall due. Schedules apply to every home.
          </p>
        </div>
        <Link
          to="/checks/templates/new"
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          <Plus className="size-4" />
          New check
        </Link>
      </div>

      {templates.isError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {toErrorMessage(templates.error, 'Could not load checks.')}
        </p>
      )}
      {toggle.isError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {toErrorMessage(toggle.error)}
        </p>
      )}

      {templates.data && (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Check</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead className="text-right">Questions</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.data.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No checks yet.
                    </TableCell>
                  </TableRow>
                )}
                {templates.data.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>{scheduleLabel(t)}</TableCell>
                    <TableCell className="text-right">
                      {t.definition.sections.reduce((n, s) => n + s.questions.length, 0)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={t.active ? 'success' : 'outline'}>
                        {t.active ? 'Active' : 'Retired'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Link
                          to={`/checks/templates/${t.id}`}
                          className="inline-flex h-8 items-center rounded-md px-3 text-xs font-medium hover:bg-accent"
                          aria-label={`Edit ${t.name}`}
                        >
                          Edit
                        </Link>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={toggle.isPending}
                          onClick={() => toggle.mutate({ id: t.id, active: !t.active })}
                        >
                          {t.active ? 'Retire' : 'Restore'}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
