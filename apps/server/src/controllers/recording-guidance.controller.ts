import { type RecordingGuidance, recordingGuidanceUpdateSchema } from '@care/shared';
import type { Request, Response } from 'express';
import * as complianceService from '../services/compliance.service';

/**
 * Recording-guidance controllers: HTTP glue only (CLAUDE.md layering). Reads are open to any
 * authenticated user (staff need it while recording); writes are MANAGER-only, enforced by
 * route middleware. The guidance itself lives on the settings singleton (compliance.service).
 */

export async function get(_req: Request, res: Response): Promise<void> {
  const body: RecordingGuidance = { guidance: await complianceService.getRecordingGuidance() };
  res.json(body);
}

export async function update(req: Request, res: Response): Promise<void> {
  const parsed = recordingGuidanceUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Guidance must be text of at most 2000 characters' });
    return;
  }
  const guidance = await complianceService.updateRecordingGuidance(parsed.data.guidance);
  const body: RecordingGuidance = { guidance };
  res.json(body);
}
