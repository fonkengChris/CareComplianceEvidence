import { type Weekday, WEEKDAYS } from '@care/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import ExportReportButton from '../components/ExportReportButton';
import WeekComplianceSummary from '../components/WeekComplianceSummary';
import { Button, buttonVariants } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select } from '../components/ui/select';
import { cn } from '@/lib/utils';
import { fetchActivityTypes } from '../lib/activity-types';
import { toErrorMessage } from '../lib/errors';
import { saveWeekAsTemplate } from '../lib/week-plan-templates';
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
  // Reporting mirrors the weekly summary: managers and auditors, never staff.
  const canExport = user?.role === 'MANAGER' || user?.role === 'AUDITOR';

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

  // Snapshot this week's planned lines into the service user's reusable template.
  const saveTemplate = useMutation({
    mutationFn: () => saveWeekAsTemplate(id!),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['week-plan-templates', plan.data?.serviceUserId],
      }),
  });

  const addRow = (day: Weekday) =>
    setRows((prev) => [
      ...prev,
      { key: nextKey(), day, activityTypeId: '', description: '', timeAllocated: '' },
    ]);
  const removeRow = (key: string) => setRows((prev) => prev.filter((r) => r.key !== key));
  const updateRow = (key: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

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
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          Week of {plan.data.weekCommencing}
        </h1>
        <div className="flex flex-wrap gap-2">
          {canRecord && (
            <Link to={`/week-plans/${plan.data.id}/record`} className={buttonVariants()}>
              Record time
            </Link>
          )}
          {isManager && (
            <Link
              to={`/week-plans/${plan.data.id}/edit`}
              className={buttonVariants({ variant: 'outline' })}
            >
              Edit details
            </Link>
          )}
          {canExport && (
            <ExportReportButton
              weekPlanId={plan.data.id}
              className={cn(buttonVariants({ variant: 'outline' }))}
            />
          )}
        </div>
      </div>

      <WeekComplianceSummary compliance={plan.data.compliance} />

      {plan.data.notes && (
        <p className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          {plan.data.notes}
        </p>
      )}

      {(save.isError || duplicate.isError || saveTemplate.isError) && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {toErrorMessage(save.error ?? duplicate.error ?? saveTemplate.error)}
        </p>
      )}
      {saveTemplate.isSuccess && (
        <p role="status" className="text-sm font-medium text-primary">
          Saved this week as the template.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {WEEKDAYS.map((day) => {
          const dayRows = rows.filter((r) => r.day === day);
          return (
            <Card key={day}>
              <CardHeader className="py-4">
                <CardTitle className="text-base">{DAY_LABELS[day]}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {dayRows.length === 0 && (
                  <p className="text-sm text-muted-foreground">No lines planned.</p>
                )}
                {dayRows.map((row) => (
                  <div
                    key={row.key}
                    className="flex flex-wrap items-end gap-2"
                    aria-label={`${DAY_LABELS[day]} line`}
                  >
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs text-muted-foreground">Activity</Label>
                      <Select
                        aria-label={`${DAY_LABELS[day]} activity`}
                        value={row.activityTypeId}
                        disabled={!isManager}
                        onChange={(e) => updateRow(row.key, { activityTypeId: e.target.value })}
                        className="min-w-44"
                      >
                        <option value="">— Select —</option>
                        {activities.data?.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="flex flex-1 flex-col gap-1.5">
                      <Label className="text-xs text-muted-foreground">Description</Label>
                      <Input
                        type="text"
                        value={row.description}
                        disabled={!isManager}
                        onChange={(e) => updateRow(row.key, { description: e.target.value })}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs text-muted-foreground">Allocated (min)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={row.timeAllocated}
                        disabled={!isManager}
                        onChange={(e) => updateRow(row.key, { timeAllocated: e.target.value })}
                        className="w-28"
                      />
                    </div>
                    {isManager && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => removeRow(row.key)}
                        className="text-destructive hover:text-destructive"
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                ))}
                {isManager && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addRow(day)}
                    className="self-start"
                  >
                    <Plus className="size-4" />
                    Add line
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {isManager && (
        <Card>
          <CardContent className="flex flex-col gap-4 py-6">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => save.mutate()}
                disabled={save.isPending}
                className="self-start"
              >
                {save.isPending ? 'Saving…' : 'Save plan'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => saveTemplate.mutate()}
                disabled={saveTemplate.isPending}
                className="self-start"
              >
                {saveTemplate.isPending ? 'Saving…' : 'Save as template'}
              </Button>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="duplicate-week">Duplicate to week commencing</Label>
                <Input
                  id="duplicate-week"
                  type="date"
                  aria-label="Duplicate to week commencing"
                  value={duplicateWeek}
                  onChange={(e) => setDuplicateWeek(e.target.value)}
                  className="w-44"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => duplicate.mutate()}
                disabled={!duplicateWeek || duplicate.isPending}
              >
                {duplicate.isPending ? 'Duplicating…' : 'Duplicate Previous Week'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Link
        to={`/service-users/${plan.data.serviceUserId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to service user
      </Link>
    </section>
  );
}
