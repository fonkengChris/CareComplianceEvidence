import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config';

/**
 * On-site check-in codes — proof that a staff member starting a shift is physically at the home.
 * A home's paired display shows a 6-digit code derived from the home's server-only secret and
 * the current time window (TOTP-style, RFC 6238 dynamic truncation). Staff type it, or scan the
 * QR, to start a shift. Pure functions: the secret and clock are passed in, so they unit-test
 * without a DB.
 */

/** Index of the time window containing `now`. */
function windowIndex(now: Date, windowSeconds: number): number {
  return Math.floor(now.getTime() / 1000 / windowSeconds);
}

/** The 6-digit code for one window. */
function codeForWindow(secret: string, index: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(index));
  const mac = createHmac('sha256', secret).update(counter).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const value = mac.readUInt32BE(offset) & 0x7fffffff;
  return String(value % 1_000_000).padStart(6, '0');
}

/** The code currently on display and when it rolls over. */
export function currentCheckInCode(
  secret: string,
  now: Date = new Date(),
  windowSeconds: number = config.checkInCodeWindowSeconds,
): { code: string; expiresAt: Date } {
  const index = windowIndex(now, windowSeconds);
  return {
    code: codeForWindow(secret, index),
    expiresAt: new Date((index + 1) * windowSeconds * 1000),
  };
}

/**
 * Whether `code` is the current or the immediately previous window's code. Accepting the previous
 * one means a code read just before it rolls over still works. Constant-time comparison.
 */
export function verifyCheckInCode(
  secret: string,
  code: string,
  now: Date = new Date(),
  windowSeconds: number = config.checkInCodeWindowSeconds,
): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const index = windowIndex(now, windowSeconds);
  const presented = Buffer.from(code);
  return [index, index - 1].some((i) =>
    timingSafeEqual(Buffer.from(codeForWindow(secret, i)), presented),
  );
}
