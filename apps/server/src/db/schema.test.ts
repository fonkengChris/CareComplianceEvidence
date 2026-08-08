import { OUTCOMES, ROLES, WEEKDAYS } from '@care/shared';
import { describe, expect, it } from 'bun:test';
import { outcomeEnum, roleEnum, weekdayEnum } from './schema';

/**
 * Mechanically proves the DB pgEnums are fed from the shared value tuples, so the
 * Drizzle enums and the Zod `z.enum` schemas can never drift. Pure — importing the
 * schema pulls in drizzle-orm only, with no database connection.
 */
describe('pgEnum ↔ shared array parity', () => {
  it('role enum matches ROLES', () => {
    expect(roleEnum.enumValues).toEqual([...ROLES]);
  });

  it('weekday enum matches WEEKDAYS', () => {
    expect(weekdayEnum.enumValues).toEqual([...WEEKDAYS]);
  });

  it('outcome enum matches OUTCOMES', () => {
    expect(outcomeEnum.enumValues).toEqual([...OUTCOMES]);
  });
});
