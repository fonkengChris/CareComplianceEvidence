import { describe, expect, it } from 'bun:test';
import { nextStatus } from './auditor-access.service';

/**
 * Pure transition-table tests — no DB. Only a PENDING request can be approved, rejected or
 * withdrawn; only an APPROVED grant can be revoked; nothing moves out of REJECTED/REVOKED.
 */
describe('nextStatus', () => {
  it('approves, rejects or withdraws a pending request', () => {
    expect(nextStatus('PENDING', 'APPROVE')).toBe('APPROVED');
    expect(nextStatus('PENDING', 'REJECT')).toBe('REJECTED');
    expect(nextStatus('PENDING', 'WITHDRAW')).toBe('REJECTED');
  });

  it('cannot revoke a pending request', () => {
    expect(nextStatus('PENDING', 'REVOKE')).toBeNull();
  });

  it('only revokes an approved grant', () => {
    expect(nextStatus('APPROVED', 'REVOKE')).toBe('REVOKED');
    expect(nextStatus('APPROVED', 'APPROVE')).toBeNull();
    expect(nextStatus('APPROVED', 'REJECT')).toBeNull();
    expect(nextStatus('APPROVED', 'WITHDRAW')).toBeNull();
  });

  it('treats rejected and revoked as final', () => {
    for (const action of ['APPROVE', 'REJECT', 'REVOKE', 'WITHDRAW'] as const) {
      expect(nextStatus('REJECTED', action)).toBeNull();
      expect(nextStatus('REVOKED', action)).toBeNull();
    }
  });
});
