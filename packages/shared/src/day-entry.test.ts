import { describe, expect, it } from 'bun:test';
import { dayEntryCreateSchema } from './day-entry';

describe('dayEntryCreateSchema', () => {
  const weekPlanId = '11111111-1111-4111-8111-111111111111';
  const activityTypeId = '22222222-2222-4222-8222-222222222222';
  const base = { weekPlanId, day: 'MON' as const, lineNumber: 1 };

  it('accepts a fully specified planned line', () => {
    expect(
      dayEntryCreateSchema.safeParse({ ...base, activityTypeId, timeAllocated: 60 }).success,
    ).toBe(true);
  });

  it('accepts a blank line with no activity chosen yet (plan-time nullability)', () => {
    // No activityTypeId, no timeAllocated — a manager can add an empty line first.
    expect(dayEntryCreateSchema.safeParse(base).success).toBe(true);
  });

  it('does not accept timeSpent/outcome at create time (recorded in Phase 5)', () => {
    const parsed = dayEntryCreateSchema.parse({ ...base, timeSpent: 30, outcome: 'COMPLETED' });
    expect('timeSpent' in parsed).toBe(false);
    expect('outcome' in parsed).toBe(false);
  });

  it('rejects non-integer or negative allocated minutes', () => {
    expect(dayEntryCreateSchema.safeParse({ ...base, timeAllocated: 12.5 }).success).toBe(false);
    expect(dayEntryCreateSchema.safeParse({ ...base, timeAllocated: -5 }).success).toBe(false);
  });

  it('rejects an invalid weekday', () => {
    expect(dayEntryCreateSchema.safeParse({ ...base, day: 'FUNDAY' }).success).toBe(false);
  });
});
