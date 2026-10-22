import { describe, expect, it } from 'bun:test';
import { diffGrants } from './auditor-access.service';

/** Pure grant-diff tests — no DB. */
describe('diffGrants', () => {
  it('adds new ids and removes dropped ones', () => {
    expect(diffGrants(['a', 'b'], ['b', 'c'])).toEqual({ add: ['c'], remove: ['a'] });
  });

  it('is a no-op for the same set in any order', () => {
    expect(diffGrants(['a', 'b'], ['b', 'a'])).toEqual({ add: [], remove: [] });
  });

  it('removes everything for an empty selection and ignores duplicates', () => {
    expect(diffGrants(['a'], [])).toEqual({ add: [], remove: ['a'] });
    expect(diffGrants([], ['a', 'a'])).toEqual({ add: ['a'], remove: [] });
  });
});
