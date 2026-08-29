import { polishRecordSchema, type PolishedRecord } from '@care/shared';
import type { Request, Response } from 'express';
import { AiNotConfiguredError, polishActivityComment } from '../services/ai.service';

/**
 * AI controllers: HTTP glue only (CLAUDE.md layering). Validate the request, call the
 * service, and map outcomes to status codes — an unconfigured feature is 503, an upstream
 * model/network failure is 502, so the client can tell "turn it on" from "try again".
 */

export async function polish(req: Request, res: Response): Promise<void> {
  const parsed = polishRecordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'A non-empty comment is required to polish' });
    return;
  }

  try {
    const comment = await polishActivityComment(parsed.data);
    const body: PolishedRecord = { comment };
    res.json(body);
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      res.status(503).json({ error: 'AI polish is not available right now' });
      return;
    }
    console.error('AI polish failed:', err);
    res.status(502).json({ error: 'Could not polish the record — please try again' });
  }
}
