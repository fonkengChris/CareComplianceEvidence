import type { AccessRequest, AccessRequestStatus, RequestableServiceUser } from '@care/shared';
import { api } from './api';

/**
 * Typed helpers over the shared axios instance for auditor access requests. An auditor names
 * the service users they intend to audit; a manager approves, rejects or later revokes. The
 * auditor's reports are scoped server-side to approved grants — these helpers only drive the
 * request/decision UI.
 */

/** Service users the calling auditor can pick from, with their current open status. */
export async function fetchRequestableServiceUsers(): Promise<RequestableServiceUser[]> {
  const { data } = await api.get<RequestableServiceUser[]>('/api/auditor-access/service-users');
  return data;
}

/** The calling auditor's own requests, newest first. */
export async function fetchMyAccessRequests(): Promise<AccessRequest[]> {
  const { data } = await api.get<AccessRequest[]>('/api/auditor-access/me');
  return data;
}

/** Request access to one or more service users. Returns how many new requests were opened. */
export async function requestAccess(serviceUserIds: string[], reason?: string): Promise<number> {
  const { data } = await api.post<{ created: number }>('/api/auditor-access', {
    serviceUserIds,
    ...(reason ? { reason } : {}),
  });
  return data.created;
}

/** Withdraw one of the caller's pending requests (204). */
export async function withdrawAccessRequest(id: string): Promise<void> {
  await api.delete(`/api/auditor-access/${id}`);
}

/** Every request (manager view), optionally filtered by status. */
export async function fetchAccessRequests(status?: AccessRequestStatus): Promise<AccessRequest[]> {
  const { data } = await api.get<AccessRequest[]>('/api/auditor-access', {
    params: status ? { status } : undefined,
  });
  return data;
}

export type AccessDecision = 'approve' | 'reject' | 'revoke';

/** A manager's decision on a request (204). */
export async function decideAccessRequest(id: string, decision: AccessDecision): Promise<void> {
  await api.post(`/api/auditor-access/${id}/${decision}`);
}

/** Display label for a request status. */
export function accessStatusLabel(status: AccessRequestStatus): string {
  switch (status) {
    case 'PENDING':
      return 'Pending';
    case 'APPROVED':
      return 'Approved';
    case 'REJECTED':
      return 'Rejected';
    case 'REVOKED':
      return 'Revoked';
  }
}

/** Badge variant per status (matches the shadcn Badge variants). */
export function accessStatusVariant(
  status: AccessRequestStatus,
): 'warning' | 'success' | 'destructive' | 'secondary' {
  switch (status) {
    case 'PENDING':
      return 'warning';
    case 'APPROVED':
      return 'success';
    case 'REJECTED':
      return 'destructive';
    case 'REVOKED':
      return 'secondary';
  }
}
