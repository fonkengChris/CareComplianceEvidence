import { z } from 'zod';
import { roleSchema } from './enums';
import { userSchema } from './user';

/**
 * Auth wire shapes shared by client and server. The refresh token is intentionally
 * absent from every shape here: it lives only in a server-set httpOnly cookie and
 * never reaches JavaScript or a serialised body. The access token is short-lived
 * and held in memory on the client.
 */

// Login request body. `password` is only checked for presence here — strength
// rules belong to user creation (`userCreateSchema`), not the login handle.
export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

// Response for /auth/login, /auth/refresh and /auth/me: the short-lived access
// token plus the public user. Refresh token travels in the httpOnly cookie.
export const authResponseSchema = z.object({
  accessToken: z.string(),
  user: userSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

// Decoded access-token claims. The server signs these; middleware verifies and
// parses against this shape so `req.user` has one authoritative type.
export const accessTokenClaimsSchema = z.object({
  sub: z.string().uuid(),
  role: roleSchema,
  email: z.string().email(),
});
export type AccessTokenClaims = z.infer<typeof accessTokenClaimsSchema>;
