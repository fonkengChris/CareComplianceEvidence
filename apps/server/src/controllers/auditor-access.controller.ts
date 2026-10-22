import { auditorServiceUsersSchema } from '@care/shared';
import type { Request, Response } from 'express';
import * as auditorAccessService from '../services/auditor-access.service';

/**
 * Auditor-access controllers: HTTP glue only (CLAUDE.md layering). A manager reads and replaces
 * the set of service users an auditor may audit. MANAGER-only, enforced by route middleware.
 */

/** GET /auditor-access/auditors/:auditorId — the auditor's assigned service-user ids. */
export async function getServiceUsers(req: Request, res: Response): Promise<void> {
  const serviceUserIds = await auditorAccessService.approvedServiceUserIds(
    String(req.params.auditorId),
  );
  res.json({ serviceUserIds });
}

/** PUT /auditor-access/auditors/:auditorId — replace the auditor's assigned service users. */
export async function setServiceUsers(req: Request, res: Response): Promise<void> {
  const parsed = auditorServiceUsersSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid service-user selection' });
    return;
  }
  const result = await auditorAccessService.setAuditorServiceUsers(
    String(req.params.auditorId),
    parsed.data.serviceUserIds,
    req.user!.sub,
  );
  if (result === 'not_found') {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  if (result === 'not_auditor') {
    res.status(409).json({ error: 'Only auditor accounts can be assigned service users to audit' });
    return;
  }
  res.status(204).end();
}
