import { complianceSettingsUpdateSchema } from '@care/shared';
import type { Request, Response } from 'express';
import * as complianceService from '../services/compliance.service';

/**
 * Compliance-settings controllers: HTTP glue only (CLAUDE.md layering). Reads are open to
 * MANAGER/AUDITOR; writes are MANAGER-only, enforced by route middleware. An `invalid` result
 * (thresholds out of order once merged) becomes 400.
 */

export async function get(_req: Request, res: Response): Promise<void> {
  res.json(await complianceService.getComplianceSettings());
}

export async function update(req: Request, res: Response): Promise<void> {
  const parsed = complianceSettingsUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid compliance settings' });
    return;
  }
  const result = await complianceService.updateComplianceSettings(parsed.data);
  if (!result.ok) {
    res.status(400).json({ error: 'Thresholds must satisfy amberMin ≤ greenMin ≤ redOverPct' });
    return;
  }
  res.json(result.value);
}
