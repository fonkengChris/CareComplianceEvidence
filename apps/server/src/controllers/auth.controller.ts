import {
  type AuthResponse,
  loginRequestSchema,
  passwordChangeSchema,
  profileUpdateSchema,
  userCreateSchema,
} from '@care/shared';
import type { CookieOptions, Request, Response } from 'express';
import { config } from '../config';
import * as authService from '../services/auth.service';
import * as userService from '../services/user.service';

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

/**
 * POST /auth/register — create a user. MANAGER-only (route middleware); an admin
 * assigns the role explicitly, so this does NOT auto-login the new user. Returns the
 * created public user (never the password hash). A duplicate email is a 409.
 */
export async function register(req: Request, res: Response): Promise<void> {
  const parsed = userCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid user' });
    return;
  }
  const result = await authService.createUser(parsed.data);
  if (!result.ok) {
    res.status(409).json({ error: 'A user with this email already exists' });
    return;
  }
  res.status(201).json(result.value);
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

/**
 * PUT /auth/me — the signed-in user edits their own name/email. The id comes from the
 * token, never the body, and the schema has no role/active so nobody can escalate
 * themselves. A duplicate email is a 409.
 */
export async function updateMe(req: Request, res: Response): Promise<void> {
  const parsed = profileUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid profile' });
    return;
  }
  const result = await userService.updateUser(req.user!.sub, parsed.data);
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
 * PUT /auth/me/password — change your own password. A wrong current password is a 400
 * (not 401, which the client treats as an expired access token and retries). Success
 * rotates the session: other devices are signed out and a fresh cookie + access token
 * are returned for this one.
 */
export async function changeMyPassword(req: Request, res: Response): Promise<void> {
  const parsed = passwordChangeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'New password must be at least 8 characters' });
    return;
  }
  const result = await authService.changePassword(
    req.user!.sub,
    parsed.data.currentPassword,
    parsed.data.newPassword,
  );
  if (!result.ok) {
    if (result.reason === 'wrong-password') {
      res.status(400).json({ error: 'Current password is incorrect' });
      return;
    }
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.cookie(REFRESH_COOKIE, result.value.refreshToken, refreshCookieOptions());
  res.json(body(result.value));
}
