import type { CheckOccurrence } from '@care/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ClipboardCheck, Download, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ChecksOverview } from '../components/ChecksOverview';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Label } from '../components/ui/label';
import { Select } from '../components/ui/select';
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
import {
  CHECK_STATUS_LABELS,
  CHECK_STATUS_VARIANTS,
  checkDateLabel,
  downloadCheckPdf,
  fetchCheckWeek,
  fetchDueChecks,
} from '../lib/house-checks';
import { fetchMyShift } from '../lib/shifts';
import { currentWeekCommencing, shiftWeek } from '../lib/week';

/**
 * House checks. Staff (mobile-first) see the checks that can be done at the home they're on
 * shift at and open the form; managers (table) see each home's week — which checks were done,
 * late or missed — and download the signed PDFs.
 */
export default function ChecksPage() {
  const { user } = useAuth();
  return user?.role === 'MANAGER' ? <ManagerChecks /> : <StaffChecks />;
}

function formPath(o: Pick<CheckOccurrence, 'templateId' | 'dueDate'>, homeId: string) {
  return `/checks/${o.templateId}/${homeId}/${o.dueDate}`;
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function StaffChecks() {
  const shift = useQuery({ queryKey: ['shifts', 'me'], queryFn: fetchMyShift });
  const homeId = shift.data?.homeId;
  const due = useQuery({
    queryKey: ['house-checks', 'due', homeId],
    queryFn: () => fetchDueChecks(homeId!),
    enabled: Boolean(homeId),
  });

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">House checks</h1>
        <p className="text-sm text-muted-foreground">
          {shift.data ? `Checks to complete at ${shift.data.homeName}.` : 'Checks for your home.'}
        </p>
      </div>

      {(shift.isLoading || due.isLoading) && (
        <p role="status" className="text-muted-foreground">
          Loading…
        </p>
      )}
      {shift.isSuccess && !shift.data && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center text-muted-foreground">
            <p>Start a shift at your home to see and complete its checks.</p>
            <Link
              to="/"
              className="inline-flex h-9 items-center rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground shadow-sm hover:bg-accent"
            >
              Go to dashboard
            </Link>
          </CardContent>
        </Card>
      )}
      {due.isError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {toErrorMessage(due.error, 'Could not load checks.')}
        </p>
      )}
      {due.data && due.data.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No checks are due at this home.
          </CardContent>
        </Card>
      )}
      {due.data && due.data.length > 0 && homeId && (
        <ul className="flex flex-col gap-3">
          {due.data.map((o) => {
            const open = o.status === 'DUE' || o.status === 'OVERDUE';
            return (
              <li key={o.templateId}>
                <Card>
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="font-medium">{o.templateName}</p>
                      <p className="text-sm text-muted-foreground">
                        {checkDateLabel(o.dueDate)}
                        {o.dueByTime ? ` · due by ${o.dueByTime}` : ''}
                      </p>
                      {o.submittedByName && o.submittedAt && (
                        <p className="text-sm text-muted-foreground">
                          Completed by {o.submittedByName} at {timeOf(o.submittedAt)}
                          {o.issueCount ? ` · ${o.issueCount} to report` : ''}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Badge variant={CHECK_STATUS_VARIANTS[o.status]}>
                        {CHECK_STATUS_LABELS[o.status]}
                      </Badge>
                      {open && (
                        <Link
                          to={formPath(o, homeId)}
                          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
                        >
                          <ClipboardCheck className="size-4" />
                          Start
                        </Link>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ManagerChecks() {
  const homes = useQuery({ queryKey: ['homes', 'active'], queryFn: () => fetchHomes('active') });
  const [selectedHome, setSelectedHome] = useState('');
  const homeId = selectedHome || homes.data?.[0]?.id || '';
  const [week, setWeek] = useState(() => currentWeekCommencing());
  const grid = useQuery({
    queryKey: ['house-checks', 'week', homeId, week],
    queryFn: () => fetchCheckWeek(homeId, week),
    enabled: Boolean(homeId),
  });
  const download = useMutation({ mutationFn: downloadCheckPdf });
  const days = Array.from({ length: 7 }, (_, i) => shiftWeek(week, i));

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">House checks</h1>
          <p className="text-sm text-muted-foreground">
            What's still to do, what was missed and what needs reporting — then each home's week,
            with the signed checks.
          </p>
        </div>
        <Link
          to="/checks/templates"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-4 text-sm font-medium shadow-sm hover:bg-accent"
        >
          <Settings2 className="size-4" />
          Manage checks
        </Link>
      </div>

      <ChecksOverview
        onPickHome={(id) => {
          setSelectedHome(id);
          document
            .getElementById('checks-home')
            ?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
        }}
      />

      <h2 className="-mb-2 text-lg font-semibold tracking-tight">Week by home</h2>
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex w-full flex-col gap-1.5 sm:w-64">
          <Label htmlFor="checks-home">Home</Label>
          <Select id="checks-home" value={homeId} onChange={(e) => setSelectedHome(e.target.value)}>
            {(homes.data ?? []).map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Previous week"
            onClick={() => setWeek(shiftWeek(week, -7))}
          >
            <ChevronLeft />
          </Button>
          <span className="min-w-36 text-center text-sm font-medium">
            Week of {checkDateLabel(week)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Next week"
            onClick={() => setWeek(shiftWeek(week, 7))}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      {download.isError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {toErrorMessage(download.error, 'Could not download the PDF.')}
        </p>
      )}
      {grid.isError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {toErrorMessage(grid.error, 'Could not load checks.')}
        </p>
      )}
      {homes.data && homes.data.length === 0 && (
        <p className="text-muted-foreground">Add a home to start tracking its checks.</p>
      )}

      {grid.data && (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Check</TableHead>
                  {days.map((d) => (
                    <TableHead key={d} className="text-center">
                      {checkDateLabel(d)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {grid.data.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      No checks set up yet.
                    </TableCell>
                  </TableRow>
                )}
                {grid.data.rows.map((row) => (
                  <TableRow key={row.templateId}>
                    <TableCell className="font-medium">{row.templateName}</TableCell>
                    {days.map((d) => {
                      const o = row.occurrences.find((x) => x.dueDate === d);
                      return (
                        <TableCell key={d} className="text-center">
                          {o ? (
                            <GridCell occurrence={o} homeId={homeId} onDownload={download.mutate} />
                          ) : null}
                        </TableCell>
                      );
                    })}
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

function GridCell({
  occurrence: o,
  homeId,
  onDownload,
}: {
  occurrence: CheckOccurrence;
  homeId: string;
  onDownload: (submissionId: string) => void;
}) {
  const label = `${o.templateName} ${o.dueDate}: ${CHECK_STATUS_LABELS[o.status]}`;
  return (
    <div className="flex flex-col items-center gap-1">
      <Badge variant={CHECK_STATUS_VARIANTS[o.status]} title={o.submittedByName ?? undefined}>
        {CHECK_STATUS_LABELS[o.status]}
      </Badge>
      {o.issueCount ? (
        <span className="text-xs text-destructive">{o.issueCount} to report</span>
      ) : null}
      {o.submissionId && (
        <div className="flex items-center gap-1">
          <Link
            to={`/checks/submissions/${o.submissionId}`}
            aria-label={`View — ${label}`}
            className="text-xs text-primary underline-offset-4 hover:underline"
          >
            View
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={`Download PDF — ${label}`}
            onClick={() => onDownload(o.submissionId!)}
          >
            <Download />
          </Button>
        </div>
      )}
      {(o.status === 'DUE' || o.status === 'OVERDUE') && (
        <Link
          to={formPath(o, homeId)}
          className="text-xs text-primary underline-offset-4 hover:underline"
        >
          Complete
        </Link>
      )}
    </div>
  );
}
