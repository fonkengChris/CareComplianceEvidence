import { healthStatusSchema } from '@care/shared';
import { describe, expect, it } from 'bun:test';
import { buildHealthBody } from './app';

describe('health', () => {
  it('reports the database as up', () => {
    expect(buildHealthBody(true)).toEqual({ status: 'ok', db: 'up' });
  });

  it('reports the database as down', () => {
    expect(buildHealthBody(false)).toEqual({ status: 'ok', db: 'down' });
  });

  it('produces a body that conforms to the shared schema', () => {
    expect(() => healthStatusSchema.parse(buildHealthBody(true))).not.toThrow();
  });
});
