import { auditEntityTypeSchema } from '@care/shared';
import type { Request, Response } from 'express';
import * as auditService from '../services/audit.service';

/**
 * Audit controller (Phase 9): HTTP glue only (CLAUDE.md layering). Read-only — there is no
 * create/update/delete route by design, so the trail stays append-only. Role (MANAGER/AUDITOR)
 * is enforced by route middleware. With `?entityType=&entityId=` it returns one record's
 * history; otherwise the recent-changes feed.
 */
export async function list(req: Request, res: Response): Promise<void> {
  const { entityType, entityId } = req.query;

  if (entityType !== undefined || entityId !== undefined) {
    const parsedType = auditEntityTypeSchema.safeParse(entityType);
    if (!parsedType.success || typeof entityId !== 'string' || entityId.length === 0) {
      res.status(400).json({ error: 'entityType and entityId are both required and must be valid' });
      return;
    }
    res.json(await auditService.listAuditForEntity(parsedType.data, entityId));
    return;
  }

  res.json(await auditService.listRecentAudit());
}
