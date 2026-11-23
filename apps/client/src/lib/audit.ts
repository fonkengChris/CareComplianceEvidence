import type { AuditEntityType, AuditLogView } from '@care/shared';
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

/**
 * One record's full history, newest first — for a service user this includes who viewed their
 * records (VIEW rows) and direct assignment changes. Managers only (server-enforced).
 */
export async function fetchEntityAudit(
  entityType: AuditEntityType,
  entityId: string,
): Promise<AuditLogView[]> {
  const query = `entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`;
  const { data } = await api.get<AuditLogView[]>(`/api/audit-logs?${query}`);
  return data;
}

/** What a VIEW row says was opened. */
function viewLabel(kind: string | null): string {
  switch (kind) {
    case 'WEEK_PLAN':
      return 'week plan';
    case 'PHOTO':
      return 'an evidence photo';
    case 'WEEK_REPORT':
      return 'week report';
    case 'PERIOD_REPORT':
      return 'period report';
    default:
      return 'records';
  }
}

/** A readable one-liner for a change: "recorded Time spent", "changed Contracted hours", etc. */
export function describeChange(log: AuditLogView): string {
  switch (log.action) {
    case 'VIEW':
      return `viewed ${viewLabel(log.field)}`;
    case 'ASSIGN':
      return log.fromValue ? 'renewed direct assignment' : 'assigned staff directly';
    case 'UNASSIGN':
      return 'removed direct assignment';
    case 'SHIFT_START':
      return 'started shift';
    case 'SHIFT_END':
      return 'ended shift';
    case 'SHIFT_CODE_FAILED':
      return 'entered a wrong check-in code';
    case 'DISPLAY_PAIR':
      return 'paired check-in screen';
    case 'DISPLAY_REVOKE':
      return 'unpaired check-in screen';
  }
  const verb = log.action === 'CREATE' ? 'added' : log.action === 'RECORD' ? 'recorded' : 'changed';
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
    case 'status':
      return 'Auditor access';
    case 'staffAssignment':
      return 'Direct assignment';
    case 'checkInDisplay':
      return 'Check-in screen';
    default:
      return field;
  }
}
