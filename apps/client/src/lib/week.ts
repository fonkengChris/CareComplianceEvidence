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
