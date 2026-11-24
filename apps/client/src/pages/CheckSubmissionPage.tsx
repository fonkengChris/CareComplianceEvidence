import { blockLabel, formatCheckAnswer, isFlagged } from '@care/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronLeft, Download } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { toErrorMessage } from '../lib/errors';
import { checkDateLabel, downloadCheckPdf, fetchCheckSubmission } from '../lib/house-checks';
import { cn } from '../lib/utils';

/**
 * A signed house check on screen: every answer as it was submitted (against the form version it
 * was signed on, not today's template), with "report to management" answers highlighted and a
 * download of the stored PDF. Read-only — submissions are never edited.
 */
export default function CheckSubmissionPage() {
  const { id = '' } = useParams();
  const submission = useQuery({
    queryKey: ['house-checks', 'submissions', id],
    queryFn: () => fetchCheckSubmission(id),
  });
  const download = useMutation({ mutationFn: downloadCheckPdf });
  const s = submission.data;

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-6">
      <Link
        to="/checks"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Back to checks
      </Link>
      {submission.isLoading && (
        <p role="status" className="text-muted-foreground">
          Loading…
        </p>
      )}
      {submission.isError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {toErrorMessage(submission.error, 'Could not load this check.')}
        </p>
      )}
      {s && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{s.templateName}</h1>
              <p className="text-sm text-muted-foreground">
                {s.homeName} · {checkDateLabel(s.dueDate)}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={download.isPending}
              onClick={() => download.mutate(s.id)}
            >
              <Download />
              Download PDF
            </Button>
          </div>
          {download.isError && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {toErrorMessage(download.error, 'Could not download the PDF.')}
            </p>
          )}

          <Card>
            <CardContent className="grid gap-3 pt-6 text-sm sm:grid-cols-2">
              <Meta label="Signed by" value={s.submittedByName ?? 'Unknown'} />
              <Meta
                label="Completed"
                value={new Date(s.submittedAt).toLocaleString('en-GB', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
                badge={
                  s.late ? (
                    <Badge variant="warning">Late</Badge>
                  ) : (
                    <Badge variant="success">On time</Badge>
                  )
                }
              />
              <Meta
                label="Issues"
                value={s.issueCount === 0 ? 'None' : `${s.issueCount} to report to management`}
                className={s.issueCount > 0 ? 'text-destructive' : undefined}
              />
              <Meta label="Form version" value={`v${s.templateVersion}`} />
            </CardContent>
          </Card>

          {s.definition.sections.map((section) =>
            (s.answers[section.id] ?? []).map((block, i) => {
              const heading = blockLabel(section, block, i);
              return (
                <Card key={`${section.id}-${i}`}>
                  {heading && (
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{heading}</CardTitle>
                    </CardHeader>
                  )}
                  <CardContent className={cn(!heading && 'pt-6')}>
                    <dl className="flex flex-col divide-y divide-border">
                      {section.questions.map((q) => {
                        const answer = block[q.id];
                        const flagged = isFlagged(q, answer);
                        return (
                          <div
                            key={q.id}
                            className={cn(
                              'grid gap-1 py-2.5 sm:grid-cols-[1fr_12rem] sm:gap-4',
                              flagged && 'rounded-md bg-destructive/5 px-2',
                            )}
                          >
                            <dt className="text-sm">{q.text}</dt>
                            <dd className="text-sm">
                              <span className="font-medium">{formatCheckAnswer(q, answer)}</span>
                              {answer?.note && (
                                <span className="mt-0.5 block text-muted-foreground">
                                  {answer.note}
                                </span>
                              )}
                              {flagged && (
                                <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-destructive">
                                  <AlertTriangle className="size-3.5" />
                                  Report to management
                                </span>
                              )}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  </CardContent>
                </Card>
              );
            }),
          )}
        </>
      )}
    </section>
  );
}

function Meta({
  label,
  value,
  badge,
  className,
}: {
  label: string;
  value: string;
  badge?: React.ReactNode;
  className?: string;
}) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className={cn('flex items-center gap-2 font-medium', className)}>
        {value}
        {badge}
      </p>
    </div>
  );
}
