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
