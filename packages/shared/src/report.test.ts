import { describe, expect, it } from 'bun:test';
import { periodReportSchema, reportDataSchema } from './report';

describe('reportDataSchema', () => {
  const valid = {
    serviceUser: {
      id: crypto.randomUUID(),
      name: 'Jane Doe',
      address: '12 Elm St',
      contractedHours: 15,
      homeId: null,
      active: true,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
    weekCommencing: '2026-08-17',
    notes: 'Busy week.',
    compliance: {
      deliveredMinutes: 750,
      contractedMinutes: 900,
      remainingMinutes: 150,
      deliveryPct: 83,
      status: 'ON_TRACK',
    },
    missedCount: 1,
    refusedCount: 0,
    reviewHintCount: 1,
    activityBreakdown: [
      {
        activityTypeId: crypto.randomUUID(),
        activityName: 'Wellbeing',
        entryCount: 4,
        deliveredMinutes: 300,
      },
    ],
    staffNotes: [
      {
        weekCommencing: '2026-08-17',
        day: 'MON',
        activityName: 'Wellbeing',
        description: null,
        timeSpent: 60,
        outcome: 'COMPLETED',
        comment: 'Good session.',
      },
    ],
    settings: {
      id: crypto.randomUUID(),
      greenMin: 90,
      amberMin: 75,
      redOverPct: 110,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
    generatedAt: '2026-08-24T09:30:00.000Z',
  };

  it('round-trips a valid report', () => {
    expect(reportDataSchema.safeParse(valid).success).toBe(true);
  });

  it('allows null notes (no weekly notes recorded)', () => {
    expect(reportDataSchema.safeParse({ ...valid, notes: null }).success).toBe(true);
  });

  it('rejects a malformed weekCommencing', () => {
    expect(reportDataSchema.safeParse({ ...valid, weekCommencing: '17-08-2026' }).success).toBe(
      false,
    );
  });
});

describe('periodReportSchema', () => {
  const valid = {
    serviceUser: {
      id: crypto.randomUUID(),
      name: 'Jane Doe',
      address: null,
      contractedHours: 15,
      homeId: null,
      active: true,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
    from: '2026-08-03',
    to: '2026-08-31',
    weekCount: 5,
    compliance: {
      deliveredMinutes: 3000,
      contractedMinutes: 4500,
      remainingMinutes: 1500,
      deliveryPct: 67,
      status: 'ATTENTION',
    },
    missedCount: 2,
    refusedCount: 1,
    reviewHintCount: 3,
    weeks: [
      {
        weekPlanId: crypto.randomUUID(),
        weekCommencing: '2026-08-03',
        compliance: {
          deliveredMinutes: 600,
          contractedMinutes: 900,
          remainingMinutes: 300,
          deliveryPct: 67,
          status: 'ATTENTION',
        },
        missedCount: 0,
        refusedCount: 0,
        reviewHintCount: 1,
      },
    ],
    activityBreakdown: [],
    staffNotes: [],
    settings: {
      id: crypto.randomUUID(),
      greenMin: 90,
      amberMin: 75,
      redOverPct: 110,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
    generatedAt: '2026-09-04T09:30:00.000Z',
  };

  it('round-trips a valid period report', () => {
    expect(periodReportSchema.safeParse(valid).success).toBe(true);
  });

  it('requires at least one week in the range', () => {
    expect(periodReportSchema.safeParse({ ...valid, weekCount: 0 }).success).toBe(false);
  });
});
