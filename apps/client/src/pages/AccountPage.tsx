import { passwordChangeSchema, profileUpdateSchema, type ProfileUpdate } from '@care/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { PasswordInput } from '../components/ui/password-input';
import { changePassword, updateProfile } from '../lib/account';
import { toErrorMessage } from '../lib/errors';

/**
 * Self-service "My account" page, open to every role. Two independent forms: profile
 * (name + email, via the shared `profileUpdateSchema`) and password change (current +
 * new, re-typed to confirm). Role and active status are shown read-only — only a manager
 * can change those, from the Users page. Both forms target the signed-in user server-side.
 */

// The confirm field is a client-only typo guard; the server only sees current + new.
const passwordFormSchema = passwordChangeSchema
  .extend({ confirmPassword: z.string() })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });
type PasswordFormValues = z.infer<typeof passwordFormSchema>;

export default function AccountPage() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My account</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as {user.role}. Ask a manager if your role needs to change.
        </p>
      </div>
      <ProfileForm />
      <PasswordForm />
    </section>
  );
}

function ProfileForm() {
  const { user, setCurrentUser } = useAuth();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfileUpdate>({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: { name: user!.name, email: user!.email },
  });

  const mutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: (updated) => {
      setCurrentUser(updated);
      reset({ name: updated.name, email: updated.email });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="flex flex-col gap-4"
          aria-label="Profile"
        >
          {mutation.isError && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {toErrorMessage(mutation.error)}
            </p>
          )}
          {mutation.isSuccess && !isDirty && (
            <p role="status" className="text-sm font-medium text-primary">
              Profile updated.
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" type="text" autoComplete="name" {...register('name')} />
            {errors.name && (
              <span role="alert" className="text-sm text-destructive">
                {errors.name.message}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" {...register('email')} />
            {errors.email && (
              <span role="alert" className="text-sm text-destructive">
                {errors.email.message}
              </span>
            )}
          </div>

          <div className="pt-1">
            <Button type="submit" disabled={!isDirty || mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save profile'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordForm() {
  const { setCurrentUser } = useAuth();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: PasswordFormValues) =>
      changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      }),
    onSuccess: (updated) => {
      setCurrentUser(updated);
      reset();
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="flex flex-col gap-4"
          aria-label="Change password"
        >
          {mutation.isError && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {toErrorMessage(mutation.error)}
            </p>
          )}
          {mutation.isSuccess && (
            <p role="status" className="text-sm font-medium text-primary">
              Password changed. Other devices have been signed out.
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="currentPassword">Current password</Label>
            <PasswordInput
              id="currentPassword"
              autoComplete="current-password"
              {...register('currentPassword')}
            />
            {errors.currentPassword && (
              <span role="alert" className="text-sm text-destructive">
                {errors.currentPassword.message}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="newPassword">New password</Label>
            <PasswordInput
              id="newPassword"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              {...register('newPassword')}
            />
            {errors.newPassword && (
              <span role="alert" className="text-sm text-destructive">
                {errors.newPassword.message}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <PasswordInput
              id="confirmPassword"
              autoComplete="new-password"
              {...register('confirmPassword')}
            />
            {errors.confirmPassword && (
              <span role="alert" className="text-sm text-destructive">
                {errors.confirmPassword.message}
              </span>
            )}
          </div>

          <div className="pt-1">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Changing…' : 'Change password'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
