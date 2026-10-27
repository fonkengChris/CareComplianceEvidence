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

/**
 * Body for a manager ending a shift they judge unauthorised. Ending it this way also signs the
 * staff member out of the app; the optional reason is kept in the audit trail.
 */
export const shiftTerminateSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

/** Query for the manager's shift monitor: everyone on shift, optionally at one home. */
export const shiftMonitorQuerySchema = z.object({
  homeId: z.string().uuid().optional(),
});

export type ShiftSession = z.infer<typeof shiftSessionSchema>;
export type ShiftTerminate = z.infer<typeof shiftTerminateSchema>;
export type ShiftStart = z.infer<typeof shiftStartSchema>;
