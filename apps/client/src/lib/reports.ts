import type {
  ComplianceStatus,
  Outcome,
  PeriodReport,
  PeriodSummary,
  ReportData,
  Weekday,
} from '@care/shared';
import { api } from './api';

/**
 * Typed helpers for the PDF reports (Phase 8). `fetchWeekPlanReport` pulls the backend-assembled
 * report DATA for one week plan; `fetchServiceUserPeriodReport`/`fetchPeriodSummary` do the same
 * for a longer range (weeks/months/up to a year). All figures are backend-owned (CLAUDE.md); the
 * PDF itself is rendered client-side from that data by `ReportDocument`. The small display helpers
 * live here (not in the PDF component) so they stay unit-testable without importing the heavy
 * `@react-pdf/renderer` — which the pages load lazily on demand.
 */

export async function fetchWeekPlanReport(weekPlanId: string): Promise<ReportData> {
  const { data } = await api.get<ReportData>(`/api/week-plans/${weekPlanId}/report`);
  return data;
}

export async function fetchServiceUserPeriodReport(
  serviceUserId: string,
  from: string,
  to: string,
): Promise<PeriodReport> {
  const { data } = await api.get<PeriodReport>(
    `/api/service-users/${serviceUserId}/report?from=${from}&to=${to}`,
  );
  return data;
}

export async function fetchPeriodSummary(from: string, to: string): Promise<PeriodSummary> {
  const { data } = await api.get<PeriodSummary>(`/api/summary/period?from=${from}&to=${to}`);
  return data;
}

/** Minutes → a compact hours string, matching the summary/planner views. */
export function reportHours(minutes: number): string {
  return `${(minutes / 60).toFixed(1)}h`;
}

/** Human-readable label for a recorded outcome (the enum stores a machine code). */
export function outcomeLabel(outcome: Outcome): string {
  switch (outcome) {
    case 'COMPLETED':
      return 'Completed';
    case 'PARTIALLY_COMPLETED':
      return 'Partially completed';
    case 'REFUSED':
      return 'Refused';
    case 'MISSED':
      return 'Missed';
    case 'CANCELLED':
      return 'Cancelled';
    case 'OTHER':
      return 'Other';
  }
}

/** Short weekday label (Mon–Sun) for a note row. */
export function weekdayLabel(day: Weekday): string {
  return { MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat', SUN: 'Sun' }[
    day
  ];
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

/** A file-name-safe slug of a service user's name. */
function safeName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]/g, '');
}

/** A stable, human file name for a report download, e.g. `report-Jane-Doe-2026-08-17.pdf`. */
export function reportFileName(data: ReportData): string {
  return `report-${safeName(data.serviceUser.name)}-${data.weekCommencing}.pdf`;
}

/** File name for a period report, e.g. `report-Jane-Doe-2026-08-03-to-2026-08-31.pdf`. */
export function periodReportFileName(report: PeriodReport): string {
  const name = safeName(report.serviceUser.name);
  return report.from === report.to
    ? `report-${name}-${report.from}.pdf`
    : `report-${name}-${report.from}-to-${report.to}.pdf`;
}

/** Human range label, e.g. "3 Aug – 31 Aug 2026", or a single week when from === to. */
export function rangeLabel(from: string, to: string): string {
  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  return from === to ? `Week of ${fmt(from)}` : `${fmt(from)} – ${fmt(to)}`;
}
