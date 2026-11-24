import { checkTemplateInputSchema } from '@care/shared';
import { describe, expect, it } from 'bun:test';
import { DEFAULT_CHECK_TEMPLATES } from './house-check-defaults';

describe('DEFAULT_CHECK_TEMPLATES', () => {
  it('are all valid template inputs with unique names', () => {
    for (const template of DEFAULT_CHECK_TEMPLATES) {
      const parsed = checkTemplateInputSchema.safeParse(template);
      expect(parsed.success, template.name).toBe(true);
    }
    const names = DEFAULT_CHECK_TEMPLATES.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('covers the five paper forms', () => {
    expect(DEFAULT_CHECK_TEMPLATES.map((t) => t.name)).toEqual([
      'Daily Checks',
      'Weekly Infection Prevention Audit',
      'Room Checks',
      'Sharps Box Check',
      'Weekly Checks Audit',
    ]);
  });
});
