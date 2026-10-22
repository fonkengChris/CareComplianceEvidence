import { randomInt } from 'node:crypto';

/**
 * Password hashing via Bun's built-in `Bun.password` (argon2id by default). No
 * external dependency — Bun is the runtime everywhere. Plaintext passwords never
 * leave the service layer; only the hash is persisted to `users.password_hash`.
 */

export function hashPassword(plain: string): Promise<string> {
  return Bun.password.hash(plain);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return Bun.password.verify(plain, hash);
}

// Look-alike characters (0/O, 1/l/I) are excluded so the password is easy to copy by hand.
const CHARSETS = [
  'ABCDEFGHJKLMNPQRSTUVWXYZ',
  'abcdefghijkmnopqrstuvwxyz',
  '23456789',
  '!@#$%^&*-_=+?',
];
const PASSWORD_LENGTH = 20;

/**
 * Cryptographically random password of PASSWORD_LENGTH chars, guaranteed to contain at
 * least one upper, lower, digit and symbol. `randomInt` is uniform (no modulo bias).
 * Used by the provisioning scripts (create-admin, seed-staff).
 */
export function generateStrongPassword(): string {
  const all = CHARSETS.join('');
  const chars = CHARSETS.map((set) => set[randomInt(set.length)]);
  while (chars.length < PASSWORD_LENGTH) chars.push(all[randomInt(all.length)]);
  // Fisher–Yates shuffle so the guaranteed characters aren't always at the front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
