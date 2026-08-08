import { describe, expect, it } from 'bun:test';
import { userSchema } from './user';

describe('userSchema', () => {
  const valid = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Sam Staff',
    email: 'sam@example.com',
    role: 'STAFF',
    active: true,
    createdAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
  };

  it('accepts a valid user', () => {
    expect(userSchema.safeParse(valid).success).toBe(true);
  });

  it('never exposes passwordHash (security invariant)', () => {
    const parsed = userSchema.parse({ ...valid, passwordHash: 'super-secret-hash' });
    expect('passwordHash' in parsed).toBe(false);
  });
});
