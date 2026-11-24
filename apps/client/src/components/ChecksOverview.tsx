import type { CheckOccurrence } from '@care/shared';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toErrorMessage } from '../lib/errors';
import { checkDateLabel, fetchCheckOverview } from '../lib/house-checks';
import { Badge } from './ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

/**
 * Manager overview across every active home: what is still to do right now, what was missed in
 * the last week, and which recent checks reported issues (each linking to the signed check).
 * Everything is computed server-side; this only lays it out. Picking a home name hands it to the
 * week grid below.
 */
export function ChecksOverview({ onPickHome }: { onPickHome: (homeId: string) => void }) {
  const overview = useQuery({
    queryKey: ['house-checks', 'overview'],
    queryFn: fetchCheckOverview,
    refetchInterval: 60_000,
  });

  if (overview.isError) {
    return (
      <p role="alert" className="text-sm font-medium text-destructive">
        {toErrorMessage(overview.error, 'Could not load the overview.')}
      </p>
    );
  }
  if (!overview.data) return null;
  const { homes, since } = overview.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">All homes</CardTitle>
        <CardDescription>
          Checks still to do today, checks missed and issues reported since {checkDateLabel(since)}.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Home</TableHead>
              <TableHead>Still to do</TableHead>
              <TableHead>Missed</TableHead>
              <TableHead>Issues to report</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {homes.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No active homes.
                </TableCell>
              </TableRow>
            )}
            {homes.map((home) => {
              const clear =
                home.open.length === 0 && home.missed.length === 0 && home.flagged.length === 0;
              return (
                <TableRow key={home.homeId} className="align-top">
                  <TableCell className="font-medium">
                    <button
                      type="button"
                      className="text-left underline-offset-4 hover:underline"
                      onClick={() => onPickHome(home.homeId)}
                    >
                      {home.homeName}
                    </button>
                  </TableCell>
                  {clear ? (
                    <TableCell colSpan={3} className="text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5 text-success">
                        <CheckCircle2 className="size-4" />
                        All up to date
                      </span>
                    </TableCell>
                  ) : (
                    <>
                      <TableCell>
                        <ItemList
                          items={home.open}
                          empty="None"
                          render={(o) => (
                            <>
                              {o.templateName}{' '}
                              <Badge variant={o.status === 'OVERDUE' ? 'warning' : 'secondary'}>
                                {o.status === 'OVERDUE' ? 'Overdue' : 'Due'}
                              </Badge>
                            </>
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <ItemList
                          items={home.missed}
                          empty="None"
                          render={(o) => (
                            <span className="text-destructive">
                              {o.templateName} · {checkDateLabel(o.dueDate)}
                            </span>
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <ItemList
                          items={home.flagged}
                          empty="None"
                          render={(o) => (
                            <Link
                              to={`/checks/submissions/${o.submissionId}`}
                              className="text-primary underline-offset-4 hover:underline"
                            >
                              {o.templateName} · {checkDateLabel(o.dueDate)} — {o.issueCount} to
                              report
                            </Link>
                          )}
                        />
                      </TableCell>
                    </>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ItemList({
  items,
  empty,
  render,
}: {
  items: CheckOccurrence[];
  empty: string;
  render: (o: CheckOccurrence) => React.ReactNode;
}) {
  if (items.length === 0) return <span className="text-muted-foreground">{empty}</span>;
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {items.map((o) => (
        <li key={`${o.templateId}:${o.dueDate}`}>{render(o)}</li>
      ))}
    </ul>
  );
}
