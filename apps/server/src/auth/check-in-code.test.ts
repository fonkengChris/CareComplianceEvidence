import { describe, expect, it } from 'bun:test';
import { currentCheckInCode, verifyCheckInCode } from './check-in-code';

/** Pure tests: the code rotates per window, and only the current + previous window verify. */

const SECRET = 'a'.repeat(64);
const WINDOW = 60;
const t0 = new Date('2026-11-23T09:00:00.000Z'); // a window boundary (divisible by 60s)
const at = (seconds: number) => new Date(t0.getTime() + seconds * 1000);

describe('currentCheckInCode', () => {
  it('is six digits and stable within a window', () => {
    const a = currentCheckInCode(SECRET, at(0), WINDOW);
    const b = currentCheckInCode(SECRET, at(59), WINDOW);
    expect(a.code).toMatch(/^\d{6}$/);
    expect(b.code).toBe(a.code);
    expect(a.expiresAt.toISOString()).toBe('2026-11-23T09:01:00.000Z');
  });

  it('rotates at the window boundary and differs per home secret', () => {
    const a = currentCheckInCode(SECRET, at(0), WINDOW).code;
    expect(currentCheckInCode(SECRET, at(60), WINDOW).code).not.toBe(a);
    expect(currentCheckInCode('b'.repeat(64), at(0), WINDOW).code).not.toBe(a);
  });
});

describe('verifyCheckInCode', () => {
  const code = currentCheckInCode(SECRET, at(0), WINDOW).code;

  it('accepts the current window', () => {
    expect(verifyCheckInCode(SECRET, code, at(30), WINDOW)).toBe(true);
  });

  it('accepts the previous window (code read just before rollover)', () => {
    expect(verifyCheckInCode(SECRET, code, at(90), WINDOW)).toBe(true);
  });

  it('rejects older windows, wrong secrets and malformed input', () => {
    expect(verifyCheckInCode(SECRET, code, at(120), WINDOW)).toBe(false);
    expect(verifyCheckInCode('b'.repeat(64), code, at(0), WINDOW)).toBe(false);
    expect(verifyCheckInCode(SECRET, '12345', at(0), WINDOW)).toBe(false);
    expect(verifyCheckInCode(SECRET, 'abcdef', at(0), WINDOW)).toBe(false);
  });
});
