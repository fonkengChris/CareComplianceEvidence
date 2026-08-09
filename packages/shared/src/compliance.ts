import { z } from 'zod';

/**
 * Configurable 🟢/🟡/🔴 boundaries for the compliance calculation (Phase 6). A
 * single settings row exists; thresholds are integer percentages of contracted
 * hours delivered. These values are NEVER hardcoded in calculation code — the
 * service reads them at runtime, and managers can adjust them.
 */
export const complianceSettingsSchema = z.object({
  id: z.string().uuid(),
  greenMin: z.number().int().min(0), // ≥ this % delivered → 🟢 On Track
  amberMin: z.number().int().min(0), // ≥ this % (below green) → 🟡 Under Target
  redOverPct: z.number().int().min(0), // > this % delivered → 🔴 Over Hours
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const complianceSettingsUpdateSchema = z
  .object({
    greenMin: z.number().int().min(0).optional(),
    amberMin: z.number().int().min(0).optional(),
    redOverPct: z.number().int().min(0).optional(),
  })
  // Only a partial patch arrives here, so we can validate ordering only between
  // fields that are BOTH present. Full validation against the merged row (a field
  // being raised above an unchanged neighbour) happens server-side in the service.
  .refine((v) => v.amberMin === undefined || v.greenMin === undefined || v.amberMin <= v.greenMin, {
    message: 'amberMin must be ≤ greenMin',
    path: ['amberMin'],
  })
  .refine(
    (v) => v.greenMin === undefined || v.redOverPct === undefined || v.greenMin <= v.redOverPct,
    { message: 'greenMin must be ≤ redOverPct', path: ['redOverPct'] },
  );

export type ComplianceSettings = z.infer<typeof complianceSettingsSchema>;
export type ComplianceSettingsUpdate = z.infer<typeof complianceSettingsUpdateSchema>;

/**
 * Per-`WeekPlan` compliance status. Four labels over three colours (see below).
 * `ATTENTION` and `OVER_HOURS` are both red; the split lets the UI say WHY. The
 * boundaries live in `ComplianceSettings` — never hardcoded in calculation code.
 */
export const complianceStatusSchema = z.enum([
  'ON_TRACK', // 🟢 delivered within [greenMin, redOverPct]% of contracted
  'UNDER_TARGET', // 🟡 delivered within [amberMin, greenMin)%
  'OVER_HOURS', // 🔴 delivered above redOverPct%
  'ATTENTION', // 🔴 delivered below amberMin% — well under target
]);

export type ComplianceStatus = z.infer<typeof complianceStatusSchema>;

/**
 * Backend-computed compliance for one week plan. Durations are integer MINUTES to
 * match `DayEntry`; `contractedMinutes` is the service user's weekly contracted hours
 * × 60. `remainingMinutes` is signed (negative = over-delivered). The frontend DISPLAYS
 * these, never derives them (CLAUDE.md: calculations are backend-owned).
 */
export const weekComplianceSchema = z.object({
  deliveredMinutes: z.number().int().min(0),
  contractedMinutes: z.number().int().min(0),
  remainingMinutes: z.number().int(),
  deliveryPct: z.number().int().min(0),
  status: complianceStatusSchema,
});

export type WeekCompliance = z.infer<typeof weekComplianceSchema>;
