import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { toErrorMessage } from '../lib/errors';
import { createWeekPlan, fetchWeekPlan, updateWeekPlan } from '../lib/week-plans';

/**
 * Create/edit form for a week plan's header (week commencing + notes). Day-entry lines
 * are edited on the planner (detail) page, not here. In create mode the service user
 * comes from the route; in edit mode the existing plan seeds the form. Validation is a
 * small local schema — the server re-validates against the shared Zod schema.
 */

const formSchema = z.object({
  weekCommencing: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a week-commencing date'),
  notes: z.string(),
});
type WeekPlanFormValues = z.infer<typeof formSchema>;

export default function WeekPlanFormPage() {
  const { id, serviceUserId } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<WeekPlanFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { weekCommencing: '', notes: '' },
  });

  const existing = useQuery({
    queryKey: ['week-plans', id],
    queryFn: () => fetchWeekPlan(id!),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existing.data) {
      reset({
        weekCommencing: existing.data.weekCommencing,
        notes: existing.data.notes ?? '',
      });
    }
  }, [existing.data, reset]);

  const mutation = useMutation({
    mutationFn: (values: WeekPlanFormValues) => {
      const notes = values.notes ? values.notes : null;
      if (isEdit) {
        return updateWeekPlan(id!, { weekCommencing: values.weekCommencing, notes });
      }
      return createWeekPlan({
        serviceUserId: serviceUserId!,
        weekCommencing: values.weekCommencing,
        notes,
      });
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['week-plans'] });
      navigate(`/week-plans/${saved.id}`, { replace: true });
    },
  });

  if (isEdit && existing.isLoading) {
    return (
      <p role="status" className="text-muted-foreground">
        Loading…
      </p>
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        {isEdit ? 'Edit week plan' : 'New week plan'}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Week details</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit((values) => mutation.mutate(values))}
            className="flex flex-col gap-4"
            aria-label={isEdit ? 'Edit week plan' : 'New week plan'}
          >
            {mutation.isError && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {toErrorMessage(mutation.error)}
              </p>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="weekCommencing">Week commencing</Label>
              <Input id="weekCommencing" type="date" {...register('weekCommencing')} />
              {errors.weekCommencing && (
                <span role="alert" className="text-sm text-destructive">
                  {errors.weekCommencing.message}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" {...register('notes')} rows={3} />
            </div>

            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={isSubmitting || mutation.isPending}>
                {mutation.isPending ? 'Saving…' : 'Save'}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
