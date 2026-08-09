import { type ComplianceSettingsUpdate, complianceSettingsUpdateSchema } from '@care/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { fetchComplianceSettings, updateComplianceSettings } from '../lib/compliance';
import { toErrorMessage } from '../lib/errors';

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
      <p role="status" className="text-muted-foreground">
        Loading…
      </p>
    );
  }
  if (settings.isError) {
    return (
      <p role="alert" className="text-sm font-medium text-destructive">
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
    <section className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Compliance thresholds</h1>
        <p className="text-sm text-muted-foreground">
          Percentages of a service user&apos;s weekly contracted hours. Must satisfy amber ≤ green ≤
          red.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Status bands</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit((values) => mutation.mutate(values))}
            className="flex flex-col gap-5"
            aria-label="Compliance thresholds"
          >
            {mutation.isError && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {toErrorMessage(mutation.error)}
              </p>
            )}
            {mutation.isSuccess && (
              <p role="status" className="text-sm font-medium text-success">
                Thresholds saved.
              </p>
            )}

            {fields.map((f) => (
              <div key={f.name} className="flex flex-col gap-1.5">
                <Label htmlFor={f.name}>{f.label}</Label>
                <Input
                  id={f.name}
                  type="number"
                  min="0"
                  aria-label={f.label}
                  {...register(f.name, { valueAsNumber: true })}
                  className="w-32"
                />
                <span className="text-xs text-muted-foreground">{f.hint}</span>
                {errors[f.name] && (
                  <span role="alert" className="text-sm text-destructive">
                    {errors[f.name]?.message}
                  </span>
                )}
              </div>
            ))}

            <Button
              type="submit"
              disabled={isSubmitting || mutation.isPending}
              className="self-start"
            >
              {mutation.isPending ? 'Saving…' : 'Save thresholds'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
