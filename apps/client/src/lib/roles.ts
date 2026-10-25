import type { Role } from '@care/shared';

/** Human-readable role names for display (the enum values are for the API, not people). */
export const ROLE_LABELS: Record<Role, string> = {
  MANAGER: 'Manager',
  AUDITOR: 'Auditor',
  KEY_WORKER: 'Key worker',
  STAFF: 'Staff',
};
