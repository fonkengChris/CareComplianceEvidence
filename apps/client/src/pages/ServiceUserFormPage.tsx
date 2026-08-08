import { type ServiceUserCreate, serviceUserCreateSchema } from '@care/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
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
    defaultValues: { name: '', address: '', contractedHours: 0 },
  });

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
      <p role="status" className="text-gray-500">
        Loading…
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">
        {isEdit ? 'Edit service user' : 'New service user'}
      </h1>

      <form
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        className="flex w-full max-w-md flex-col gap-4"
        aria-label={isEdit ? 'Edit service user' : 'New service user'}
      >
        {mutation.isError && (
          <p role="alert" className="text-red-600">
            {(mutation.error as Error).message}
          </p>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Name</span>
          <input type="text" {...register('name')} className="rounded border border-gray-300 p-2" />
          {errors.name && (
            <span role="alert" className="text-sm text-red-600">
              {errors.name.message}
            </span>
          )}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Address</span>
          <input
            type="text"
            {...register('address')}
            className="rounded border border-gray-300 p-2"
          />
          {errors.address && (
            <span role="alert" className="text-sm text-red-600">
              {errors.address.message}
            </span>
          )}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Contracted hours</span>
          <input
            type="number"
            step="0.01"
            min="0"
            {...register('contractedHours', { valueAsNumber: true })}
            className="rounded border border-gray-300 p-2"
          />
          {errors.contractedHours && (
            <span role="alert" className="text-sm text-red-600">
              {errors.contractedHours.message}
            </span>
          )}
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
