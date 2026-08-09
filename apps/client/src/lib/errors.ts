/**
 * Coerce an unknown thrown/rejection value into a displayable message. TanStack Query
 * and fetch rejections are typed as `unknown`, so casting them straight to `Error`
 * risks a crash if the value is a string, null, or some other shape. Prefer this over
 * `(err as Error).message` anywhere a mutation/query error is rendered.
 */
export function toErrorMessage(err: unknown, fallback = 'Something went wrong.'): string {
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === 'string') return err || fallback;
  return fallback;
}
