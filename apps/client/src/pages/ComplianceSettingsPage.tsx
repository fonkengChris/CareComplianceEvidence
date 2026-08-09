import { type ComplianceSettingsUpdate, complianceSettingsUpdateSchema } from '@care/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { fetchComplianceSettings, updateComplianceSettings } from '../lib/compliance';

/**
 * Manager-only screen to view/edit the 🟢/🟡/🔴 compliance boundaries (Phase 6). These are
 * percentages of contracted hours delivered; the backend calculation reads them at runtime, so
 * changing them here re-colours statuses with no code change. Validation (amberMin ≤ greenMin ≤
 * redOverPct) uses the shared `complianceSettingsUpdateSchema` — the same rule the server enforces.
 */
export default function ComplianceSettingsPage() {
  const queryClient = useQueryClient();

  const settings = useQuery({ queryKey: ['compliance-settings'], queryFn: fetchComplianceSettings });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ComplianceSettingsUpdate>({
    resolver: zodResolver(complianceSettingsUpdateSchema),
  });

  // Seed the form from the server (source of truth) once loaded.
  useEffect(() => {
    if (settings.data) {
      reset({
        greenMin: settings.data.greenMin,
        amberMin: settings.data.amberMin,
        redOverPct: settings.data.redOverPct,
      });
    }
  }, [settings.data, reset]);

  const mutation = useMutation({
    mutationFn: (values: ComplianceSettingsUpdate) => updateComplianceSettings(values),
    onSuccess: () => {
      // Recolour every plan on next read, and refresh the form's baseline.
      queryClient.invalidateQueries({ queryKey: ['compliance-settings'] });
      queryClient.invalidateQueries({ queryKey: ['week-plans'] });
    },
  });

  if (settings.isLoading) {
    return (
      <p role="status" className="text-gray-500">
        Loading…
      </p>
    );
  }
  if (settings.isError) {
    return (
      <p role="alert" className="text-red-600">
        Could not load compliance settings.
      </p>
    );
  }

  const fields: { name: keyof ComplianceSettingsUpdate; label: string; hint: string }[] = [
    { name: 'greenMin', label: 'On Track minimum (green %)', hint: '≥ this % delivered → 🟢 On Track' },
    { name: 'amberMin', label: 'Under Target minimum (amber %)', hint: '≥ this % (below green) → 🟡 Under Target' },
    { name: 'redOverPct', label: 'Over Hours threshold (red %)', hint: '> this % delivered → 🔴 Over Hours' },
  ];

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Compliance thresholds</h1>
      <p className="max-w-md text-sm text-gray-600">
        Percentages of a service user&apos;s weekly contracted hours. Must satisfy amber ≤ green ≤ red.
      </p>

      <form
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        className="flex w-full max-w-md flex-col gap-4"
        aria-label="Compliance thresholds"
      >
        {mutation.isError && (
          <p role="alert" className="text-red-600">
            {(mutation.error as Error).message}
          </p>
        )}
        {mutation.isSuccess && (
          <p role="status" className="text-green-700">
            Thresholds saved.
          </p>
        )}

        {fields.map((f) => (
          <label key={f.name} className="flex flex-col gap-1">
            <span className="text-sm font-medium">{f.label}</span>
            <input
              type="number"
              min="0"
              aria-label={f.label}
              {...register(f.name, { valueAsNumber: true })}
              className="w-32 rounded border border-gray-300 p-2"
            />
            <span className="text-xs text-gray-500">{f.hint}</span>
            {errors[f.name] && (
              <span role="alert" className="text-sm text-red-600">
                {errors[f.name]?.message}
              </span>
            )}
          </label>
        ))}

        <button
          type="submit"
          disabled={isSubmitting || mutation.isPending}
          className="self-start rounded bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {mutation.isPending ? 'Saving…' : 'Save thresholds'}
        </button>
      </form>
    </section>
  );
}
