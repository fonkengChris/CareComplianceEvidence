import { type Outcome, type Weekday, OUTCOMES, WEEKDAYS } from '@care/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import WeekComplianceSummary from '../components/WeekComplianceSummary';
import { fetchActivityTypes } from '../lib/activity-types';
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

  const record = useMutation({
    mutationFn: (entryId: string) =>
      recordDayEntry(id!, entryId, toRecordBody(drafts[entryId] ?? emptyDraft)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['week-plans', id] }),
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
      <p role="status" className="text-gray-500">
        Loading…
      </p>
    );
  }
  if (plan.isError || !plan.data) {
    return (
      <p role="alert" className="text-red-600">
        Could not load this week plan.
      </p>
    );
  }

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Record — week of {plan.data.weekCommencing}</h1>

      <WeekComplianceSummary compliance={plan.data.compliance} />

      {record.isError && (
        <p role="alert" className="text-red-600">
          {(record.error as Error).message}
        </p>
      )}

      <div className="flex flex-col gap-6">
        {WEEKDAYS.map((day) => {
          const dayEntries = plan.data.dayEntries.filter((e) => e.day === day);
          if (dayEntries.length === 0) return null;
          return (
            <div key={day} className="flex flex-col gap-3">
              <h2 className="text-lg font-medium">{DAY_LABELS[day]}</h2>
              {dayEntries.map((entry) => {
                const draft = drafts[entry.id] ?? emptyDraft;
                return (
                  <article
                    key={entry.id}
                    aria-label={`${DAY_LABELS[day]} ${activityName(entry.activityTypeId)}`}
                    className="flex flex-col gap-3 rounded-lg border border-gray-200 p-4 shadow-sm"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{activityName(entry.activityTypeId)}</span>
                      <span className="text-sm text-gray-500">
                        Allocated: {entry.timeAllocated == null ? '—' : `${entry.timeAllocated} min`}
                      </span>
                    </div>
                    {entry.description && (
                      <p className="text-sm text-gray-600">{entry.description}</p>
                    )}

                    <label className="flex flex-col gap-1">
                      <span className="text-sm font-medium">Time spent (min)</span>
                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        aria-label={`Time spent for ${activityName(entry.activityTypeId)}`}
                        value={draft.timeSpent}
                        onChange={(e) => setDraft(entry.id, { timeSpent: e.target.value })}
                        className="rounded border border-gray-300 p-3 text-base"
                      />
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="text-sm font-medium">Outcome</span>
                      <select
                        aria-label={`Outcome for ${activityName(entry.activityTypeId)}`}
                        value={draft.outcome}
                        onChange={(e) => setDraft(entry.id, { outcome: e.target.value })}
                        className="rounded border border-gray-300 p-3 text-base"
                      >
                        <option value="">— Not recorded —</option>
                        {OUTCOMES.map((o) => (
                          <option key={o} value={o}>
                            {OUTCOME_LABELS[o]}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="text-sm font-medium">Comment</span>
                      <textarea
                        rows={2}
                        aria-label={`Comment for ${activityName(entry.activityTypeId)}`}
                        value={draft.comment}
                        onChange={(e) => setDraft(entry.id, { comment: e.target.value })}
                        className="rounded border border-gray-300 p-3 text-base"
                      />
                    </label>

                    {entry.reviewHint && (
                      <p className="text-xs text-amber-600" aria-label="Review hint">
                        ⚑ Flagged for manager review
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={() => record.mutate(entry.id)}
                      disabled={record.isPending}
                      className="self-end rounded bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50"
                    >
                      {record.isPending ? 'Saving…' : 'Save'}
                    </button>
                  </article>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 border-t border-gray-200 pt-4">
        {!showAdd && (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="self-start rounded bg-green-700 px-4 py-3 font-medium text-white"
          >
            + Record Activity
          </button>
        )}

        {showAdd && (
          <form
            ref={formRef}
            aria-label="Record an unplanned activity"
            onSubmit={(e) => {
              e.preventDefault();
              if (newEntry.activityTypeId) add.mutate();
            }}
            className="flex flex-col gap-3 rounded-lg border border-gray-200 p-4"
          >
            <h2 className="text-lg font-medium">Unplanned activity</h2>
            {add.isError && (
              <p role="alert" className="text-red-600">
                {(add.error as Error).message}
              </p>
            )}

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Day</span>
              <select
                aria-label="Day"
                value={newEntry.day}
                onChange={(e) => setNewEntry((p) => ({ ...p, day: e.target.value as Weekday }))}
                className="rounded border border-gray-300 p-3 text-base"
              >
                {WEEKDAYS.map((d) => (
                  <option key={d} value={d}>
                    {DAY_LABELS[d]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Activity</span>
              <select
                aria-label="Activity"
                required
                value={newEntry.activityTypeId}
                onChange={(e) => setNewEntry((p) => ({ ...p, activityTypeId: e.target.value }))}
                className="rounded border border-gray-300 p-3 text-base"
              >
                <option value="">— Select —</option>
                {activities.data?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Time spent (min)</span>
              <input
                type="number"
                min="0"
                inputMode="numeric"
                aria-label="New activity time spent"
                value={newEntry.timeSpent}
                onChange={(e) => setNewEntry((p) => ({ ...p, timeSpent: e.target.value }))}
                className="rounded border border-gray-300 p-3 text-base"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Outcome</span>
              <select
                aria-label="New activity outcome"
                value={newEntry.outcome}
                onChange={(e) => setNewEntry((p) => ({ ...p, outcome: e.target.value }))}
                className="rounded border border-gray-300 p-3 text-base"
              >
                <option value="">— Not recorded —</option>
                {OUTCOMES.map((o) => (
                  <option key={o} value={o}>
                    {OUTCOME_LABELS[o]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Comment</span>
              <textarea
                rows={2}
                aria-label="New activity comment"
                value={newEntry.comment}
                onChange={(e) => setNewEntry((p) => ({ ...p, comment: e.target.value }))}
                className="rounded border border-gray-300 p-3 text-base"
              />
            </label>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={add.isPending}
                className="rounded bg-green-700 px-4 py-2 font-medium text-white disabled:opacity-50"
              >
                {add.isPending ? 'Adding…' : 'Add activity'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAdd(false);
                  setNewEntry(blankNew);
                }}
                className="rounded border border-gray-300 px-4 py-2"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      <Link to="/" className="text-blue-700 underline">
        ← Back to dashboard
      </Link>
    </section>
  );
}
