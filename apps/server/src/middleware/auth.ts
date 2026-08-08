import type { AccessTokenClaims, Role } from '@care/shared';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { verifyAccessToken } from '../auth/tokens';

/**
 * Auth + role guards. Every protected route composes `requireAuth` (identity) with an
 * optional `requireRole(...)` (authorisation). Roles are enforced HERE on the server —
 * the client hiding a link is never the security boundary (CLAUDE.md).
 */

// Augment Express' Request so downstream handlers see a typed `req.user`.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccessTokenClaims;
    }
  }
}

/** Extract a Bearer token from the Authorization header, or null. */
function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

/** Verify the access token and attach `req.user`; 401 otherwise. */
export const requireAuth: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }
  try {
    req.user = await verifyAccessToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired access token' });
  }
};

/**
 * Restrict a route to the given roles. Assumes `requireAuth` ran first. Use
 * `requireRole('MANAGER')` for manager-only writes; read routes list all three roles.
 */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient role' });
      return;
    }
    next();
  };
}
