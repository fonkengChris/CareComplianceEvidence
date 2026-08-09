import {
  type ComplianceSettings,
  type ComplianceSettingsUpdate,
  type ComplianceStatus,
  type WeekCompliance,
  complianceSettingsSchema,
} from '@care/shared';
import { db } from '../db';
import { complianceSettings } from '../db/schema';

/**
 * Compliance service — owns the maths (CLAUDE.md: calculations are backend-owned) and
 * the single `ComplianceSettings` row that supplies its thresholds. `computeWeekCompliance`
 * is pure and reads every boundary from `settings`, so no threshold number is ever hardcoded
 * here; managers can retune the 🟢/🟡/🔴 bands at runtime and statuses re-colour on the next read.
 */

type ComplianceSettingsRow = typeof complianceSettings.$inferSelect;

/** Map the settings row to the public shared shape (timestamps → ISO strings). */
export function toPublicComplianceSettings(row: ComplianceSettingsRow): ComplianceSettings {
  return complianceSettingsSchema.parse({
    id: row.id,
    greenMin: row.greenMin,
    amberMin: row.amberMin,
    redOverPct: row.redOverPct,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

/** Threshold bands only — the subset of settings the calculation actually needs. */
type Thresholds = Pick<ComplianceSettings, 'greenMin' | 'amberMin' | 'redOverPct'>;

/**
 * Pure compliance calculation for one week plan. `delivered = Σ timeSpent` (null → 0,
 * regardless of outcome — a missed/refused line naturally records 0). Percentages are of
 * the service user's WEEKLY contracted hours. All boundaries come from `settings`.
 */
export function computeWeekCompliance(
  entries: readonly { timeSpent: number | null }[],
  contractedHours: number,
  settings: Thresholds,
): WeekCompliance {
  const deliveredMinutes = entries.reduce((sum, e) => sum + (e.timeSpent ?? 0), 0);
  const contractedMinutes = Math.round(contractedHours * 60);
  const remainingMinutes = contractedMinutes - deliveredMinutes;
  // No contracted time is a degenerate config — treat as 0% (avoids divide-by-zero).
  const deliveryPct =
    contractedMinutes === 0 ? 0 : Math.round((deliveredMinutes / contractedMinutes) * 100);
  return {
    deliveredMinutes,
    contractedMinutes,
    remainingMinutes,
    deliveryPct,
    status: statusFor(deliveryPct, settings),
  };
}

/** Bucket a delivery percentage into a status using the configured bands. */
function statusFor(pct: number, { greenMin, amberMin, redOverPct }: Thresholds): ComplianceStatus {
  if (pct > redOverPct) return 'OVER_HOURS';
  if (pct >= greenMin) return 'ON_TRACK';
  if (pct >= amberMin) return 'UNDER_TARGET';
  return 'ATTENTION';
}

/** The invariant the bands must satisfy: 🟡 floor ≤ 🟢 floor ≤ 🔴 ceiling. Pure, so testable. */
export function thresholdsInOrder({ greenMin, amberMin, redOverPct }: Thresholds): boolean {
  return amberMin <= greenMin && greenMin <= redOverPct;
}

/**
 * The singleton settings row. Seeded on DB first-run (see db/seed.ts), so it is expected to
 * exist; a missing row means the app is misconfigured, which surfaces as a 500.
 */
export async function getComplianceSettings(): Promise<ComplianceSettings> {
  const [row] = await db.select().from(complianceSettings).limit(1);
  if (!row) throw new Error('Compliance settings row is missing — run db:seed');
  return toPublicComplianceSettings(row);
}

export type UpdateSettingsResult =
  | { ok: true; value: ComplianceSettings }
  | { ok: false; reason: 'invalid' };

/**
 * Patch-merge the provided fields onto the settings row, then validate the MERGED result
 * keeps `amberMin ≤ greenMin ≤ redOverPct` — this catches a single field being raised above
 * an unchanged neighbour, which the partial-body Zod refine cannot see. On violation returns a
 * typed `invalid` result (controller → 400) and writes nothing.
 */
export async function updateComplianceSettings(
  input: ComplianceSettingsUpdate,
): Promise<UpdateSettingsResult> {
  const current = await getComplianceSettings();
  const merged = {
    greenMin: input.greenMin ?? current.greenMin,
    amberMin: input.amberMin ?? current.amberMin,
    redOverPct: input.redOverPct ?? current.redOverPct,
  };
  if (!thresholdsInOrder(merged)) {
    return { ok: false, reason: 'invalid' };
  }
  const [row] = await db
    .update(complianceSettings)
    .set({ ...merged, updatedAt: new Date() })
    .returning();
  return { ok: true, value: toPublicComplianceSettings(row) };
}
