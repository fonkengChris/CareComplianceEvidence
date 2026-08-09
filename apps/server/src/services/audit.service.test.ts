import { describe, expect, it } from 'bun:test';
import { buildFieldChanges } from './audit.service';

/**
 * Pure unit tests for the audit diff — no DB, mirroring the other pure service tests. This is
 * the heart of the trail: it decides which tracked fields produce an audit row and what the
 * from/to text is. The DB read/write paths are exercised through the controller and manual/DB
 * checks (sandbox can't bind a port).
 */

describe('buildFieldChanges', () => {
  it('emits a change only for fields that actually differ', () => {
    const before = { timeSpent: 30, outcome: 'COMPLETED' };
    const after = { timeSpent: 45, outcome: 'COMPLETED' };
    expect(buildFieldChanges(before, after, ['timeSpent', 'outcome'])).toEqual([
      { field: 'timeSpent', fromValue: '30', toValue: '45' },
    ]);
  });

  it('returns [] when nothing tracked changed (no audit rows for a no-op write)', () => {
    const row = { timeSpent: 30, outcome: 'MISSED', comment: 'x' };
    expect(buildFieldChanges(row, { ...row, comment: 'y' }, ['timeSpent', 'outcome'])).toEqual([]);
  });

  it('stringifies values and treats null↔value as a change', () => {
    const before = { timeSpent: null, outcome: null };
    const after = { timeSpent: 60, outcome: 'REFUSED' };
    expect(buildFieldChanges(before, after, ['timeSpent', 'outcome'])).toEqual([
      { field: 'timeSpent', fromValue: null, toValue: '60' },
      { field: 'outcome', fromValue: null, toValue: 'REFUSED' },
    ]);
  });

  it('ignores fields not in the tracked list', () => {
    const before = { contractedHours: '10.00', name: 'Ada' };
    const after = { contractedHours: '10.00', name: 'Ada Lovelace' };
    expect(buildFieldChanges(before, after, ['contractedHours'])).toEqual([]);
  });

  it('compares on text form, so a numeric string matching a number is unchanged', () => {
    // Postgres numeric columns arrive as strings; a "12" vs 12 should not spuriously log.
    expect(buildFieldChanges({ contractedHours: '12' }, { contractedHours: 12 }, ['contractedHours'])).toEqual([]);
  });
});
