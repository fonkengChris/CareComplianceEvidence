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
  const result = await userService.updateUser(String(req.params.id), parsed.data);
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
