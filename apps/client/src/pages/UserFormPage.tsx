import { ROLES, roleSchema, userCreateSchema } from '@care/shared';
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
import { Select } from '../components/ui/select';
import { toErrorMessage } from '../lib/errors';
import { createUser, fetchUser, updateUser } from '../lib/users';

/**
 * Create/edit form for a user (MANAGER-only). Built on React Hook Form + zodResolver.
 * Create mode reuses the shared `userCreateSchema` (incl. the 8-char password minimum).
 * Edit mode loads the existing account and lets an admin change name/email/role and
 * toggle active; the password field is optional — blank leaves it unchanged — and an
 * `active: false` deactivation revokes the user's sessions server-side.
 */

// Edit-mode schema: password optional (blank = keep current), plus an active toggle.
const editSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: roleSchema,
  password: z.union([z.string().min(8), z.literal('')]),
  active: z.boolean(),
});
type EditValues = z.infer<typeof editSchema>;
type CreateValues = z.infer<typeof userCreateSchema>;
type FormValues = EditValues & { password: string };

export default function UserFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(isEdit ? editSchema : userCreateSchema) as never,
    defaultValues: { name: '', email: '', role: 'STAFF', password: '', active: true },
  });

  // In edit mode, load the account and seed the form (never the password) once it arrives.
  const existing = useQuery({
    queryKey: ['users', id],
    queryFn: () => fetchUser(id!),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existing.data) {
      reset({
        name: existing.data.name,
        email: existing.data.email,
        role: existing.data.role,
        password: '',
        active: existing.data.active,
      });
    }
  }, [existing.data, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      if (isEdit) {
        // Only send the password when the admin typed a new one.
        const payload = {
          name: values.name,
          email: values.email,
          role: values.role,
          active: values.active,
          ...(values.password ? { password: values.password } : {}),
        };
        return updateUser(id!, payload);
      }
      const create: CreateValues = {
        name: values.name,
        email: values.email,
        role: values.role,
        password: values.password,
      };
      return createUser(create);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      navigate('/users', { replace: true });
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
      <h1 className="text-2xl font-semibold tracking-tight">{isEdit ? 'Edit user' : 'Add new user'}</h1>

      <Card>
        <CardHeader>
          <CardTitle>Account details</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit((values) => mutation.mutate(values))}
            className="flex flex-col gap-4"
            aria-label={isEdit ? 'Edit user' : 'Add new user'}
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
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register('email')} />
              {errors.email && (
                <span role="alert" className="text-sm text-destructive">
                  {errors.email.message}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="role">Role</Label>
              <Select id="role" {...register('role')}>
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </Select>
              {errors.role && (
                <span role="alert" className="text-sm text-destructive">
                  {errors.role.message}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder={isEdit ? 'Leave blank to keep current password' : undefined}
                {...register('password')}
              />
              {errors.password && (
                <span role="alert" className="text-sm text-destructive">
                  {errors.password.message}
                </span>
              )}
            </div>

            {isEdit && (
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" className="size-4 rounded border-input" {...register('active')} />
                Active
              </label>
            )}

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
