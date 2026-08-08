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

export const complianceSettingsUpdateSchema = z.object({
  greenMin: z.number().int().min(0).optional(),
  amberMin: z.number().int().min(0).optional(),
  redOverPct: z.number().int().min(0).optional(),
});

export type ComplianceSettings = z.infer<typeof complianceSettingsSchema>;
export type ComplianceSettingsUpdate = z.infer<typeof complianceSettingsUpdateSchema>;
