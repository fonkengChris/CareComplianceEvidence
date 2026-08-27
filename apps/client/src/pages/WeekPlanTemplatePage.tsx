import { type Weekday, WEEKDAYS } from '@care/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select } from '../components/ui/select';
import { fetchActivityTypes } from '../lib/activity-types';
import { toErrorMessage } from '../lib/errors';
import { fetchTemplate, replaceTemplateEntries } from '../lib/week-plan-templates';

/**
 * The template planner: a manager builds a service user's reusable week of support lines
 * grouped Mon→Sun. Same grid as the weekly planner, minus compliance/recording/export —
 * a template is planning-only. New weeks are generated from this on the service-user page.
 * MANAGER-only (route-guarded); the whole set saves at once via a single bulk replace.
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

/** One editable template row. `timeAllocated` is a string for the number input. */
type Row = {
  key: string;
  day: Weekday;
  activityTypeId: string;
  description: string;
  timeAllocated: string;
};

export default function WeekPlanTemplatePage() {
  const { serviceUserId } = useParams();
  const queryClient = useQueryClient();

  const template = useQuery({
    queryKey: ['week-plan-templates', serviceUserId],
    queryFn: () => fetchTemplate(serviceUserId!),
    enabled: Boolean(serviceUserId),
  });
  const activities = useQuery({ queryKey: ['activity-types'], queryFn: fetchActivityTypes });

  const [rows, setRows] = useState<Row[]>([]);
  const keySeq = useRef(0);
  const nextKey = () => `row-${(keySeq.current += 1)}`;

  // Seed the editable grid from the fetched template (server is the source of truth).
  useEffect(() => {
    if (template.data) {
      setRows(
        template.data.dayEntries.map((e) => ({
          key: nextKey(),
          day: e.day,
          activityTypeId: e.activityTypeId ?? '',
          description: e.description ?? '',
          timeAllocated: e.timeAllocated == null ? '' : String(e.timeAllocated),
        })),
      );
    }
  }, [template.data]);

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
      return replaceTemplateEntries(serviceUserId!, entries);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['week-plan-templates', serviceUserId] }),
  });

  const addRow = (day: Weekday) =>
    setRows((prev) => [
      ...prev,
      { key: nextKey(), day, activityTypeId: '', description: '', timeAllocated: '' },
    ]);
  const removeRow = (key: string) => setRows((prev) => prev.filter((r) => r.key !== key));
  const updateRow = (key: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  if (template.isLoading) {
    return (
      <p role="status" className="text-muted-foreground">
        Loading…
      </p>
    );
  }
  if (template.isError || !template.data) {
    return (
      <p role="alert" className="text-sm font-medium text-destructive">
        Could not load this template.
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Weekly template</h1>
        <p className="text-sm text-muted-foreground">
          Maintain the standard week once — generate each real week from it on the service user
          page, then adjust as needed.
        </p>
      </div>

      {save.isError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {toErrorMessage(save.error)}
        </p>
      )}
      {save.isSuccess && (
        <p role="status" className="text-sm font-medium text-primary">
          Template saved.
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
                  <p className="text-sm text-muted-foreground">No lines in the template.</p>
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
                        onChange={(e) => updateRow(row.key, { description: e.target.value })}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs text-muted-foreground">Allocated (min)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={row.timeAllocated}
                        onChange={(e) => updateRow(row.key, { timeAllocated: e.target.value })}
                        className="w-28"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => removeRow(row.key)}
                      className="text-destructive hover:text-destructive"
                    >
                      Remove
                    </Button>
                  </div>
                ))}
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
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Button
        type="button"
        onClick={() => save.mutate()}
        disabled={save.isPending}
        className="self-start"
      >
        {save.isPending ? 'Saving…' : 'Save template'}
      </Button>

      <Link
        to={`/service-users/${serviceUserId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to service user
      </Link>
    </section>
  );
}
