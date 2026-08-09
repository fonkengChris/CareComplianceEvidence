import type { ComplianceStatus, ReportData } from '@care/shared';
import { apiFetch } from './api';

/**
 * Typed helpers for the commissioner PDF report (Phase 8). `fetchWeekPlanReport` pulls the
 * backend-assembled report DATA for one week plan (all figures backend-owned — CLAUDE.md); the
 * PDF itself is rendered client-side from that data by `ReportDocument`. The small display
 * helpers live here (not in the PDF component) so they stay unit-testable without importing the
 * heavy `@react-pdf/renderer` — which the pages load lazily on demand.
 */

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function fetchWeekPlanReport(weekPlanId: string): Promise<ReportData> {
  return unwrap<ReportData>(await apiFetch(`/api/week-plans/${weekPlanId}/report`));
}

/** Minutes → a compact hours string, matching the summary/planner views. */
export function reportHours(minutes: number): string {
  return `${(minutes / 60).toFixed(1)}h`;
}

/** Human-readable label for a compliance status (the enum is a machine value). */
export function statusLabel(status: ComplianceStatus): string {
  switch (status) {
    case 'ON_TRACK':
      return 'On track';
    case 'UNDER_TARGET':
      return 'Under target';
    case 'OVER_HOURS':
      return 'Over hours';
    case 'ATTENTION':
      return 'Attention required';
  }
}

/** A stable, human file name for a report download, e.g. `report-Jane-Doe-2026-08-17.pdf`. */
export function reportFileName(data: ReportData): string {
  const safeName = data.serviceUser.name.trim().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
  return `report-${safeName}-${data.weekCommencing}.pdf`;
}
