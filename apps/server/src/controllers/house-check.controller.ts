import {
  checkSubmissionInputSchema,
  checkTemplateActiveSchema,
  checkTemplateInputSchema,
  checkWeekQuerySchema,
  isAssignmentScoped,
} from '@care/shared';
import type { Request, Response } from 'express';
import * as submissionService from '../services/check-submission.service';
import * as templateService from '../services/check-template.service';
import { activeShiftHomeIdsForStaff } from '../services/staff-assignment.service';

/**
 * House-check controllers: HTTP glue only (CLAUDE.md layering). Roles are enforced by route
 * middleware; the per-request rule enforced here is that STAFF/KEY_WORKER act only for the home
 * they are on shift at (the same shift gate as a home's service users).
 */

/** Whether the caller may act for this home: managers always, staff only while on shift there. */
async function canActForHome(req: Request, homeId: string): Promise<boolean> {
  if (!isAssignmentScoped(req.user!.role)) return true;
  return (await activeShiftHomeIdsForStaff(req.user!.sub)).includes(homeId);
}

const NO_SHIFT = { error: 'Start a shift at this home to complete its checks' };

/** GET /templates — managers see every template; staff only the active ones. */
export async function listTemplates(req: Request, res: Response): Promise<void> {
  const activeOnly = req.user!.role !== 'MANAGER';
  res.json(await templateService.listTemplates({ activeOnly }));
}

export async function getTemplate(req: Request, res: Response): Promise<void> {
  const template = await templateService.getTemplate(String(req.params.id));
  if (!template || (!template.active && req.user!.role !== 'MANAGER')) {
    res.status(404).json({ error: 'Check not found' });
    return;
  }
  res.json(template);
}

export async function createTemplate(req: Request, res: Response): Promise<void> {
  const parsed = checkTemplateInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid check' });
    return;
  }
  const result = await templateService.createTemplate(parsed.data, req.user!.sub);
  if (!result.ok) {
    res.status(409).json({ error: 'A check with this name already exists' });
    return;
  }
  res.status(201).json(result.value);
}

export async function updateTemplate(req: Request, res: Response): Promise<void> {
  const parsed = checkTemplateInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid check' });
    return;
  }
  const result = await templateService.updateTemplate(
    String(req.params.id),
    parsed.data,
    req.user!.sub,
  );
  if (!result.ok) {
    if (result.reason === 'not_found') res.status(404).json({ error: 'Check not found' });
    else res.status(409).json({ error: 'A check with this name already exists' });
    return;
  }
  res.json(result.value);
}

export async function setTemplateActive(req: Request, res: Response): Promise<void> {
  const parsed = checkTemplateActiveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }
  const template = await templateService.setTemplateActive(
    String(req.params.id),
    parsed.data.active,
    req.user!.sub,
  );
  if (!template) {
    res.status(404).json({ error: 'Check not found' });
    return;
  }
  res.json(template);
}

/** GET /homes/:homeId/due — the checks that can be completed at the home right now. */
export async function listDue(req: Request, res: Response): Promise<void> {
  const homeId = String(req.params.homeId);
  if (!(await canActForHome(req, homeId))) {
    res.status(403).json(NO_SHIFT);
    return;
  }
  res.json(await submissionService.listDueForHome(homeId));
}

/** GET /overview — every active home's outstanding, missed and flagged checks (MANAGER). */
export async function overview(_req: Request, res: Response): Promise<void> {
  res.json(await submissionService.overview());
}

/** GET /homes/:homeId/week?weekCommencing= — the manager's week grid. */
export async function weekGrid(req: Request, res: Response): Promise<void> {
  const parsed = checkWeekQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid week' });
    return;
  }
  res.json(await submissionService.weekGrid(String(req.params.homeId), parsed.data.weekCommencing));
}

/** POST /submissions — sign and store a completed check. */
export async function submit(req: Request, res: Response): Promise<void> {
  const parsed = checkSubmissionInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid check submission' });
    return;
  }
  if (!(await canActForHome(req, parsed.data.homeId))) {
    res.status(403).json(NO_SHIFT);
    return;
  }
  const result = await submissionService.submitCheck(parsed.data, req.user!.sub);
  if (!result.ok) {
    switch (result.reason) {
      case 'template_not_found':
        res.status(404).json({ error: 'Check not found' });
        return;
      case 'home_not_found':
        res.status(404).json({ error: 'Home not found' });
        return;
      case 'not_open':
        res.status(400).json({ error: 'This check is not open for that date' });
        return;
      case 'already_submitted':
        res.status(409).json({ error: 'This check has already been completed' });
        return;
      case 'invalid':
        res.status(400).json({ error: 'Some answers are missing', problems: result.problems });
        return;
    }
  }
  res.status(201).json(result.value);
}

/**
 * Staff may reopen only their own submissions, and only while on shift at that home; managers
 * any. Anything else is a 404 so ids reveal nothing.
 */
async function canViewSubmission(
  req: Request,
  submission: { homeId: string; submittedById: string | null },
): Promise<boolean> {
  if (req.user!.role === 'MANAGER') return true;
  return (
    submission.submittedById === req.user!.sub && (await canActForHome(req, submission.homeId))
  );
}

export async function getSubmission(req: Request, res: Response): Promise<void> {
  const submission = await submissionService.getSubmission(String(req.params.id));
  if (!submission || !(await canViewSubmission(req, submission))) {
    res.status(404).json({ error: 'Submission not found' });
    return;
  }
  res.json(submission);
}

export async function getSubmissionPdf(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  const submission = await submissionService.getSubmission(id);
  if (!submission || !(await canViewSubmission(req, submission))) {
    res.status(404).json({ error: 'Submission not found' });
    return;
  }
  const file = await submissionService.getSubmissionPdf(id);
  if (!file) {
    res.status(404).json({ error: 'PDF not found' });
    return;
  }
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${file.fileName}"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(file.data);
}
