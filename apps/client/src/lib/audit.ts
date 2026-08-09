import type { AuditLogView } from '@care/shared';
import { api } from './api';

/**
 * Typed helper over the shared axios instance for the audit history API (Phase 9). The instance
 * attaches the bearer token and silently refreshes on a 401; rejections drive React Query's error
 * state. The backend owns every field (who / what / from → to / when) — the page only displays it.
 */

/** The recent-changes feed. Managers and auditors only (server-enforced). */
export async function fetchAuditLogs(): Promise<AuditLogView[]> {
  const { data } = await api.get<AuditLogView[]>('/api/audit-logs');
  return data;
}

/** A readable one-liner for a change: "recorded Time spent", "changed Contracted hours", etc. */
export function describeChange(log: AuditLogView): string {
  const verb =
    log.action === 'CREATE' ? 'added' : log.action === 'RECORD' ? 'recorded' : 'changed';
  const target = log.field ? fieldLabel(log.field) : (log.entityLabel ?? 'record');
  return `${verb} ${target}`;
}

/** Turn a raw column name into a human label; falls back to the raw name for unknown fields. */
export function fieldLabel(field: string): string {
  switch (field) {
    case 'timeSpent':
      return 'Time spent';
    case 'outcome':
      return 'Outcome';
    case 'contractedHours':
      return 'Contracted hours';
    default:
      return field;
  }
}
