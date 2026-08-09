/**
 * Keyword scan of a staff comment (Phase 5). This is a REVIEW PROMPT ONLY: it
 * nudges a manager to check an entry, and never sets, overrides, or is displayed
 * as the outcome/status. `outcome` is the single authoritative signal for whether
 * support happened (CLAUDE.md). Kept here in `@care/shared` so the server (which
 * computes the hint on read) and its tests share one definition.
 */

/** Phrases that suggest support may not have gone ahead — worth a manager's look. */
export const REVIEW_KEYWORDS = ['missed', 'refused', 'declined', 'did not'] as const;

/**
 * True when the comment contains any review keyword (case-insensitive substring
 * match). Null/blank comments never flag.
 */
export function detectReviewHint(comment: string | null | undefined): boolean {
  if (!comment) return false;
  const haystack = comment.toLowerCase();
  return REVIEW_KEYWORDS.some((keyword) => haystack.includes(keyword));
}
