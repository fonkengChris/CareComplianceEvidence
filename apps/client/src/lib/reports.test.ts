import type { PeriodReport, ReportData } from '@care/shared';
import { beforeEach, describe, expect, it } from 'bun:test';
import { setAccessToken } from './api';
import {
  fetchPeriodSummary,
  fetchServiceUserPeriodReport,
  fetchWeekPlanReport,
  outcomeLabel,
  periodReportFileName,
  rangeLabel,
  reportFileName,
  reportHours,
  statusLabel,
  weekdayLabel,
} from './reports';
import { mockApi } from './test-utils';

/**
 * Covers the safe, DOM-free parts of the report feature: the fetch helper and the pure display
 * helpers. The PDF document is deliberately NOT rendered here — @react-pdf primitives don't run
 * in happy-dom, and a crashing render poisons the whole client suite.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const report: ReportData = {
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
  notes: null,
  compliance: {
    deliveredMinutes: 750,
    contractedMinutes: 900,
    remainingMinutes: 150,
    deliveryPct: 83,
    status: 'UNDER_TARGET',
  },
  missedCount: 1,
  refusedCount: 0,
  reviewHintCount: 1,
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
  generatedAt: '2026-08-24T09:30:00.000Z',
};

const periodReport: PeriodReport = {
  serviceUser: report.serviceUser,
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
  weeks: [],
  activityBreakdown: [],
  staffNotes: [],
  settings: report.settings,
  generatedAt: '2026-09-04T09:30:00.000Z',
};

beforeEach(() => {
  setAccessToken('access');
});

describe('fetchWeekPlanReport', () => {
  it('requests the plan report endpoint and returns the data', async () => {
    let requested = '';
    mockApi(async (url) => {
      requested = url;
      return jsonResponse(report);
    });

    const data = await fetchWeekPlanReport('plan-123');
    expect(requested).toBe('/api/week-plans/plan-123/report');
    expect(data.serviceUser.name).toBe('Jane Doe');
  });

  it('throws the server error message on a non-OK response', async () => {
    mockApi(async () => jsonResponse({ error: 'Week plan not found' }, 404));

    await expect(fetchWeekPlanReport('missing')).rejects.toThrow('Week plan not found');
  });
});

describe('fetchServiceUserPeriodReport', () => {
  it('requests the per-service-user period endpoint with the range', async () => {
    let requested = '';
    mockApi(async (url) => {
      requested = url;
      return jsonResponse(periodReport);
    });

    const data = await fetchServiceUserPeriodReport('su-1', '2026-08-03', '2026-08-31');
    expect(requested).toBe('/api/service-users/su-1/report?from=2026-08-03&to=2026-08-31');
    expect(data.weekCount).toBe(5);
  });
});

describe('fetchPeriodSummary', () => {
  it('requests the period summary endpoint with the range', async () => {
    let requested = '';
    mockApi(async (url) => {
      requested = url;
      return jsonResponse({
        from: '2026-08-03',
        to: '2026-08-31',
        weekCount: 5,
        settings: report.settings,
        rows: [periodReport],
      });
    });

    const data = await fetchPeriodSummary('2026-08-03', '2026-08-31');
    expect(requested).toBe('/api/summary/period?from=2026-08-03&to=2026-08-31');
    expect(data.rows).toHaveLength(1);
  });
});

describe('report display helpers', () => {
  it('formats minutes as a compact hours string', () => {
    expect(reportHours(750)).toBe('12.5h');
    expect(reportHours(0)).toBe('0.0h');
  });

  it('maps each compliance status to a readable label', () => {
    expect(statusLabel('ON_TRACK')).toBe('On track');
    expect(statusLabel('UNDER_TARGET')).toBe('Under target');
    expect(statusLabel('OVER_HOURS')).toBe('Over hours');
    expect(statusLabel('ATTENTION')).toBe('Attention required');
  });

  it('maps each outcome to a readable label', () => {
    expect(outcomeLabel('COMPLETED')).toBe('Completed');
    expect(outcomeLabel('PARTIALLY_COMPLETED')).toBe('Partially completed');
    expect(outcomeLabel('MISSED')).toBe('Missed');
  });

  it('gives a short weekday label', () => {
    expect(weekdayLabel('MON')).toBe('Mon');
    expect(weekdayLabel('SUN')).toBe('Sun');
  });

  it('builds a safe, dated file name', () => {
    expect(reportFileName(report)).toBe('report-Jane-Doe-2026-08-17.pdf');
  });

  it('builds a ranged file name, collapsing to a single date for one week', () => {
    expect(periodReportFileName(periodReport)).toBe('report-Jane-Doe-2026-08-03-to-2026-08-31.pdf');
    expect(periodReportFileName({ ...periodReport, from: '2026-08-03', to: '2026-08-03' })).toBe(
      'report-Jane-Doe-2026-08-03.pdf',
    );
  });

  it('formats a human range label, collapsing a single week', () => {
    expect(rangeLabel('2026-08-03', '2026-08-31')).toBe('3 Aug 2026 – 31 Aug 2026');
    expect(rangeLabel('2026-08-03', '2026-08-03')).toBe('Week of 3 Aug 2026');
  });
});
