import { type UserCreate, ROLES, userCreateSchema } from '@care/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { createUser } from '../lib/users';

/**
 * Create form for a new user (MANAGER-only). Built on React Hook Form + zodResolver so
 * the shared `userCreateSchema` is the single validation truth (incl. the 8-char
 * password minimum). The manager assigns the role explicitly; on success we invalidate
 * the list and return to it. The new user is NOT logged in (this is an admin action).
 */
export default function UserFormPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UserCreate>({
    resolver: zodResolver(userCreateSchema),
    defaultValues: { name: '', email: '', role: 'STAFF', password: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: UserCreate) => createUser(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      navigate('/users', { replace: true });
    },
  });

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Add new user</h1>

      <form
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        className="flex w-full max-w-md flex-col gap-4"
        aria-label="Add new user"
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
          <span className="text-sm font-medium">Email</span>
          <input
            type="email"
            {...register('email')}
            className="rounded border border-gray-300 p-2"
          />
          {errors.email && (
            <span role="alert" className="text-sm text-red-600">
              {errors.email.message}
            </span>
          )}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Role</span>
          <select {...register('role')} className="rounded border border-gray-300 p-2">
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          {errors.role && (
            <span role="alert" className="text-sm text-red-600">
              {errors.role.message}
            </span>
          )}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Password</span>
          <input
            type="password"
            {...register('password')}
            className="rounded border border-gray-300 p-2"
          />
          {errors.password && (
            <span role="alert" className="text-sm text-red-600">
              {errors.password.message}
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
