import { z } from 'zod';
import { roleSchema } from './enums';

/**
 * Application user. `email` is the unique login handle. SECURITY: `passwordHash`
 * is deliberately absent from every shared shape — it must never reach the client
 * or a serialised API response. Refresh tokens are server-internal and have no
 * shared schema at all.
 */
export const userSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
  role: roleSchema,
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// The API accepts a plaintext password; hashing is owned by Phase 2 (auth).
export const userCreateSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: roleSchema,
  password: z.string().min(8),
});

export type User = z.infer<typeof userSchema>;
export type UserCreate = z.infer<typeof userCreateSchema>;
