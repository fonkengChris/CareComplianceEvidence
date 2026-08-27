import type { DayEntryInput } from '@care/shared';
import { describe, expect, it } from 'bun:test';
import {
  buildTemplateInserts,
  toPublicTemplate,
  toPublicTemplateEntry,
} from './week-plan-template.service';
import { templateDayEntries, weekPlanTemplates } from '../db/schema';

/**
 * Pure tests — no DB. They cover the mapping helpers and the insert builder, which must
 * inject the templateId and carry only plan-time fields (a template never has
 * timeSpent/outcome — those are staff-recorded on the generated week).
 */

type TemplateRow = typeof weekPlanTemplates.$inferSelect;
type TemplateEntryRow = typeof templateDayEntries.$inferSelect;

const templateRow: TemplateRow = {
  id: '11111111-1111-4111-8111-111111111111',
  serviceUserId: '22222222-2222-4222-8222-222222222222',
  notes: null,
  createdAt: new Date('2026-08-08T00:00:00.000Z'),
  updatedAt: new Date('2026-08-08T00:00:00.000Z'),
};

const entryRow: TemplateEntryRow = {
  id: '33333333-3333-4333-8333-333333333333',
  templateId: templateRow.id,
  day: 'MON',
  lineNumber: 1,
  activityTypeId: '44444444-4444-4444-8444-444444444444',
  description: 'Shopping trip',
  timeAllocated: 60,
  createdAt: new Date('2026-08-08T00:00:00.000Z'),
  updatedAt: new Date('2026-08-08T00:00:00.000Z'),
};

describe('toPublicTemplate', () => {
  it('maps a row to the public shape with ISO timestamps', () => {
    expect(toPublicTemplate(templateRow)).toEqual({
      id: templateRow.id,
      serviceUserId: templateRow.serviceUserId,
      notes: null,
      createdAt: '2026-08-08T00:00:00.000Z',
      updatedAt: '2026-08-08T00:00:00.000Z',
    });
  });
});

describe('toPublicTemplateEntry', () => {
  it('maps a template entry row (no timeSpent/outcome fields)', () => {
    const dto = toPublicTemplateEntry(entryRow);
    expect(dto.day).toBe('MON');
    expect(dto.timeAllocated).toBe(60);
    expect(dto).not.toHaveProperty('timeSpent');
    expect(dto).not.toHaveProperty('outcome');
  });
});

describe('buildTemplateInserts', () => {
  it('injects the templateId and defaults optional fields to null', () => {
    const inputs: DayEntryInput[] = [
      { day: 'TUE', lineNumber: 2, activityTypeId: entryRow.activityTypeId! },
    ];
    expect(buildTemplateInserts('tpl-1', inputs)).toEqual([
      {
        templateId: 'tpl-1',
        day: 'TUE',
        lineNumber: 2,
        activityTypeId: entryRow.activityTypeId,
        description: null,
        timeAllocated: null,
      },
    ]);
  });

  it('carries description and allocated minutes through when present', () => {
    const inputs: DayEntryInput[] = [
      { day: 'WED', lineNumber: 1, activityTypeId: null, description: 'Walk', timeAllocated: 30 },
    ];
    expect(buildTemplateInserts('tpl-2', inputs)[0]).toMatchObject({
      description: 'Walk',
      timeAllocated: 30,
      activityTypeId: null,
    });
  });
});
