import { describe, expect, it } from 'bun:test';
import { weekPlanCreateSchema } from './week-plan';

describe('weekPlanCreateSchema', () => {
  const serviceUserId = '11111111-1111-4111-8111-111111111111';

  it('accepts a valid week plan (notes optional)', () => {
    expect(
      weekPlanCreateSchema.safeParse({ serviceUserId, weekCommencing: '2026-08-03' }).success,
    ).toBe(true);
  });

  it('rejects a non-uuid service user id', () => {
    expect(
      weekPlanCreateSchema.safeParse({ serviceUserId: 'nope', weekCommencing: '2026-08-03' })
        .success,
    ).toBe(false);
  });
});
