import { describe, expect, it } from 'bun:test';
import { dayEntries, weekPlans } from '../db/schema';
import {
  buildEntryInserts,
  sortDayEntries,
  toPublicDayEntry,
  toPublicWeekPlan,
} from './week-plan.service';

/**
 * Pure tests — no DB. They cover the mapping/normalisation and the two pure helpers
 * that drive the risky behaviour: planner ordering (Mon→Sun then line number) and the
 * entry-insert builder (which must inject the weekPlanId and never carry timeSpent /
 * outcome, since those are staff-recorded in Phase 5 — not set at plan time).
 */

type WeekPlanRow = typeof weekPlans.$inferSelect;
type DayEntryRow = typeof dayEntries.$inferSelect;

const planRow: WeekPlanRow = {
  id: '11111111-1111-4111-8111-111111111111',
  serviceUserId: '22222222-2222-4222-8222-222222222222',
  weekCommencing: '2026-08-10',
  notes: 'Sample',
  createdAt: new Date('2026-08-08T00:00:00.000Z'),
  updatedAt: new Date('2026-08-08T00:00:00.000Z'),
};

const entryRow: DayEntryRow = {
  id: '33333333-3333-4333-8333-333333333333',
  weekPlanId: planRow.id,
  day: 'MON',
  lineNumber: 1,
  activityTypeId: '44444444-4444-4444-8444-444444444444',
  description: 'Shopping trip',
  comment: null,
  timeAllocated: 60,
  timeSpent: null,
  outcome: null,
  createdAt: new Date('2026-08-08T00:00:00.000Z'),
  updatedAt: new Date('2026-08-08T00:00:00.000Z'),
};

describe('toPublicWeekPlan', () => {
  it('passes the date-only weekCommencing through and ISO-stringifies timestamps', () => {
    const result = toPublicWeekPlan(planRow);
    expect(result.weekCommencing).toBe('2026-08-10');
    expect(result.createdAt).toBe('2026-08-08T00:00:00.000Z');
  });

  it('preserves null notes', () => {
    expect(toPublicWeekPlan({ ...planRow, notes: null }).notes).toBeNull();
  });
});

describe('toPublicDayEntry', () => {
  it('carries nullable plan-time fields through', () => {
    const result = toPublicDayEntry({ ...entryRow, activityTypeId: null, timeAllocated: null });
    expect(result.activityTypeId).toBeNull();
    expect(result.timeAllocated).toBeNull();
    expect(result.timeSpent).toBeNull();
    expect(result.outcome).toBeNull();
  });

  it('leaves reviewHint false for a null or clean comment', () => {
    expect(toPublicDayEntry({ ...entryRow, comment: null }).reviewHint).toBe(false);
    expect(toPublicDayEntry({ ...entryRow, comment: 'All went well' }).reviewHint).toBe(false);
  });

  it('computes reviewHint from a comment keyword (never a status)', () => {
    const result = toPublicDayEntry({ ...entryRow, comment: 'Client refused the visit' });
    expect(result.reviewHint).toBe(true);
    // outcome stays the authoritative signal — the hint does not set it.
    expect(result.outcome).toBeNull();
  });
});

describe('sortDayEntries', () => {
  it('orders by weekday (Mon→Sun) then line number', () => {
    const mon2 = toPublicDayEntry({ ...entryRow, day: 'MON', lineNumber: 2 });
    const mon1 = toPublicDayEntry({ ...entryRow, day: 'MON', lineNumber: 1 });
    const wed1 = toPublicDayEntry({ ...entryRow, day: 'WED', lineNumber: 1 });
    const sorted = sortDayEntries([wed1, mon2, mon1]);
    expect(sorted.map((e) => [e.day, e.lineNumber])).toEqual([
      ['MON', 1],
      ['MON', 2],
      ['WED', 1],
    ]);
  });
});

describe('buildEntryInserts', () => {
  it('injects the weekPlanId and defaults absent fields to null', () => {
    const rows = buildEntryInserts('plan-x', [{ day: 'MON', lineNumber: 1 }]);
    expect(rows[0]).toEqual({
      weekPlanId: 'plan-x',
      day: 'MON',
      lineNumber: 1,
      activityTypeId: null,
      description: null,
      timeAllocated: null,
    });
  });

  it('never carries timeSpent or outcome (those are staff-recorded in Phase 5)', () => {
    const [row] = buildEntryInserts('plan-x', [
      { day: 'TUE', lineNumber: 1, activityTypeId: 'a1', timeAllocated: 30 },
    ]);
    expect('timeSpent' in row).toBe(false);
    expect('outcome' in row).toBe(false);
    expect(row.timeAllocated).toBe(30);
  });
});
