import { describe, expect, it } from 'bun:test';
import { shiftSessions } from '../db/schema';
import { isShiftActive, shiftExpiry, toPublicShift } from './shift.service';

/**
 * Pure tests — no DB. The expiry cap and the "is this session still granting access" rule are
 * what make home-path access time-bound, so they are pinned here; the DB paths reuse them.
 */

type ShiftRow = typeof shiftSessions.$inferSelect;

const started = new Date('2026-10-25T08:00:00.000Z');

const baseRow: ShiftRow = {
  id: '55555555-5555-4555-8555-555555555555',
  staffId: '11111111-1111-4111-8111-111111111111',
  homeId: '33333333-3333-4333-8333-333333333333',
  startedAt: started,
  expiresAt: new Date('2026-10-25T20:00:00.000Z'),
  endedAt: null,
  endedById: null,
  createdAt: started,
};

describe('shiftExpiry', () => {
  it('caps the session at the configured number of hours', () => {
    expect(shiftExpiry(started, 12).toISOString()).toBe('2026-10-25T20:00:00.000Z');
    expect(shiftExpiry(started, 8).toISOString()).toBe('2026-10-25T16:00:00.000Z');
  });
});

describe('isShiftActive', () => {
  it('is active while open and before expiry', () => {
    expect(isShiftActive(baseRow, new Date('2026-10-25T19:59:59.000Z'))).toBe(true);
  });

  it('lapses at expiry even if never ended', () => {
    expect(isShiftActive(baseRow, new Date('2026-10-25T20:00:00.000Z'))).toBe(false);
  });

  it('is inactive once ended', () => {
    const ended = { ...baseRow, endedAt: new Date('2026-10-25T10:00:00.000Z') };
    expect(isShiftActive(ended, new Date('2026-10-25T11:00:00.000Z'))).toBe(false);
  });
});

describe('toPublicShift', () => {
  it('converts timestamps to ISO strings and carries the names', () => {
    const result = toPublicShift(baseRow, 'Riverside House', 'Sam Staff');
    expect(result).toEqual({
      id: baseRow.id,
      staffId: baseRow.staffId,
      homeId: baseRow.homeId,
      homeName: 'Riverside House',
      staffName: 'Sam Staff',
      startedAt: '2026-10-25T08:00:00.000Z',
      expiresAt: '2026-10-25T20:00:00.000Z',
      endedAt: null,
    });
  });
});
