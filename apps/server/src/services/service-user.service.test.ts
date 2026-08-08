import { describe, expect, it } from 'bun:test';
import { serviceUsers } from '../db/schema';
import { toPublicServiceUser } from './service-user.service';

/**
 * Pure mapping tests — no DB. The key behaviour is coercing the numeric
 * `contractedHours` (a JS string out of Drizzle) to a number and Dates to ISO
 * strings, so the API contract stays `z.number()` / string.
 */

type ServiceUserRow = typeof serviceUsers.$inferSelect;

const baseRow: ServiceUserRow = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Ada Lovelace',
  address: '1 Analytical Ave',
  contractedHours: '12.50',
  active: true,
  createdAt: new Date('2026-08-08T00:00:00.000Z'),
  updatedAt: new Date('2026-08-08T00:00:00.000Z'),
};

describe('toPublicServiceUser', () => {
  it('coerces the numeric contractedHours string to a number', () => {
    const result = toPublicServiceUser(baseRow);
    expect(result.contractedHours).toBe(12.5);
    expect(typeof result.contractedHours).toBe('number');
  });

  it('converts timestamps to ISO strings', () => {
    const result = toPublicServiceUser(baseRow);
    expect(result.createdAt).toBe('2026-08-08T00:00:00.000Z');
    expect(result.updatedAt).toBe('2026-08-08T00:00:00.000Z');
  });

  it('preserves a null address', () => {
    const result = toPublicServiceUser({ ...baseRow, address: null });
    expect(result.address).toBeNull();
  });

  it('carries the active flag through', () => {
    expect(toPublicServiceUser({ ...baseRow, active: false }).active).toBe(false);
  });
});
