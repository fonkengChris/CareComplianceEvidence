import { type ServiceUserCreate, serviceUserCreateSchema } from '@care/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select } from '../components/ui/select';
import { toErrorMessage } from '../lib/errors';
import { fetchHomes } from '../lib/homes';
import { createServiceUser, fetchServiceUser, updateServiceUser } from '../lib/service-users';

/**
 * Shared create/edit form for a service user, built on React Hook Form + zodResolver
 * so the shared Zod schema is the single source of validation truth. In edit mode the
 * existing record seeds the form; on success we invalidate the list and navigate back.
 */
export default function ServiceUserFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ServiceUserCreate>({
    resolver: zodResolver(serviceUserCreateSchema),
    defaultValues: { name: '', address: '', contractedHours: 0, homeId: null },
  });

  // Active homes to choose from (the "belongs to" picker).
  const homes = useQuery({ queryKey: ['homes', 'active'], queryFn: () => fetchHomes('active') });

  // In edit mode, load the record and seed the form once it arrives.
  const existing = useQuery({
    queryKey: ['service-users', id],
    queryFn: () => fetchServiceUser(id!),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existing.data) {
      reset({
        name: existing.data.name,
        address: existing.data.address ?? '',
        contractedHours: existing.data.contractedHours,
        homeId: existing.data.homeId,
      });
    }
  }, [existing.data, reset]);

  const mutation = useMutation({
    mutationFn: (values: ServiceUserCreate) => {
      // Normalise an empty address to null so the API stores absence, not "".
      const payload = { ...values, address: values.address ? values.address : null };
      return isEdit ? updateServiceUser(id!, payload) : createServiceUser(payload);
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['service-users'] });
      navigate(`/service-users/${saved.id}`, { replace: true });
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
        {isEdit ? 'Edit service user' : 'New service user'}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Service user details</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit((values) => mutation.mutate(values))}
            className="flex flex-col gap-4"
            aria-label={isEdit ? 'Edit service user' : 'New service user'}
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

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contractedHours">Contracted hours</Label>
              <Input
                id="contractedHours"
                type="number"
                step="0.01"
                min="0"
                {...register('contractedHours', { valueAsNumber: true })}
              />
              {errors.contractedHours && (
                <span role="alert" className="text-sm text-destructive">
                  {errors.contractedHours.message}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="homeId">Home</Label>
              <Select
                id="homeId"
                {...register('homeId', { setValueAs: (v) => (v ? v : null) })}
              >
                <option value="">— None —</option>
                {homes.data?.map((home) => (
                  <option key={home.id} value={home.id}>
                    {home.name}
                  </option>
                ))}
              </Select>
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
