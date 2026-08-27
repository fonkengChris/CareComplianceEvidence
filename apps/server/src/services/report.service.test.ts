import type { ComplianceSettings, ServiceUser } from '@care/shared';
import { describe, expect, it } from 'bun:test';
import { buildWeekPlanReport } from './report.service';

/**
 * Pure tests — no DB (matching the service-test convention). Compliance/counts/breakdown come
 * from `buildWeeklySummaryRow` (covered in summary.service.test), so these pin what the report
 * builder adds on top: the week, plan notes, bands and generated-at, and that a plan-backed
 * report always carries a non-null compliance block.
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
  address: '1 Analytical Ave',
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

describe('buildWeekPlanReport', () => {
  it('composes report data from the plan, its entries and the settings', () => {
    const report = buildWeekPlanReport(
      serviceUser,
      { id: 'plan-1', weekCommencing: '2026-08-17', notes: 'Busy week.' },
      [
        { day: 'MON', activityTypeId: 'act-1', timeSpent: 60, outcome: 'COMPLETED', comment: null },
        { day: 'MON', activityTypeId: 'act-1', timeSpent: 30, outcome: 'MISSED', comment: 'client missed it' },
        { day: 'WED', activityTypeId: 'act-2', timeSpent: null, outcome: 'REFUSED', comment: 'refused today' },
      ],
      activityNames,
      settings,
      '2026-08-24T09:30:00.000Z',
    );

    expect(report.serviceUser).toEqual(serviceUser);
    expect(report.weekCommencing).toBe('2026-08-17');
    expect(report.notes).toBe('Busy week.');
    expect(report.settings).toEqual(settings);
    expect(report.generatedAt).toBe('2026-08-24T09:30:00.000Z');

    // Delegated aggregation, spot-checked: delivered = 60 + 30 + 0.
    expect(report.compliance.deliveredMinutes).toBe(90);
    expect(report.missedCount).toBe(1);
    expect(report.refusedCount).toBe(1);
    expect(report.reviewHintCount).toBe(2);
    expect(report.activityBreakdown).toEqual([
      { activityTypeId: 'act-2', activityName: 'Cleaning', entryCount: 1, deliveredMinutes: 0 },
      { activityTypeId: 'act-1', activityName: 'Shopping', entryCount: 2, deliveredMinutes: 90 },
    ]);
  });

  it('carries null notes through when a plan has none', () => {
    const report = buildWeekPlanReport(
      serviceUser,
      { id: 'plan-1', weekCommencing: '2026-08-17', notes: null },
      [],
      activityNames,
      settings,
      '2026-08-24T09:30:00.000Z',
    );
    expect(report.notes).toBeNull();
    // A plan with no recorded entries still reports (zero delivered), never a null compliance.
    expect(report.compliance.deliveredMinutes).toBe(0);
    expect(report.activityBreakdown).toEqual([]);
  });
});
