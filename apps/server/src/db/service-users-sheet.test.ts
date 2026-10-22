import { describe, expect, it } from 'bun:test';
import { readServiceUsersSheet, toServiceUserRows } from './service-users-sheet';

describe('readServiceUsersSheet', () => {
  it('reads name, home and active, defaulting contracted hours to 0', () => {
    const csv = 'Name,Home,Active\nAnn Bo,Cotton Lane Home,Yes\nCy Do,,No\n';
    expect(readServiceUsersSheet(csv)).toEqual([
      { name: 'Ann Bo', homeName: 'Cotton Lane Home', contractedHours: 0, active: true },
      { name: 'Cy Do', homeName: null, contractedHours: 0, active: false },
    ]);
  });

  it('reads an optional Contracted Hours column', () => {
    const csv = 'Name,Home,Contracted Hours\nAnn Bo,X Home,12.5';
    expect(readServiceUsersSheet(csv)[0].contractedHours).toBe(12.5);
  });
});

describe('toServiceUserRows', () => {
  it('skips blank rows', () => {
    expect(toServiceUserRows([['Name'], [''], ['A']])).toEqual([
      { name: 'A', homeName: null, contractedHours: 0, active: true },
    ]);
  });

  it('reports every bad row at once', () => {
    const rows = [
      ['Name', 'Contracted Hours', 'Active'],
      ['', '', 'Yes'],
      ['A', 'lots', 'Yes'],
      ['B', '-1', 'maybe'],
      ['C', '', 'Yes'],
      ['c', '', 'Yes'],
    ];
    expect(() => toServiceUserRows(rows)).toThrow(
      /row 2: missing name[\s\S]*row 3: invalid contracted hours "lots"[\s\S]*row 4: invalid contracted hours "-1"[\s\S]*row 4: unknown Active value "maybe"[\s\S]*row 6: duplicate service user c/,
    );
  });

  it('requires a Name column', () => {
    expect(() => toServiceUserRows([['Home']])).toThrow('Missing "name" column');
  });
});
