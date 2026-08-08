import { z } from 'zod';

/**
 * Enum value tuples — the single source of truth shared by the Drizzle `pgEnum`
 * definitions (server `db/schema.ts`) and the Zod `z.enum` schemas below, so the
 * two can never drift. Values are stable SCREAMING_SNAKE codes; human-readable
 * display labels ("Partially completed") are a client concern, not stored here.
 *
 * `as const` is required so both `z.enum(...)` and `pgEnum(name, ...)` accept the
 * tuples as literal unions. Keep this file dependency-free (no imports from other
 * domain files) to avoid import cycles through the barrel.
 */
export const ROLES = ['STAFF', 'MANAGER', 'AUDITOR'] as const;
export const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
export const OUTCOMES = [
  'COMPLETED',
  'PARTIALLY_COMPLETED',
  'REFUSED',
  'MISSED',
  'CANCELLED',
  'OTHER',
] as const;

export const roleSchema = z.enum(ROLES);
export const weekdaySchema = z.enum(WEEKDAYS);
export const outcomeSchema = z.enum(OUTCOMES);

export type Role = z.infer<typeof roleSchema>;
export type Weekday = z.infer<typeof weekdaySchema>;
export type Outcome = z.infer<typeof outcomeSchema>;
