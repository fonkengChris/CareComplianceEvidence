import type { AuditLogView } from '@care/shared';
import { apiFetch } from './api';

/**
 * Typed helper over apiFetch for the audit history API (Phase 9). apiFetch attaches the bearer
 * token and silently refreshes on a 401; errors surface as thrown Errors so React Query can move
 * to its error state. The backend owns every field (who / what / from → to / when) — the page
 * only displays it.
 */

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/** The recent-changes feed. Managers and auditors only (server-enforced). */
export async function fetchAuditLogs(): Promise<AuditLogView[]> {
  return unwrap<AuditLogView[]>(await apiFetch('/api/audit-logs'));
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
