import type { Request, Response } from 'express';
import * as userService from '../services/user.service';

/**
 * User controllers: HTTP glue only. User management is a MANAGER concern (enforced by
 * route middleware). Creation is handled by the auth controller's `register`
 * (POST /auth/register); this controller is the read side.
 */

export async function list(_req: Request, res: Response): Promise<void> {
  const rows = await userService.listUsers();
  res.json(rows);
}
