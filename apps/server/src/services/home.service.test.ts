import { describe, expect, it } from 'bun:test';
import { homes } from '../db/schema';
import { toPublicHome } from './home.service';

/**
 * Pure mapping test — no DB. `toPublicHome` drops nothing sensitive; it just coerces
 * Dates to ISO strings and passes the shape through the shared schema.
 */

type HomeRow = typeof homes.$inferSelect;

const baseRow: HomeRow = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Riverside House',
  address: '1 Riverside Way',
  active: true,
  createdAt: new Date('2026-08-08T00:00:00.000Z'),
  updatedAt: new Date('2026-08-08T00:00:00.000Z'),
};

describe('toPublicHome', () => {
  it('converts timestamps to ISO strings', () => {
    const result = toPublicHome(baseRow);
    expect(result.createdAt).toBe('2026-08-08T00:00:00.000Z');
    expect(result.updatedAt).toBe('2026-08-08T00:00:00.000Z');
  });

  it('preserves a null address', () => {
    expect(toPublicHome({ ...baseRow, address: null }).address).toBeNull();
  });

  it('carries the active flag through', () => {
    expect(toPublicHome({ ...baseRow, active: false }).active).toBe(false);
  });
});
