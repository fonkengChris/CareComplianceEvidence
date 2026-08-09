import { describe, expect, it } from 'bun:test';
import { REVIEW_KEYWORDS, detectReviewHint } from './review-hint';

describe('detectReviewHint', () => {
  it('flags a comment for each review keyword, case-insensitively', () => {
    for (const keyword of REVIEW_KEYWORDS) {
      expect(detectReviewHint(`Client ${keyword.toUpperCase()} the visit`)).toBe(true);
    }
  });

  it('matches a keyword embedded in a longer sentence', () => {
    expect(detectReviewHint('Support was missed because of a hospital appointment')).toBe(true);
    expect(detectReviewHint('He did not want to go out today')).toBe(true);
  });

  it('does not flag a clean comment', () => {
    expect(detectReviewHint('Went shopping and had lunch, all good')).toBe(false);
  });

  it('treats null/undefined/empty as no hint', () => {
    expect(detectReviewHint(null)).toBe(false);
    expect(detectReviewHint(undefined)).toBe(false);
    expect(detectReviewHint('')).toBe(false);
  });
});
