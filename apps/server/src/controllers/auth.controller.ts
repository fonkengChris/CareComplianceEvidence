import { type AuthResponse, loginRequestSchema } from '@care/shared';
import type { CookieOptions, Request, Response } from 'express';
import { config } from '../config';
import * as authService from '../services/auth.service';

/**
 * Auth controllers: HTTP glue only — validate input, call the service, map results to
 * status codes, and manage the refresh cookie. No business logic or DB access here.
 */

const REFRESH_COOKIE = 'refresh_token';

// httpOnly so JavaScript (and thus XSS) can't read the refresh token; SameSite=Lax
// blocks it on cross-site requests; Secure only in production (dev is plain http).
// Path '/' so the browser sends it through the Vite proxy prefix to /auth/refresh.
function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    path: '/',
    maxAge: config.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
  };
}

function body(session: { accessToken: string; user: AuthResponse['user'] }): AuthResponse {
  return { accessToken: session.accessToken, user: session.user };
}

export async function login(req: Request, res: Response): Promise<void> {
  const parsed = loginRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid login request' });
    return;
  }
  const session = await authService.login(parsed.data.email, parsed.data.password);
  if (!session) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }
  res.cookie(REFRESH_COOKIE, session.refreshToken, refreshCookieOptions());
  res.json(body(session));
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const rawToken = req.cookies?.[REFRESH_COOKIE];
  if (!rawToken) {
    res.status(401).json({ error: 'Missing refresh token' });
    return;
  }
  const session = await authService.refresh(rawToken);
  if (!session) {
    res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
    res.status(401).json({ error: 'Invalid or expired refresh token' });
    return;
  }
  res.cookie(REFRESH_COOKIE, session.refreshToken, refreshCookieOptions());
  res.json(body(session));
}

export async function logout(req: Request, res: Response): Promise<void> {
  const rawToken = req.cookies?.[REFRESH_COOKIE];
  if (rawToken) await authService.logout(rawToken);
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
  res.status(204).end();
}

export async function me(req: Request, res: Response): Promise<void> {
  // requireAuth guarantees req.user is present.
  const user = await authService.getUserById(req.user!.sub);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json(user);
}
