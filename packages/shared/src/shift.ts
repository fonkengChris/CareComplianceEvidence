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

/** The rotating 6-digit on-site code shown on a home's paired check-in display. */
export const checkInCodeSchema = z
  .string()
  .regex(/^\d{6}$/, 'Enter the 6-digit code shown at the home');

/**
 * Body for a staff member starting a shift at one of their homes. The on-site code proves they
 * are physically there (GDPR: a login alone must not open a home's records).
 */
export const shiftStartSchema = z.object({
  homeId: z.string().uuid(),
  code: checkInCodeSchema,
});

/**
 * Body for a manager starting a shift on a staff member's behalf — the fallback when a home has
 * no working check-in display. Audited with the optional reason.
 */
export const shiftStartForSchema = z.object({
  staffId: z.string().uuid(),
  homeId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
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
export type ShiftStartFor = z.infer<typeof shiftStartForSchema>;

/**
 * A paired check-in display at a home (office tablet/PC). Its token can only fetch the home's
 * current check-in code; managers pair, list and revoke them.
 */
export const homeDisplaySchema = z.object({
  id: z.string().uuid(),
  homeId: z.string().uuid(),
  name: z.string(),
  createdAt: z.string(),
  lastSeenAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
});

/** Body for a manager pairing a new display at a home. */
export const homeDisplayCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

/** A newly paired display plus its raw token — returned exactly once, at pairing time. */
export const homeDisplayPairedSchema = z.object({
  display: homeDisplaySchema,
  token: z.string(),
});

/** What a paired display shows: the home and its current code until `expiresAt`. */
export const checkInDisplayCodeSchema = z.object({
  homeId: z.string().uuid(),
  homeName: z.string(),
  code: checkInCodeSchema,
  expiresAt: z.string(),
});

export type HomeDisplay = z.infer<typeof homeDisplaySchema>;
export type HomeDisplayCreate = z.infer<typeof homeDisplayCreateSchema>;
export type HomeDisplayPaired = z.infer<typeof homeDisplayPairedSchema>;
export type CheckInDisplayCode = z.infer<typeof checkInDisplayCodeSchema>;
