import { z } from 'zod';

/**
 * Placeholder shared schema for Phase 0 — proves cross-package imports compile
 * and are used by both the API (response validation) and the web app (typed fetch).
 * Real domain schemas (ServiceUser, WeekPlan, DayEntry, ...) arrive in Phase 1.
 */
export const healthStatusSchema = z.object({
  status: z.literal('ok'),
  db: z.enum(['up', 'down']),
});

export type HealthStatus = z.infer<typeof healthStatusSchema>;
