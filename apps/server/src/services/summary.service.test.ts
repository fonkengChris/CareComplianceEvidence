import type { ComplianceSettings, ServiceUser } from '@care/shared';
import { describe, expect, it } from 'bun:test';
import { buildWeeklySummaryRow, currentWeekCommencing } from './summary.service';

/**
 * Pure tests — no DB (matching the service-test convention). They pin the aggregation the
 * summary is responsible for: outcome/review-hint counts, per-activity grouping (including the
 * unassigned bucket and an unknown-id fallback), the null-plan row, and the Monday helper.
 */

const settings: ComplianceSettings = {
  id: 'settings-1',
  greenMin: 90,
  amberMin: 75,
  redOverPct: 110,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const serviceUser: ServiceUser = {
  id: 'su-1',
  name: 'Ada Lovelace',
  address: null,
  contractedHours: 10, // 600 contracted minutes
  homeId: null,
  active: true,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const activityNames = new Map([
  ['act-1', 'Shopping'],
  ['act-2', 'Cleaning'],
]);

describe('buildWeeklySummaryRow', () => {
  it('returns a zeroed, planless row when there is no plan', () => {
    const row = buildWeeklySummaryRow(serviceUser, null, [], activityNames, settings);
    expect(row.weekPlanId).toBeNull();
    expect(row.compliance).toBeNull();
    expect(row.missedCount).toBe(0);
    expect(row.refusedCount).toBe(0);
    expect(row.reviewHintCount).toBe(0);
    expect(row.activityBreakdown).toEqual([]);
  });

  it('aggregates compliance, outcome counts, review hints and per-activity breakdown', () => {
    const row = buildWeeklySummaryRow(
      serviceUser,
      { id: 'plan-1' },
      [
        { activityTypeId: 'act-1', timeSpent: 60, outcome: 'COMPLETED', comment: null },
        { activityTypeId: 'act-1', timeSpent: 30, outcome: 'MISSED', comment: 'client missed it' },
        { activityTypeId: 'act-2', timeSpent: null, outcome: 'REFUSED', comment: 'refused today' },
        { activityTypeId: null, timeSpent: 15, outcome: 'COMPLETED', comment: 'went well' },
      ],
      activityNames,
      settings,
    );

    expect(row.weekPlanId).toBe('plan-1');
    // delivered = 60 + 30 + 0 + 15; compliance is delegated to computeWeekCompliance.
    expect(row.compliance?.deliveredMinutes).toBe(105);
    expect(row.missedCount).toBe(1);
    expect(row.refusedCount).toBe(1);
    // Keyword scan of the comments: 'missed' and 'refused' trip it; 'went well'/null do not.
    expect(row.reviewHintCount).toBe(2);

    // Grouped by activity, sorted by name: Cleaning, Shopping, Unassigned.
    expect(row.activityBreakdown).toEqual([
      { activityTypeId: 'act-2', activityName: 'Cleaning', entryCount: 1, deliveredMinutes: 0 },
      { activityTypeId: 'act-1', activityName: 'Shopping', entryCount: 2, deliveredMinutes: 90 },
      { activityTypeId: null, activityName: 'Unassigned', entryCount: 1, deliveredMinutes: 15 },
    ]);
  });

  it('falls back to a placeholder name for an unknown activity id', () => {
    const row = buildWeeklySummaryRow(
      serviceUser,
      { id: 'plan-1' },
      [{ activityTypeId: 'gone', timeSpent: 20, outcome: 'COMPLETED', comment: null }],
      activityNames,
      settings,
    );
    expect(row.activityBreakdown).toEqual([
      { activityTypeId: 'gone', activityName: 'Unknown activity', entryCount: 1, deliveredMinutes: 20 },
    ]);
  });
});

describe('currentWeekCommencing', () => {
  it.each([
    ['2026-08-03T00:00:00Z', '2026-08-03'], // Monday → itself
    ['2026-08-05T12:00:00Z', '2026-08-03'], // Wednesday → that Monday
    ['2026-08-09T23:59:00Z', '2026-08-03'], // Sunday → the same week's Monday
  ])('maps %s to Monday %s', (now, expected) => {
    expect(currentWeekCommencing(new Date(now))).toBe(expected);
  });
});
