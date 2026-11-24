import { describe, expect, it } from 'bun:test';
import { type TemplateRow, buildOverview } from './check-occurrence';

/** Pure tests for the manager overview: outstanding, missed and flagged checks per home. */

const HOME_A = '11111111-1111-4111-8111-111111111111';
const HOME_B = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-11-25T10:00:00Z'); // Wednesday, 10:00 London

function template(overrides: Partial<TemplateRow>): TemplateRow {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Daily Checks',
    scheduleKind: 'DAILY',
    scheduleDays: [],
    dueByTime: null,
    definition: { sections: [] },
    version: 1,
    active: true,
    createdAt: new Date('2026-11-01T00:00:00Z'),
    updatedAt: new Date('2026-11-01T00:00:00Z'),
    ...overrides,
  };
}

const daily = template({});
const weekly = template({
  id: '44444444-4444-4444-8444-444444444444',
  name: 'Weekly Checks',
  scheduleKind: 'WEEKLY',
  scheduleDays: ['MON'],
});
const retired = template({
  id: '55555555-5555-4555-8555-555555555555',
  name: 'Old Check',
  active: false,
});

const submission = (homeId: string, templateId: string, dueDate: string, issueCount = 0) => ({
  id: crypto.randomUUID(),
  homeId,
  templateId,
  dueDate,
  late: false,
  issueCount,
  submittedByName: 'Jane',
  submittedAt: new Date(`${dueDate}T09:00:00Z`),
});

describe('buildOverview', () => {
  const homes = [
    { id: HOME_A, name: 'A House' },
    { id: HOME_B, name: 'B House' },
  ];

  it('lists outstanding checks, missed occurrences in the window, and flagged submissions', () => {
    // Home A did every daily check except 21 Nov, plus Monday's weekly check with 2 issues.
    const doneDays = [
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
      '2026-11-22',
      '2026-11-23',
      '2026-11-24',
    ];
    const submitted = [
      ...doneDays.map((d) => submission(HOME_A, daily.id, d)),
      submission(HOME_A, weekly.id, '2026-11-23', 2),
      submission(HOME_A, retired.id, '2026-11-20', 1),
    ];
    const overview = buildOverview(homes, [daily, weekly, retired], submitted, NOW);
    expect(overview.since).toBe('2026-11-18');

    const a = overview.homes[0];
    expect(a.open.map((o) => `${o.templateName} ${o.status}`)).toEqual(['Daily Checks DUE']);
    expect(a.missed.map((o) => o.dueDate)).toEqual(['2026-11-21']);
    expect(a.flagged.map((o) => `${o.templateName} ${o.issueCount}`)).toEqual([
      'Weekly Checks 2',
      'Old Check 1',
    ]);

    const b = overview.homes[1];
    expect(b.open.map((o) => o.templateName)).toEqual(['Daily Checks', 'Weekly Checks']);
    expect(b.open[1].status).toBe('OVERDUE');
    // 18–24 Nov daily (7) + Monday 23 Nov is still open, not missed.
    expect(b.missed).toHaveLength(7);
    expect(b.flagged).toEqual([]);
  });

  it('never counts days before a check existed as missed', () => {
    const fresh = template({ createdAt: new Date('2026-11-24T15:00:00Z') });
    const overview = buildOverview(homes.slice(0, 1), [fresh], [], NOW);
    expect(overview.homes[0].missed.map((o) => o.dueDate)).toEqual(['2026-11-24']);
  });
});
