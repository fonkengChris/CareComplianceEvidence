import { describe, expect, it } from 'bun:test';
import {
  type CheckDefinition,
  type CheckSchedule,
  checkDefinitionSchema,
  checkTemplateInputSchema,
  countIssues,
  emptyAnswers,
  isLateAt,
  occurrenceStatus,
  occurrencesBetween,
  openOccurrence,
  validateAnswers,
  weekdayOf,
} from './house-check';

const definition: CheckDefinition = {
  sections: [
    {
      id: 'office',
      title: 'Staff office',
      questions: [
        { id: 'kit', text: 'First aid kit in place?', type: 'YES_NO', flagWhen: 'NO' },
        { id: 'temp', text: 'Office temperature', type: 'YES_NO_NUMBER', unit: '°C' },
      ],
    },
    {
      id: 'rooms',
      repeat: { label: 'Room', defaultCount: 2, keyQuestionId: 'room' },
      questions: [
        { id: 'room', text: 'Room number', type: 'TEXT' },
        {
          id: 'damage',
          text: 'Any damage?',
          type: 'YES_NO',
          flagWhen: 'YES',
          noteRequiredOnFlag: true,
        },
        { id: 'why', text: 'Reason for no consent', type: 'TEXT', optional: true },
      ],
    },
    { id: 'sharps', questions: [{ id: 'knives', text: 'Knives', type: 'COUNT' }] },
  ],
};

const valid = {
  office: [{ kit: { choice: 'YES' as const }, temp: { choice: 'YES' as const, number: 21 } }],
  rooms: [
    { room: { text: '1' }, damage: { choice: 'NO' as const } },
    { room: { text: '2' }, damage: { choice: 'YES' as const, note: 'Door handle loose' } },
  ],
  sharps: [{ knives: { number: 4 } }],
};

describe('checkDefinitionSchema', () => {
  it('accepts a well-formed definition', () => {
    expect(checkDefinitionSchema.safeParse(definition).success).toBe(true);
  });

  it('rejects duplicate question ids and unknown key questions', () => {
    const dup = {
      sections: [
        {
          id: 's',
          repeat: { label: 'Room', defaultCount: 1, keyQuestionId: 'nope' },
          questions: [
            { id: 'a', text: 'A', type: 'YES_NO' },
            { id: 'a', text: 'B', type: 'YES_NO' },
          ],
        },
      ],
    };
    expect(checkDefinitionSchema.safeParse(dup).success).toBe(false);
  });
});

describe('checkTemplateInputSchema', () => {
  it('requires at least one day for a weekly check', () => {
    const base = { name: 'Weekly', scheduleKind: 'WEEKLY' as const, definition };
    expect(checkTemplateInputSchema.safeParse({ ...base, scheduleDays: [] }).success).toBe(false);
    expect(checkTemplateInputSchema.safeParse({ ...base, scheduleDays: ['MON'] }).success).toBe(
      true,
    );
  });
});

describe('validateAnswers', () => {
  it('passes a complete answer set', () => {
    expect(validateAnswers(definition, valid)).toEqual([]);
  });

  it('reports missing answers, missing readings and missing flag notes', () => {
    const problems = validateAnswers(definition, {
      office: [{ temp: { choice: 'YES' } }],
      rooms: [{ room: { text: '1' }, damage: { choice: 'YES' } }],
      sharps: [{ knives: { number: 1.5 } }],
    });
    expect(problems).toHaveLength(4);
    expect(problems.join('\n')).toContain('First aid kit in place?" is required');
    expect(problems.join('\n')).toContain('needs a reading');
    expect(problems.join('\n')).toContain('Room 1: "Any damage?" needs details');
    expect(problems.join('\n')).toContain('needs a whole number');
  });

  it('rejects N/A unless allowed, and a non-repeating section answered twice', () => {
    const problems = validateAnswers(definition, {
      ...valid,
      office: [valid.office[0], valid.office[0]],
      sharps: [{ knives: { number: 0 } }],
      rooms: [{ room: { text: '1' }, damage: { choice: 'NA' } }],
    });
    expect(problems).toEqual([
      'Staff office: wrong number of entries',
      'Room 1: "Any damage?" cannot be N/A',
    ]);
  });
});

describe('countIssues', () => {
  it('counts answers matching flagWhen across repeated blocks', () => {
    expect(countIssues(definition, valid)).toBe(1);
    expect(countIssues(definition, { ...valid, office: [{ kit: { choice: 'NO' } }] })).toBe(2);
  });
});

describe('emptyAnswers', () => {
  it('opens repeat sections with their default count', () => {
    const empty = emptyAnswers(definition);
    expect(empty.rooms).toHaveLength(2);
    expect(empty.office).toHaveLength(1);
  });
});

describe('schedules', () => {
  const daily: CheckSchedule = { scheduleKind: 'DAILY', scheduleDays: [], dueByTime: '12:00' };
  const monThu: CheckSchedule = {
    scheduleKind: 'WEEKLY',
    scheduleDays: ['MON', 'THU'],
    dueByTime: null,
  };

  it('knows weekdays Monday-first', () => {
    expect(weekdayOf('2026-11-23')).toBe('MON');
    expect(weekdayOf('2026-11-29')).toBe('SUN');
  });

  it('lists occurrences in a range', () => {
    expect(occurrencesBetween(monThu, '2026-11-23', '2026-11-29')).toEqual([
      '2026-11-23',
      '2026-11-26',
    ]);
    expect(occurrencesBetween(daily, '2026-11-23', '2026-11-29')).toHaveLength(7);
  });

  it('keeps a weekly occurrence open until the next scheduled day', () => {
    expect(openOccurrence(monThu, '2026-11-25')).toBe('2026-11-23');
    expect(openOccurrence(monThu, '2026-11-26')).toBe('2026-11-26');
    expect(openOccurrence(monThu, '2026-11-30')).toBe('2026-11-30');
    expect(openOccurrence({ ...monThu, scheduleDays: [] }, '2026-11-30')).toBeNull();
  });

  it('marks late after the day or the due-by time on the homes clock', () => {
    // 11:30 UTC on 24 Nov = 11:30 GMT; 12:30 GMT is late.
    expect(isLateAt(daily, '2026-11-24', new Date('2026-11-24T11:30:00Z'))).toBe(false);
    expect(isLateAt(daily, '2026-11-24', new Date('2026-11-24T12:30:00Z'))).toBe(true);
    // In BST, 11:30 UTC is 12:30 London time.
    expect(isLateAt(daily, '2026-07-01', new Date('2026-07-01T11:30:00Z'))).toBe(true);
    expect(isLateAt(monThu, '2026-11-23', new Date('2026-11-23T23:00:00Z'))).toBe(false);
    expect(isLateAt(monThu, '2026-11-23', new Date('2026-11-24T09:00:00Z'))).toBe(true);
  });

  it('derives occurrence status', () => {
    const now = new Date('2026-11-25T10:00:00Z'); // Wednesday
    expect(occurrenceStatus(monThu, '2026-11-23', null, now)).toBe('OVERDUE');
    expect(occurrenceStatus(monThu, '2026-11-26', null, now)).toBe('UPCOMING');
    expect(occurrenceStatus(monThu, '2026-11-19', null, now)).toBe('MISSED');
    expect(occurrenceStatus(monThu, '2026-11-19', { late: true }, now)).toBe('LATE');
    expect(occurrenceStatus(daily, '2026-11-25', null, now)).toBe('DUE');
    expect(occurrenceStatus(daily, '2026-11-24', null, now)).toBe('MISSED');
    expect(occurrenceStatus(daily, '2026-11-25', { late: false }, now)).toBe('DONE');
  });
});
