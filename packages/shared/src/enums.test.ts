import { describe, expect, it } from 'bun:test';
import {
  OUTCOMES,
  ROLES,
  WEEKDAYS,
  outcomeSchema,
  roleSchema,
  weekdaySchema,
} from './enums';

describe('shared enums', () => {
  it('ROLES has exactly the three roles', () => {
    expect([...ROLES]).toEqual(['STAFF', 'MANAGER', 'AUDITOR']);
  });

  it('WEEKDAYS covers Mon–Sun', () => {
    expect(WEEKDAYS.length).toBe(7);
    expect([...WEEKDAYS]).toEqual(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);
  });

  it('OUTCOMES has exactly the six outcomes', () => {
    expect([...OUTCOMES]).toEqual([
      'COMPLETED',
      'PARTIALLY_COMPLETED',
      'REFUSED',
      'MISSED',
      'CANCELLED',
      'OTHER',
    ]);
  });

  it('each z.enum accepts every member and rejects bogus values', () => {
    for (const r of ROLES) expect(roleSchema.parse(r)).toBe(r);
    for (const w of WEEKDAYS) expect(weekdaySchema.parse(w)).toBe(w);
    for (const o of OUTCOMES) expect(outcomeSchema.parse(o)).toBe(o);

    expect(roleSchema.safeParse('ADMIN').success).toBe(false);
    expect(weekdaySchema.safeParse('FUNDAY').success).toBe(false);
    expect(outcomeSchema.safeParse('DONE').success).toBe(false);
  });
});
