/**
 * Week-grid helpers shared by the manager summary (Phase 7) and the reports/export page
 * (Phase 8). Weeks always commence on a Monday, matching the server default, and are handled
 * in UTC so the Monday grid never drifts across timezones.
 */

/** The Monday of the week containing `now`, as YYYY-MM-DD (mirrors the server default). */
export function currentWeekCommencing(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - sinceMonday);
  return d.toISOString().slice(0, 10);
}

/** Shift a YYYY-MM-DD date by whole days, staying on the Monday grid. */
export function shiftWeek(weekCommencing: string, deltaDays: number): string {
  const d = new Date(`${weekCommencing}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

/** An inclusive reporting range as two YYYY-MM-DD dates; the server snaps each to its Monday. */
export type DateRange = { from: string; to: string };

/** YYYY-MM-DD for a UTC year/month(0-based)/day. */
function isoOf(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

/** The named quick-pick periods offered on the reports page, in display order. */
export const PERIOD_PRESETS = ['week', 'month', 'quarter', 'year'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

/** Short human label for a preset button. */
export function presetLabel(preset: PeriodPreset): string {
  switch (preset) {
    case 'week':
      return 'This week';
    case 'month':
      return 'This month';
    case 'quarter':
      return 'Last 3 months';
    case 'year':
      return 'This year';
  }
}

/**
 * The date range for a named preset, relative to `now` (UTC). "This week" is the current week;
 * "This month"/"This year" span the calendar month/year to date; "Last 3 months" is the trailing
 * ~90 days. All ranges stay within the server's one-year cap.
 */
export function presetRange(preset: PeriodPreset, now: Date = new Date()): DateRange {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const today = isoOf(y, m, d);
  switch (preset) {
    case 'week': {
      const monday = currentWeekCommencing(now);
      return { from: monday, to: monday };
    }
    case 'month':
      return { from: isoOf(y, m, 1), to: today };
    case 'quarter':
      return { from: isoOf(y, m - 2, 1), to: today };
    case 'year':
      return { from: isoOf(y, 0, 1), to: today };
  }
}
