import { type Weekday, WEEKDAYS } from '@care/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import WeekComplianceSummary from '../components/WeekComplianceSummary';
import { fetchActivityTypes } from '../lib/activity-types';
import { duplicateWeekPlan, fetchWeekPlan, replaceDayEntries } from '../lib/week-plans';

/**
 * The weekly planner: a manager builds a week's support lines grouped Mon→Sun. Rows can
 * be added/removed freely per day (no fixed count — CLAUDE.md); each has an activity
 * (from the admin-maintained dropdown), a description and allocated minutes. All rows
 * save at once via a single bulk replace. "Duplicate Previous Week" seeds a new week.
 * Non-managers see the plan read-only. `timeSpent`/`outcome` are Phase 5, not shown here.
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

/** One editable planner row. `timeAllocated` is a string for the number input. */
type Row = {
  key: string;
  day: Weekday;
  activityTypeId: string;
  description: string;
  timeAllocated: string;
};

export default function WeekPlanDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isManager = user?.role === 'MANAGER';
  // STAFF and MANAGER can record what happened; AUDITOR is read-only.
  const canRecord = user?.role === 'MANAGER' || user?.role === 'STAFF';

  const plan = useQuery({
    queryKey: ['week-plans', id],
    queryFn: () => fetchWeekPlan(id!),
    enabled: Boolean(id),
  });
  const activities = useQuery({ queryKey: ['activity-types'], queryFn: fetchActivityTypes });

  const [rows, setRows] = useState<Row[]>([]);
  const keySeq = useRef(0);
  const nextKey = () => `row-${(keySeq.current += 1)}`;

  // Seed the editable grid from the fetched plan (server is the source of truth).
  useEffect(() => {
    if (plan.data) {
      setRows(
        plan.data.dayEntries.map((e) => ({
          key: nextKey(),
          day: e.day,
          activityTypeId: e.activityTypeId ?? '',
          description: e.description ?? '',
          timeAllocated: e.timeAllocated == null ? '' : String(e.timeAllocated),
        })),
      );
    }
  }, [plan.data]);

  const save = useMutation({
    mutationFn: () => {
      const entries = WEEKDAYS.flatMap((day) =>
        rows
          .filter((r) => r.day === day)
          .map((r, i) => ({
            day,
            lineNumber: i + 1,
            activityTypeId: r.activityTypeId ? r.activityTypeId : null,
            description: r.description ? r.description : null,
            timeAllocated: r.timeAllocated ? Number(r.timeAllocated) : null,
          })),
      );
      return replaceDayEntries(id!, entries);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['week-plans'] }),
  });

  const [duplicateWeek, setDuplicateWeek] = useState('');
  const duplicate = useMutation({
    mutationFn: () => duplicateWeekPlan(id!, duplicateWeek),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['week-plans'] });
      navigate(`/week-plans/${created.id}`);
    },
  });

  const addRow = (day: Weekday) =>
    setRows((prev) => [...prev, { key: nextKey(), day, activityTypeId: '', description: '', timeAllocated: '' }]);
  const removeRow = (key: string) => setRows((prev) => prev.filter((r) => r.key !== key));
  const updateRow = (key: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

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
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Week of {plan.data.weekCommencing}</h1>
        <div className="flex gap-2">
          {canRecord && (
            <Link
              to={`/week-plans/${plan.data.id}/record`}
              className="rounded bg-green-700 px-3 py-2 font-medium text-white"
            >
              Record time
            </Link>
          )}
          {isManager && (
            <Link
              to={`/week-plans/${plan.data.id}/edit`}
              className="rounded border border-gray-300 px-3 py-2"
            >
              Edit details
            </Link>
          )}
        </div>
      </div>

      <WeekComplianceSummary compliance={plan.data.compliance} />

      {plan.data.notes && <p className="text-gray-700">{plan.data.notes}</p>}

      {(save.isError || duplicate.isError) && (
        <p role="alert" className="text-red-600">
          {((save.error ?? duplicate.error) as Error).message}
        </p>
      )}

      <div className="flex flex-col gap-6">
        {WEEKDAYS.map((day) => {
          const dayRows = rows.filter((r) => r.day === day);
          return (
            <div key={day} className="flex flex-col gap-2">
              <h2 className="text-lg font-medium">{DAY_LABELS[day]}</h2>
              {dayRows.length === 0 && <p className="text-sm text-gray-500">No lines planned.</p>}
              {dayRows.map((row) => (
                <div key={row.key} className="flex flex-wrap items-end gap-2" aria-label={`${DAY_LABELS[day]} line`}>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">Activity</span>
                    <select
                      aria-label={`${DAY_LABELS[day]} activity`}
                      value={row.activityTypeId}
                      disabled={!isManager}
                      onChange={(e) => updateRow(row.key, { activityTypeId: e.target.value })}
                      className="rounded border border-gray-300 p-2"
                    >
                      <option value="">— Select —</option>
                      {activities.data?.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-1 flex-col gap-1">
                    <span className="text-xs text-gray-500">Description</span>
                    <input
                      type="text"
                      value={row.description}
                      disabled={!isManager}
                      onChange={(e) => updateRow(row.key, { description: e.target.value })}
                      className="rounded border border-gray-300 p-2"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">Allocated (min)</span>
                    <input
                      type="number"
                      min="0"
                      value={row.timeAllocated}
                      disabled={!isManager}
                      onChange={(e) => updateRow(row.key, { timeAllocated: e.target.value })}
                      className="w-28 rounded border border-gray-300 p-2"
                    />
                  </label>
                  {isManager && (
                    <button
                      type="button"
                      onClick={() => removeRow(row.key)}
                      className="rounded border border-gray-300 px-3 py-2 text-red-700"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              {isManager && (
                <button
                  type="button"
                  onClick={() => addRow(day)}
                  className="self-start rounded border border-gray-300 px-3 py-1 text-sm"
                >
                  + Add line
                </button>
              )}
            </div>
          );
        })}
      </div>

      {isManager && (
        <div className="flex flex-col gap-3 border-t border-gray-200 pt-4">
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="self-start rounded bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {save.isPending ? 'Saving…' : 'Save plan'}
          </button>

          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Duplicate to week commencing</span>
              <input
                type="date"
                aria-label="Duplicate to week commencing"
                value={duplicateWeek}
                onChange={(e) => setDuplicateWeek(e.target.value)}
                className="rounded border border-gray-300 p-2"
              />
            </label>
            <button
              type="button"
              onClick={() => duplicate.mutate()}
              disabled={!duplicateWeek || duplicate.isPending}
              className="rounded border border-gray-300 px-3 py-2 disabled:opacity-50"
            >
              {duplicate.isPending ? 'Duplicating…' : 'Duplicate Previous Week'}
            </button>
          </div>
        </div>
      )}

      <Link to={`/service-users/${plan.data.serviceUserId}`} className="text-blue-700 underline">
        ← Back to service user
      </Link>
    </section>
  );
}
