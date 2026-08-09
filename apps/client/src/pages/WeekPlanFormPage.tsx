import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
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
      <p role="status" className="text-gray-500">
        Loading…
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{isEdit ? 'Edit week plan' : 'New week plan'}</h1>

      <form
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        className="flex w-full max-w-md flex-col gap-4"
        aria-label={isEdit ? 'Edit week plan' : 'New week plan'}
      >
        {mutation.isError && (
          <p role="alert" className="text-red-600">
            {(mutation.error as Error).message}
          </p>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Week commencing</span>
          <input
            type="date"
            {...register('weekCommencing')}
            className="rounded border border-gray-300 p-2"
          />
          {errors.weekCommencing && (
            <span role="alert" className="text-sm text-red-600">
              {errors.weekCommencing.message}
            </span>
          )}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Notes</span>
          <textarea {...register('notes')} className="rounded border border-gray-300 p-2" rows={3} />
        </label>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isSubmitting || mutation.isPending}
            className="rounded bg-blue-600 p-2 font-medium text-white disabled:opacity-50"
          >
            {mutation.isPending ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded border border-gray-300 px-3 py-2"
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
