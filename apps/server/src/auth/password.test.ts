import { describe, expect, it } from 'bun:test';
import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('produces a hash that is not the plaintext', async () => {
    const hash = await hashPassword('Password123!');
    expect(hash).not.toBe('Password123!');
    expect(hash.length).toBeGreaterThan(0);
  });

  it('verifies a correct password', async () => {
    const hash = await hashPassword('Password123!');
    expect(await verifyPassword('Password123!', hash)).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('Password123!');
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });
});
