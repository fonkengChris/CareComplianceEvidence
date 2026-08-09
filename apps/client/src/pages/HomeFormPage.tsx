import { type HomeCreate, homeCreateSchema } from '@care/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toErrorMessage } from '../lib/errors';
import { createHome, fetchHome, updateHome } from '../lib/homes';

/**
 * Shared create/edit form for a home, built on React Hook Form + zodResolver against the
 * shared `homeCreateSchema`. In edit mode the existing record seeds the form; on success
 * we invalidate the list and navigate to the home detail view.
 */
export default function HomeFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<HomeCreate>({
    resolver: zodResolver(homeCreateSchema),
    defaultValues: { name: '', address: '' },
  });

  const existing = useQuery({
    queryKey: ['homes', id],
    queryFn: () => fetchHome(id!),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existing.data) {
      reset({ name: existing.data.name, address: existing.data.address ?? '' });
    }
  }, [existing.data, reset]);

  const mutation = useMutation({
    mutationFn: (values: HomeCreate) => {
      const payload = { ...values, address: values.address ? values.address : null };
      return isEdit ? updateHome(id!, payload) : createHome(payload);
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['homes'] });
      navigate(`/homes/${saved.id}`, { replace: true });
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
      <h1 className="text-2xl font-semibold tracking-tight">{isEdit ? 'Edit home' : 'New home'}</h1>

      <Card>
        <CardHeader>
          <CardTitle>Home details</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit((values) => mutation.mutate(values))}
            className="flex flex-col gap-4"
            aria-label={isEdit ? 'Edit home' : 'New home'}
          >
            {mutation.isError && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {toErrorMessage(mutation.error)}
              </p>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" type="text" {...register('name')} />
              {errors.name && (
                <span role="alert" className="text-sm text-destructive">
                  {errors.name.message}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="address">Address</Label>
              <Input id="address" type="text" {...register('address')} />
              {errors.address && (
                <span role="alert" className="text-sm text-destructive">
                  {errors.address.message}
                </span>
              )}
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
