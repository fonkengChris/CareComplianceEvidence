import { homeDisplayCreateSchema } from '@care/shared';
import type { Request, Response } from 'express';
import * as displayService from '../services/home-display.service';

/**
 * Check-in display controllers: HTTP glue only (CLAUDE.md layering). Pair/list/revoke are
 * MANAGER-only (route middleware). `code` is authenticated by the display's own token in the
 * `X-Display-Token` header — never a user session — and can fetch the current code only.
 */

/** POST /homes/:id/displays — pair a display; the raw token is in this response only. */
export async function pair(req: Request, res: Response): Promise<void> {
  const parsed = homeDisplayCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Give the display a name' });
    return;
  }
  const result = await displayService.pairDisplay(
    String(req.params.id),
    parsed.data.name,
    req.user!.sub,
  );
  if (!result) {
    res.status(404).json({ error: 'Home not found' });
    return;
  }
  res.status(201).json(result);
}

/** GET /homes/:id/displays — the home's paired (and revoked) displays. */
export async function list(req: Request, res: Response): Promise<void> {
  res.json(await displayService.listDisplays(String(req.params.id)));
}

/** POST /homes/:id/displays/:displayId/revoke — unpair a display. */
export async function revoke(req: Request, res: Response): Promise<void> {
  const result = await displayService.revokeDisplay(
    String(req.params.id),
    String(req.params.displayId),
    req.user!.sub,
  );
  if (result === 'not-found') {
    res.status(404).json({ error: 'Display not found' });
    return;
  }
  res.status(204).end();
}

/** GET /check-in-display/code — the paired home's current code (display token auth). */
export async function code(req: Request, res: Response): Promise<void> {
  const token = req.get('X-Display-Token')?.trim();
  const found = token ? await displayService.codeForDisplayToken(token) : null;
  if (!found) {
    res.status(401).json({ error: 'This display is not paired — ask a manager to pair it again' });
    return;
  }
  res.set('Cache-Control', 'no-store');
  res.json(found);
}
