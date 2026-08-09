/**
 * Shared helpers for interpreting DB driver errors.
 *
 * Drizzle (v0.44) wraps driver errors in a `DrizzleQueryError` whose own `.code` is
 * undefined and whose `.cause` is the real postgres.js error (which carries the
 * SQLSTATE on `.code`). So a constraint check must walk the `.cause` chain rather
 * than reading `err.code` at the top level.
 */

/** True if `err` (or any cause in its chain) is a Postgres unique-violation (23505). */
export function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current != null; depth += 1) {
    if (typeof current === 'object' && (current as { code?: string }).code === '23505') return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
