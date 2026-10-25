import { userUpdateSchema } from '@care/shared';
import type { Request, Response } from 'express';
import * as userService from '../services/user.service';

/**
 * User controllers: HTTP glue only. User management is a MANAGER concern (enforced by
 * route middleware). Creation is handled by the auth controller's `register`
 * (POST /auth/register); this controller is the read + edit side.
 */

export async function list(_req: Request, res: Response): Promise<void> {
  const rows = await userService.listUsers();
  res.json(rows);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const found = await userService.getUser(String(req.params.id));
  if (!found) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json(found);
}

/** PUT /users/:id — admin edit. 404 for unknown id, 409 for a duplicate email. */
export async function update(req: Request, res: Response): Promise<void> {
  const parsed = userUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid user' });
    return;
  }
  const result = await userService.updateUser(String(req.params.id), parsed.data, req.user?.sub);
  if (!result.ok) {
    if (result.reason === 'conflict') {
      res.status(409).json({ error: 'A user with this email already exists' });
      return;
    }
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json(result.value);
}

/**
 * DELETE /users/:id — permanently remove an account. A manager can't delete themselves
 * (400), and anyone on the audit trail is kept (409) — deactivate them instead.
 */
export async function remove(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  if (id === req.user!.sub) {
    res.status(400).json({ error: 'You cannot delete your own account' });
    return;
  }
  const result = await userService.deleteUser(id);
  if (result === 'not-found') {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  if (result === 'has-audit-history') {
    res.status(409).json({
      error:
        'This user has recorded changes in the audit trail, so their account must be kept. Deactivate them instead.',
    });
    return;
  }
  res.status(204).end();
}
