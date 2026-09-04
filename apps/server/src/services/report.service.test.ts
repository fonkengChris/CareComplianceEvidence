import type { ComplianceSettings, ServiceUser } from '@care/shared';
import { describe, expect, it } from 'bun:test';
import {
  type PeriodPlan,
  buildNotes,
  buildPeriodReport,
  buildWeekPlanReport,
  mondayOf,
  weekCountBetween,
} from './report.service';

/**
 * Pure tests — no DB (matching the service-test convention). Compliance/counts/breakdown come
 * from `buildWeeklySummaryRow` (covered in summary.service.test), so these pin what the report
 * builders add on top: the week/notes/bands, the staff notes, and the multi-week roll-up.
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
  contractedHours: 10, // 600 contracted minutes / week
  homeId: null,
  active: true,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const activityNames = new Map([
  ['act-1', 'Shopping'],
  ['act-2', 'Cleaning'],
]);

type Entry = Parameters<typeof buildNotes>[1][number];
const entry = (over: Partial<Entry> = {}): Entry => ({
  day: 'MON',
  lineNumber: 1,
  activityTypeId: 'act-1',
  description: null,
  timeSpent: 60,
  outcome: 'COMPLETED',
  comment: null,
  ...over,
});

describe('buildWeekPlanReport', () => {
  it('composes report data, including the staff notes, from the plan and its entries', () => {
    const report = buildWeekPlanReport(
      serviceUser,
      { id: 'plan-1', weekCommencing: '2026-08-17', notes: 'Busy week.' },
      [
        entry({
          day: 'MON',
          lineNumber: 1,
          activityTypeId: 'act-1',
          timeSpent: 60,
          outcome: 'COMPLETED',
          comment: null,
        }),
        entry({
          day: 'MON',
          lineNumber: 2,
          activityTypeId: 'act-1',
          timeSpent: 30,
          outcome: 'MISSED',
          comment: 'client missed it',
        }),
        entry({
          day: 'WED',
          lineNumber: 1,
          activityTypeId: 'act-2',
          timeSpent: null,
          outcome: 'REFUSED',
          comment: '  refused today  ',
        }),
      ],
      activityNames,
      settings,
      '2026-08-24T09:30:00.000Z',
    );

    expect(report.weekCommencing).toBe('2026-08-17');
    expect(report.notes).toBe('Busy week.');
    expect(report.compliance.deliveredMinutes).toBe(90);
    expect(report.missedCount).toBe(1);
    expect(report.refusedCount).toBe(1);

    // Only commented lines become notes, weekday-then-line ordered, trimmed.
    expect(report.staffNotes).toEqual([
      {
        weekCommencing: '2026-08-17',
        day: 'MON',
        activityName: 'Shopping',
        description: null,
        timeSpent: 30,
        outcome: 'MISSED',
        comment: 'client missed it',
      },
      {
        weekCommencing: '2026-08-17',
        day: 'WED',
        activityName: 'Cleaning',
        description: null,
        timeSpent: null,
        outcome: 'REFUSED',
        comment: 'refused today',
      },
    ]);
  });

  it('carries null notes through and yields no staff notes when none were written', () => {
    const report = buildWeekPlanReport(
      serviceUser,
      { id: 'plan-1', weekCommencing: '2026-08-17', notes: null },
      [],
      activityNames,
      settings,
      '2026-08-24T09:30:00.000Z',
    );
    expect(report.notes).toBeNull();
    expect(report.staffNotes).toEqual([]);
    expect(report.compliance.deliveredMinutes).toBe(0);
  });
});

describe('buildNotes', () => {
  it('skips blank/whitespace comments and unassigned activities read as "Unassigned"', () => {
    const notes = buildNotes(
      '2026-08-17',
      [
        entry({ lineNumber: 1, comment: '   ' }),
        entry({ lineNumber: 2, activityTypeId: null, comment: 'ad-hoc support' }),
      ],
      activityNames,
    );
    expect(notes).toHaveLength(1);
    expect(notes[0].activityName).toBe('Unassigned');
    expect(notes[0].comment).toBe('ad-hoc support');
  });
});

describe('week range helpers', () => {
  it('snaps any date to its Monday', () => {
    expect(mondayOf('2026-08-19')).toBe('2026-08-17'); // Wed → Mon
    expect(mondayOf('2026-08-17')).toBe('2026-08-17'); // Mon → itself
    expect(mondayOf('2026-08-23')).toBe('2026-08-17'); // Sun → that week's Mon
  });

  it('counts inclusive calendar weeks between two Mondays', () => {
    expect(weekCountBetween('2026-08-17', '2026-08-17')).toBe(1);
    expect(weekCountBetween('2026-08-03', '2026-08-31')).toBe(5);
  });
});

describe('buildPeriodReport', () => {
  it('rolls up weeks: sums delivered/counts, merges the breakdown, concatenates notes', () => {
    const plans: PeriodPlan[] = [
      {
        id: 'plan-1',
        weekCommencing: '2026-08-03',
        entries: [
          entry({
            day: 'MON',
            lineNumber: 1,
            activityTypeId: 'act-1',
            timeSpent: 300,
            outcome: 'COMPLETED',
            comment: 'good week',
          }),
        ],
      },
      {
        id: 'plan-2',
        weekCommencing: '2026-08-10',
        entries: [
          entry({
            day: 'TUE',
            lineNumber: 1,
            activityTypeId: 'act-1',
            timeSpent: 120,
            outcome: 'COMPLETED',
            comment: null,
          }),
          entry({
            day: 'WED',
            lineNumber: 1,
            activityTypeId: 'act-2',
            timeSpent: 0,
            outcome: 'MISSED',
            comment: 'unwell',
          }),
        ],
      },
    ];

    const report = buildPeriodReport(
      serviceUser,
      plans,
      activityNames,
      settings,
      { from: '2026-08-03', to: '2026-08-31', weekCount: 5 },
      '2026-09-04T09:30:00.000Z',
    );

    // Delivered = 300 + 120 + 0; contracted = 600/wk × 5 weeks = 3000.
    expect(report.compliance.deliveredMinutes).toBe(420);
    expect(report.compliance.contractedMinutes).toBe(3000);
    expect(report.missedCount).toBe(1);
    expect(report.weeks.map((w) => w.weekCommencing)).toEqual(['2026-08-03', '2026-08-10']);

    // Breakdown merged across weeks: Shopping = 300 + 120 over 2 lines.
    const shopping = report.activityBreakdown.find((b) => b.activityName === 'Shopping');
    expect(shopping).toEqual({
      activityTypeId: 'act-1',
      activityName: 'Shopping',
      entryCount: 2,
      deliveredMinutes: 420,
    });

    // Notes concatenated in week order, each carrying its own week.
    expect(report.staffNotes.map((n) => `${n.weekCommencing}:${n.comment}`)).toEqual([
      '2026-08-03:good week',
      '2026-08-10:unwell',
    ]);
  });
});
