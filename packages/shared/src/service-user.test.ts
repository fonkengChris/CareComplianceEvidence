import { describe, expect, it } from 'bun:test';
import { serviceUserCreateSchema } from './service-user';

describe('serviceUserCreateSchema', () => {
  const valid = { name: 'Alice Morgan', contractedHours: 20 };

  it('accepts a valid service user (address optional)', () => {
    expect(serviceUserCreateSchema.safeParse(valid).success).toBe(true);
    expect(serviceUserCreateSchema.safeParse({ ...valid, address: '12 Elm St' }).success).toBe(
      true,
    );
  });

  it('rejects a missing name', () => {
    expect(serviceUserCreateSchema.safeParse({ contractedHours: 20 }).success).toBe(false);
    expect(serviceUserCreateSchema.safeParse({ ...valid, name: '' }).success).toBe(false);
  });

  it('rejects negative or non-numeric contracted hours', () => {
    expect(serviceUserCreateSchema.safeParse({ ...valid, contractedHours: -1 }).success).toBe(
      false,
    );
    expect(
      serviceUserCreateSchema.safeParse({ ...valid, contractedHours: '20' }).success,
    ).toBe(false);
  });
});
