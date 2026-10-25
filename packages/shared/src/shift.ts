import { z } from 'zod';

/**
 * A shift session: the time-bound switch that turns home membership into live access.
 * Being assigned to a home only makes a staff member ELIGIBLE to work there; they reach that
 * home's service users only while they have an active session at it (started by themselves,
 * audited, and auto-expiring). Direct per-service-user assignments are unaffected.
 */
export const shiftSessionSchema = z.object({
  id: z.string().uuid(),
  staffId: z.string().uuid(),
  homeId: z.string().uuid(),
  homeName: z.string(),
  staffName: z.string(),
  startedAt: z.string(),
  expiresAt: z.string(),
  endedAt: z.string().nullable(),
});

/** Body for a staff member starting a shift at one of their homes. */
export const shiftStartSchema = z.object({
  homeId: z.string().uuid(),
});

export type ShiftSession = z.infer<typeof shiftSessionSchema>;
export type ShiftStart = z.infer<typeof shiftStartSchema>;
