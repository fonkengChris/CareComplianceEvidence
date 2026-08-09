import type { ReportData } from '@care/shared';
import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { setAccessToken } from './api';
import { fetchWeekPlanReport, reportFileName, reportHours, statusLabel } from './reports';

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

beforeEach(() => {
  setAccessToken('access');
});

describe('fetchWeekPlanReport', () => {
  it('requests the plan report endpoint and returns the data', async () => {
    let requested = '';
    globalThis.fetch = mock(async (input: string | URL | Request) => {
      requested = String(input);
      return jsonResponse(report);
    }) as unknown as typeof fetch;

    const data = await fetchWeekPlanReport('plan-123');
    expect(requested).toBe('/api/week-plans/plan-123/report');
    expect(data.serviceUser.name).toBe('Jane Doe');
  });

  it('throws the server error message on a non-OK response', async () => {
    globalThis.fetch = mock(async () =>
      jsonResponse({ error: 'Week plan not found' }, 404),
    ) as unknown as typeof fetch;

    await expect(fetchWeekPlanReport('missing')).rejects.toThrow('Week plan not found');
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

  it('builds a safe, dated file name', () => {
    expect(reportFileName(report)).toBe('report-Jane-Doe-2026-08-17.pdf');
  });
});
