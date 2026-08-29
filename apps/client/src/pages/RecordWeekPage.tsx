import { type Outcome, type Weekday, OUTCOMES, WEEKDAYS } from '@care/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import WeekComplianceSummary from '../components/WeekComplianceSummary';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { fetchActivityTypes } from '../lib/activity-types';
import { polishComment } from '../lib/ai';
import { toErrorMessage } from '../lib/errors';
import { addDayEntry, fetchWeekPlan, recordDayEntry } from '../lib/week-plans';

/**
 * Staff recording screen (Phase 5) — mobile-first: one card per planned line, grouped by
 * day, that a staff member fills in during/after a shift. Each card records only what
 * actually happened (time spent, comment, outcome); the planned activity and allocated
 * time are read-only. A prominent "+ Record Activity" adds an unplanned line. `outcome`
 * is the authoritative signal; the review hint is a low-weight nudge for managers, never a
 * status. All calculations are server-owned and out of scope here (Phase 6).
 */

const DAY_LABELS: Record<Weekday, string> = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
  SUN: 'Sunday',
};

const OUTCOME_LABELS: Record<Outcome, string> = {
  COMPLETED: 'Completed',
  PARTIALLY_COMPLETED: 'Partially completed',
  REFUSED: 'Refused',
  MISSED: 'Missed',
  CANCELLED: 'Cancelled',
  OTHER: 'Other',
};

/** Editable recording fields for one line, held as strings for the form inputs. */
type Draft = { timeSpent: string; comment: string; outcome: string };

const emptyDraft: Draft = { timeSpent: '', comment: '', outcome: '' };

/** Normalise a draft's form strings into the recording API shape. */
function toRecordBody(draft: Draft) {
  return {
    timeSpent: draft.timeSpent === '' ? null : Number(draft.timeSpent),
    outcome: draft.outcome === '' ? null : (draft.outcome as Outcome),
    comment: draft.comment === '' ? null : draft.comment,
  };
}

export default function RecordWeekPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();

  const plan = useQuery({
    queryKey: ['week-plans', id],
    queryFn: () => fetchWeekPlan(id!),
    enabled: Boolean(id),
  });
  const activities = useQuery({ queryKey: ['activity-types'], queryFn: fetchActivityTypes });
  const activityName = (activityTypeId: string | null) =>
    activityTypeId ? (activities.data?.find((a) => a.id === activityTypeId)?.name ?? '—') : '—';

  // Per-entry editable drafts, seeded from the server (the source of truth) on load.
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  useEffect(() => {
    if (plan.data) {
      setDrafts(
        Object.fromEntries(
          plan.data.dayEntries.map((e) => [
            e.id,
            {
              timeSpent: e.timeSpent == null ? '' : String(e.timeSpent),
              comment: e.comment ?? '',
              outcome: e.outcome ?? '',
            },
          ]),
        ),
      );
    }
  }, [plan.data]);

  const setDraft = (entryId: string, patch: Partial<Draft>) =>
    setDrafts((prev) => ({ ...prev, [entryId]: { ...(prev[entryId] ?? emptyDraft), ...patch } }));

  // One day is shown at a time, defaulting to today; Previous/Next step through Mon–Sun.
  // JS getDay() is 0=Sun…6=Sat; WEEKDAYS is Mon-first, so shift into that ordering.
  const todayIndex = (new Date().getDay() + 6) % 7;
  const [dayIndex, setDayIndex] = useState(todayIndex);
  const selectedDay = WEEKDAYS[dayIndex];

  const record = useMutation({
    mutationFn: (entryId: string) =>
      recordDayEntry(id!, entryId, toRecordBody(drafts[entryId] ?? emptyDraft)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['week-plans', id] }),
  });

  // AI "polish": rewrite the comment for one line into clearer, professional prose before
  // saving. Server-owned model call; here we just swap the improved text back into the draft.
  // `polishingId` tracks which card is in flight so only that card's button shows a spinner.
  const [polishingId, setPolishingId] = useState<string | null>(null);
  const polish = useMutation({
    mutationFn: (vars: { entryId: string; activity: string }) => {
      const draft = drafts[vars.entryId] ?? emptyDraft;
      return polishComment({
        comment: draft.comment,
        activity: vars.activity || undefined,
        outcome: draft.outcome === '' ? undefined : (draft.outcome as Outcome),
      });
    },
    onSuccess: (comment, vars) => setDraft(vars.entryId, { comment }),
    onSettled: () => setPolishingId(null),
  });

  // Ad-hoc "record an unplanned activity" form.
  const blankNew = { day: 'MON' as Weekday, activityTypeId: '', timeSpent: '', comment: '', outcome: '' };
  const [showAdd, setShowAdd] = useState(false);
  const [newEntry, setNewEntry] = useState(blankNew);
  const formRef = useRef<HTMLFormElement>(null);

  const add = useMutation({
    mutationFn: () =>
      addDayEntry(id!, {
        day: newEntry.day,
        activityTypeId: newEntry.activityTypeId,
        timeSpent: newEntry.timeSpent === '' ? null : Number(newEntry.timeSpent),
        outcome: newEntry.outcome === '' ? null : (newEntry.outcome as Outcome),
        comment: newEntry.comment === '' ? null : newEntry.comment,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['week-plans', id] });
      setNewEntry(blankNew);
      setShowAdd(false);
    },
  });

  if (plan.isLoading) {
    return (
      <p role="status" className="text-muted-foreground">
        Loading…
      </p>
    );
  }
  if (plan.isError || !plan.data) {
    return (
      <p role="alert" className="text-sm font-medium text-destructive">
        Could not load this week plan.
      </p>
    );
  }

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Record — week of {plan.data.weekCommencing}
      </h1>

      <WeekComplianceSummary compliance={plan.data.compliance} />

      {record.isError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {toErrorMessage(record.error)}
        </p>
      )}

      {polish.isError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {toErrorMessage(polish.error)}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setDayIndex((i) => Math.max(0, i - 1))}
            disabled={dayIndex === 0}
            aria-label="Previous day"
          >
            <ChevronLeft className="size-4" />
            <span className="hidden sm:inline">Previous</span>
          </Button>
          <h2 className="text-base font-semibold tracking-tight">{DAY_LABELS[selectedDay]}</h2>
          <Button
            type="button"
            variant="outline"
            onClick={() => setDayIndex((i) => Math.min(WEEKDAYS.length - 1, i + 1))}
            disabled={dayIndex === WEEKDAYS.length - 1}
            aria-label="Next day"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="size-4" />
          </Button>
        </div>

        {(() => {
          const dayEntries = plan.data.dayEntries.filter((e) => e.day === selectedDay);
          if (dayEntries.length === 0) {
            return (
              <p className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
                No planned activities for {DAY_LABELS[selectedDay]}. Use “+ Record Activity” below to
                add one.
              </p>
            );
          }
          return (
            <div className="flex flex-col gap-3">
              {dayEntries.map((entry) => {
                const draft = drafts[entry.id] ?? emptyDraft;
                return (
                  <Card
                    key={entry.id}
                    aria-label={`${DAY_LABELS[selectedDay]} ${activityName(entry.activityTypeId)}`}
                  >
                    <CardContent className="flex flex-col gap-3 py-4">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium">{activityName(entry.activityTypeId)}</span>
                        <span className="text-sm text-muted-foreground">
                          Allocated:{' '}
                          {entry.timeAllocated == null ? '—' : `${entry.timeAllocated} min`}
                        </span>
                      </div>
                      {entry.description && (
                        <p className="text-sm text-muted-foreground">{entry.description}</p>
                      )}

                      <div className="flex flex-col gap-1.5">
                        <Label>Time spent (min)</Label>
                        <Input
                          type="number"
                          min="0"
                          inputMode="numeric"
                          aria-label={`Time spent for ${activityName(entry.activityTypeId)}`}
                          value={draft.timeSpent}
                          onChange={(e) => setDraft(entry.id, { timeSpent: e.target.value })}
                          className="h-11 text-base"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <Label>Outcome</Label>
                        <Select
                          aria-label={`Outcome for ${activityName(entry.activityTypeId)}`}
                          value={draft.outcome}
                          onChange={(e) => setDraft(entry.id, { outcome: e.target.value })}
                          className="h-11 text-base"
                        >
                          <option value="">— Not recorded —</option>
                          {OUTCOMES.map((o) => (
                            <option key={o} value={o}>
                              {OUTCOME_LABELS[o]}
                            </option>
                          ))}
                        </Select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <Label>Comment</Label>
                        <Textarea
                          rows={2}
                          aria-label={`Comment for ${activityName(entry.activityTypeId)}`}
                          value={draft.comment}
                          onChange={(e) => setDraft(entry.id, { comment: e.target.value })}
                          className="text-base"
                        />
                      </div>

                      {entry.reviewHint && (
                        <p className="text-xs font-medium text-warning" aria-label="Review hint">
                          ⚑ Flagged for manager review
                        </p>
                      )}

                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setPolishingId(entry.id);
                            polish.mutate({ entryId: entry.id, activity: activityName(entry.activityTypeId) });
                          }}
                          disabled={
                            draft.comment.trim() === '' ||
                            (polish.isPending && polishingId === entry.id)
                          }
                          aria-label={`Polish comment for ${activityName(entry.activityTypeId)}`}
                        >
                          <Sparkles className="size-4" />
                          {polish.isPending && polishingId === entry.id ? 'Polishing…' : 'Polish'}
                        </Button>
                        <Button
                          type="button"
                          onClick={() => record.mutate(entry.id)}
                          disabled={record.isPending}
                        >
                          {record.isPending ? 'Saving…' : 'Save'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          );
        })()}
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        {!showAdd && (
          <Button
            type="button"
            onClick={() => {
              setNewEntry((p) => ({ ...p, day: selectedDay }));
              setShowAdd(true);
            }}
            className="self-start"
          >
            + Record Activity
          </Button>
        )}

        {showAdd && (
          <Card>
            <CardContent className="py-4">
              <form
                ref={formRef}
                aria-label="Record an unplanned activity"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newEntry.activityTypeId) add.mutate();
                }}
                className="flex flex-col gap-3"
              >
                <h2 className="font-semibold">Unplanned activity</h2>
                {add.isError && (
                  <p role="alert" className="text-sm font-medium text-destructive">
                    {toErrorMessage(add.error)}
                  </p>
                )}

                <div className="flex flex-col gap-1.5">
                  <Label>Day</Label>
                  <Select
                    aria-label="Day"
                    value={newEntry.day}
                    onChange={(e) => setNewEntry((p) => ({ ...p, day: e.target.value as Weekday }))}
                    className="h-11 text-base"
                  >
                    {WEEKDAYS.map((d) => (
                      <option key={d} value={d}>
                        {DAY_LABELS[d]}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>Activity</Label>
                  <Select
                    aria-label="Activity"
                    required
                    value={newEntry.activityTypeId}
                    onChange={(e) => setNewEntry((p) => ({ ...p, activityTypeId: e.target.value }))}
                    className="h-11 text-base"
                  >
                    <option value="">— Select —</option>
                    {activities.data?.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>Time spent (min)</Label>
                  <Input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    aria-label="New activity time spent"
                    value={newEntry.timeSpent}
                    onChange={(e) => setNewEntry((p) => ({ ...p, timeSpent: e.target.value }))}
                    className="h-11 text-base"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>Outcome</Label>
                  <Select
                    aria-label="New activity outcome"
                    value={newEntry.outcome}
                    onChange={(e) => setNewEntry((p) => ({ ...p, outcome: e.target.value }))}
                    className="h-11 text-base"
                  >
                    <option value="">— Not recorded —</option>
                    {OUTCOMES.map((o) => (
                      <option key={o} value={o}>
                        {OUTCOME_LABELS[o]}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>Comment</Label>
                  <Textarea
                    rows={2}
                    aria-label="New activity comment"
                    value={newEntry.comment}
                    onChange={(e) => setNewEntry((p) => ({ ...p, comment: e.target.value }))}
                    className="text-base"
                  />
                </div>

                <div className="flex gap-2">
                  <Button type="submit" disabled={add.isPending}>
                    {add.isPending ? 'Adding…' : 'Add activity'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowAdd(false);
                      setNewEntry(blankNew);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>

      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to dashboard
      </Link>
    </section>
  );
}
