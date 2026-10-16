import { accessRequestCreateSchema, accessRequestStatusSchema } from '@care/shared';
import type { Request, Response } from 'express';
import * as auditorAccessService from '../services/auditor-access.service';
import type { AccessAction, TransitionResult } from '../services/auditor-access.service';

/**
 * Auditor-access controllers: HTTP glue only (CLAUDE.md layering). Auditors list what they can
 * request, raise requests and withdraw pending ones; managers list the queue and approve, reject
 * or revoke. Roles are enforced by route middleware.
 */

/** GET /auditor-access/service-users — what the calling auditor can request. */
export async function requestable(req: Request, res: Response): Promise<void> {
  res.json(await auditorAccessService.listRequestable(req.user!.sub));
}

/** GET /auditor-access/me — the calling auditor's own requests. */
export async function mine(req: Request, res: Response): Promise<void> {
  res.json(await auditorAccessService.listForAuditor(req.user!.sub));
}

/** POST /auditor-access — request access to one or more service users. */
export async function create(req: Request, res: Response): Promise<void> {
  const parsed = accessRequestCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid access request' });
    return;
  }
  const created = await auditorAccessService.createRequests(
    req.user!.sub,
    parsed.data.serviceUserIds,
    parsed.data.reason,
  );
  res.status(201).json({ created });
}

/** GET /auditor-access?status= — every request, optionally filtered by status (managers). */
export async function list(req: Request, res: Response): Promise<void> {
  const raw = req.query.status;
  if (raw === undefined) {
    res.json(await auditorAccessService.listForManager());
    return;
  }
  const status = accessRequestStatusSchema.safeParse(raw);
  if (!status.success) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }
  res.json(await auditorAccessService.listForManager(status.data));
}

function sendResult(res: Response, result: TransitionResult): void {
  if (result === 'not_found') {
    res.status(404).json({ error: 'Access request not found' });
    return;
  }
  if (result === 'invalid') {
    res.status(409).json({ error: 'Request cannot be changed from its current status' });
    return;
  }
  res.status(204).end();
}

/** Manager decision handlers: POST /:id/approve | /:id/reject | /:id/revoke. */
function decide(action: AccessAction) {
  return async (req: Request, res: Response): Promise<void> => {
    sendResult(
      res,
      await auditorAccessService.transition(String(req.params.id), action, req.user!.sub),
    );
  };
}

export const approve = decide('APPROVE');
export const reject = decide('REJECT');
export const revoke = decide('REVOKE');

/** DELETE /auditor-access/:id — the auditor withdraws one of their own PENDING requests. */
export async function withdraw(req: Request, res: Response): Promise<void> {
  sendResult(
    res,
    await auditorAccessService.transition(
      String(req.params.id),
      'WITHDRAW',
      req.user!.sub,
      req.user!.sub,
    ),
  );
}
