import type { AuditorServiceUsers } from '@care/shared';
import { api } from './api';

/**
 * Typed helpers over the shared axios instance for auditor access (MANAGER-only). A manager
 * chooses the service users an auditor may audit on the auditor's user form; the auditor's
 * reports are scoped server-side to exactly that set. There is deliberately no auditor-facing
 * helper — auditors never list service users (GDPR).
 */

/** The service-user ids an auditor is assigned to audit. */
export async function fetchAuditorServiceUsers(auditorId: string): Promise<string[]> {
  const { data } = await api.get<AuditorServiceUsers>(`/api/auditor-access/auditors/${auditorId}`);
  return data.serviceUserIds;
}

/** Replace the set of service users an auditor may audit (204). */
export async function setAuditorServiceUsers(
  auditorId: string,
  serviceUserIds: string[],
): Promise<void> {
  await api.put(`/api/auditor-access/auditors/${auditorId}`, { serviceUserIds });
}
