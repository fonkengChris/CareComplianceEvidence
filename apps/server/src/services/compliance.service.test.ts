import type { ComplianceStatus } from '@care/shared';
import { describe, expect, it } from 'bun:test';
import { computeWeekCompliance, thresholdsInOrder } from './compliance.service';

/**
 * Pure tests — no DB (matching the service-test convention). They pin the risky maths:
 * the status buckets at their exact boundaries (nothing hardcoded — thresholds are passed
 * in), null timeSpent → 0, and the divide-by-zero guard for a zero-contract service user.
 */

// Defaults mirror the seed (db/seed.ts): 🟢 ≥90%, 🟡 ≥75%, 🔴 >110%.
const settings = { greenMin: 90, amberMin: 75, redOverPct: 110 };

/** Build entries whose timeSpent sums to `minutes` (one line). */
const entriesFor = (minutes: number) => [{ timeSpent: minutes }];

describe('computeWeekCompliance', () => {
  it('sums timeSpent (null → 0) regardless of outcome', () => {
    const result = computeWeekCompliance(
      [{ timeSpent: 30 }, { timeSpent: null }, { timeSpent: 45 }],
      10, // contracted hours
      settings,
    );
    expect(result.deliveredMinutes).toBe(75);
    expect(result.contractedMinutes).toBe(600);
    expect(result.remainingMinutes).toBe(525);
  });

  it.each<[number, ComplianceStatus]>([
    [74, 'ATTENTION'], // below amberMin
    [75, 'UNDER_TARGET'], // exactly amberMin
    [89, 'UNDER_TARGET'], // just below greenMin
    [90, 'ON_TRACK'], // exactly greenMin
    [110, 'ON_TRACK'], // exactly redOverPct — not yet over
    [111, 'OVER_HOURS'], // above redOverPct
  ])('at %i%% delivery → %s', (pct, expected) => {
    // 10 contracted hours = 600 min; pct% of that gives the target delivered minutes.
    const result = computeWeekCompliance(entriesFor((600 * pct) / 100), 10, settings);
    expect(result.deliveryPct).toBe(pct);
    expect(result.status).toBe(expected);
  });

  it('reports 0% and ATTENTION for an empty week', () => {
    const result = computeWeekCompliance([], 10, settings);
    expect(result.deliveredMinutes).toBe(0);
    expect(result.deliveryPct).toBe(0);
    expect(result.status).toBe('ATTENTION');
  });

  it('guards against divide-by-zero when contractedHours is 0', () => {
    const result = computeWeekCompliance(entriesFor(120), 0, settings);
    expect(result.contractedMinutes).toBe(0);
    expect(result.deliveryPct).toBe(0); // no NaN/Infinity
    expect(result.remainingMinutes).toBe(-120); // over-delivered against a zero contract
    expect(result.status).toBe('ATTENTION');
  });
});

describe('thresholdsInOrder', () => {
  it('accepts amber ≤ green ≤ red', () => {
    expect(thresholdsInOrder(settings)).toBe(true);
    expect(thresholdsInOrder({ greenMin: 80, amberMin: 80, redOverPct: 80 })).toBe(true);
  });

  it('rejects amber above green', () => {
    expect(thresholdsInOrder({ greenMin: 90, amberMin: 95, redOverPct: 110 })).toBe(false);
  });

  it('rejects green above red', () => {
    expect(thresholdsInOrder({ greenMin: 120, amberMin: 75, redOverPct: 110 })).toBe(false);
  });
});
