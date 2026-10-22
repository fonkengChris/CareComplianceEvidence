import { ROLES, roleSchema, userCreateSchema } from '@care/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import AuditServiceUsersPicker from '../components/AuditServiceUsersPicker';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { PasswordInput } from '../components/ui/password-input';
import { Label } from '../components/ui/label';
import { Select } from '../components/ui/select';
import { fetchAuditorServiceUsers, setAuditorServiceUsers } from '../lib/auditor-access';
import { toErrorMessage } from '../lib/errors';
import { fetchServiceUsers } from '../lib/service-users';
import { createUser, fetchUser, updateUser } from '../lib/users';

/**
 * Create/edit form for a user (MANAGER-only). Built on React Hook Form + zodResolver.
 * Create mode reuses the shared `userCreateSchema` (incl. the 8-char password minimum).
 * Edit mode loads the existing account and lets an admin change name/email/role and
 * toggle active; the password field is optional — blank leaves it unchanged — and an
 * `active: false` deactivation revokes the user's sessions server-side.
 *
 * For an AUDITOR the admin must also pick the service users they will audit (GDPR: an auditor
 * can never browse service users, so access is granted here). The selection is saved to
 * /api/auditor-access after the account itself; switching an auditor to another role clears it.
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
    watch,
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

  const role = watch('role');
  const isAuditor = role === 'AUDITOR';
  const wasAuditor = existing.data?.role === 'AUDITOR';

  // Service users to choose from (manager-only endpoint), loaded only when relevant.
  const serviceUsers = useQuery({
    queryKey: ['service-users', 'all'],
    queryFn: () => fetchServiceUsers('all'),
    enabled: isAuditor,
  });
  // An existing auditor's current assignments seed the picker once.
  const assigned = useQuery({
    queryKey: ['auditor-access', id],
    queryFn: () => fetchAuditorServiceUsers(id!),
    enabled: isEdit && wasAuditor,
  });
  const [auditIds, setAuditIds] = useState<string[]>([]);
  const [auditError, setAuditError] = useState(false);
  useEffect(() => {
    if (assigned.data) setAuditIds(assigned.data);
  }, [assigned.data]);

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
    mutationFn: async (values: FormValues) => {
      const auditing = values.role === 'AUDITOR';
      if (isEdit) {
        // Leaving the auditor role: revoke their grants while they are still an auditor.
        if (wasAuditor && !auditing) await setAuditorServiceUsers(id!, []);
        // Only send the password when the admin typed a new one.
        const payload = {
          name: values.name,
          email: values.email,
          role: values.role,
          active: values.active,
          ...(values.password ? { password: values.password } : {}),
        };
        await updateUser(id!, payload);
        if (auditing) await setAuditorServiceUsers(id!, auditIds);
        return;
      }
      const create: CreateValues = {
        name: values.name,
        email: values.email,
        role: values.role,
        password: values.password,
      };
      const user = await createUser(create);
      if (auditing) {
        try {
          await setAuditorServiceUsers(user.id, auditIds);
        } catch (err) {
          throw new Error(
            `The account was created, but its service users could not be saved (${toErrorMessage(err)}). Edit the user to try again.`,
          );
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['auditor-access'] });
      navigate('/users', { replace: true });
    },
  });

  // An auditor must be assigned at least one service user to audit.
  function onValid(values: FormValues) {
    if (values.role === 'AUDITOR' && auditIds.length === 0) {
      setAuditError(true);
      return;
    }
    setAuditError(false);
    mutation.mutate(values);
  }

  if (isEdit && (existing.isLoading || assigned.isLoading)) {
    return (
      <p role="status" className="text-muted-foreground">
        Loading…
      </p>
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        {isEdit ? 'Edit user' : 'Add new user'}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Account details</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit(onValid)}
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

            {isAuditor && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="audit-service-users">Service users to audit</Label>
                {serviceUsers.isLoading && (
                  <p role="status" className="text-sm text-muted-foreground">
                    Loading service users…
                  </p>
                )}
                {serviceUsers.isError && (
                  <p role="alert" className="text-sm text-destructive">
                    Could not load service users.
                  </p>
                )}
                {serviceUsers.data && (
                  <AuditServiceUsersPicker
                    id="audit-service-users"
                    serviceUsers={serviceUsers.data}
                    selected={auditIds}
                    onChange={(ids) => {
                      setAuditIds(ids);
                      if (ids.length > 0) setAuditError(false);
                    }}
                    invalid={auditError}
                  />
                )}
                <span className="text-xs text-muted-foreground">
                  The auditor will only see reports for these service users.
                </span>
                {auditError && (
                  <span role="alert" className="text-sm text-destructive">
                    Select at least one service user for this auditor.
                  </span>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <PasswordInput
                id="password"
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
                <input
                  type="checkbox"
                  className="size-4 rounded border-input"
                  {...register('active')}
                />
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
