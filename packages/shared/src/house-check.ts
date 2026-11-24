import { z } from 'zod';
import { WEEKDAYS, weekdaySchema, type Weekday } from './enums';

/**
 * House checks: home-level audits (daily checks, sharps, room checks…) that staff on shift
 * complete on a schedule. A manager-editable TEMPLATE defines the questions and one schedule
 * that applies to every home; each completed occurrence is an immutable SUBMISSION, signed
 * by the logged-in staff member and rendered to a PDF for the evidence store.
 *
 * Dates are `YYYY-MM-DD`; weekdays are Monday-first (`WEEKDAYS`). "Today" and due-by times
 * are judged on the homes' clock (Europe/London), see `londonNow`.
 */

export const CHECK_QUESTION_TYPES = ['YES_NO', 'YES_NO_NUMBER', 'COUNT', 'NUMBER', 'TEXT'] as const;
export const CHECK_SCHEDULE_KINDS = ['DAILY', 'WEEKLY'] as const;
export const CHECK_CHOICES = ['YES', 'NO', 'NA'] as const;
export const CHECK_OCCURRENCE_STATUSES = [
  'DONE',
  'LATE',
  'DUE',
  'OVERDUE',
  'MISSED',
  'UPCOMING',
] as const;

export const checkQuestionTypeSchema = z.enum(CHECK_QUESTION_TYPES);
export const checkScheduleKindSchema = z.enum(CHECK_SCHEDULE_KINDS);
export const checkChoiceSchema = z.enum(CHECK_CHOICES);
export const checkOccurrenceStatusSchema = z.enum(CHECK_OCCURRENCE_STATUSES);

export type CheckQuestionType = z.infer<typeof checkQuestionTypeSchema>;
export type CheckScheduleKind = z.infer<typeof checkScheduleKindSchema>;
export type CheckChoice = z.infer<typeof checkChoiceSchema>;
export type CheckOccurrenceStatus = z.infer<typeof checkOccurrenceStatusSchema>;

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');
const idString = z.string().trim().min(1).max(64);

/**
 * One row of a check form. `flagWhen` encodes the paper form's "If NO, report it to the
 * Management": a matching answer counts as an ISSUE (highlighted on screen and in the PDF,
 * never a notification). `optional` questions may be left blank (e.g. "if no consent, why?").
 */
export const checkQuestionSchema = z.object({
  id: idString,
  text: z.string().trim().min(1).max(500),
  guidance: z.string().trim().max(1000).optional(),
  type: checkQuestionTypeSchema,
  unit: z.string().trim().max(20).optional(),
  allowNA: z.boolean().optional(),
  optional: z.boolean().optional(),
  flagWhen: z.enum(['YES', 'NO']).optional(),
  noteRequiredOnFlag: z.boolean().optional(),
});

/**
 * A titled group of questions. `repeat` makes it a block staff fill once per thing checked
 * (Room Checks: one block per room); `defaultCount` is how many blocks the form opens with and
 * `keyQuestionId` names the question that labels each block (the room number).
 */
export const checkSectionSchema = z.object({
  id: idString,
  title: z.string().trim().max(200).optional(),
  repeat: z
    .object({
      label: z.string().trim().min(1).max(50),
      defaultCount: z.number().int().min(1).max(50),
      keyQuestionId: idString.optional(),
    })
    .optional(),
  questions: z.array(checkQuestionSchema).min(1).max(100),
});

export const checkDefinitionSchema = z
  .object({ sections: z.array(checkSectionSchema).min(1).max(30) })
  .superRefine((def, ctx) => {
    const sectionIds = new Set<string>();
    for (const section of def.sections) {
      if (sectionIds.has(section.id)) {
        ctx.addIssue({ code: 'custom', message: `Duplicate section id ${section.id}` });
      }
      sectionIds.add(section.id);
      const questionIds = new Set(section.questions.map((q) => q.id));
      if (questionIds.size !== section.questions.length) {
        ctx.addIssue({ code: 'custom', message: `Duplicate question id in ${section.id}` });
      }
      const key = section.repeat?.keyQuestionId;
      if (key && !questionIds.has(key)) {
        ctx.addIssue({ code: 'custom', message: `Unknown key question ${key}` });
      }
    }
  });

export type CheckQuestion = z.infer<typeof checkQuestionSchema>;
export type CheckSection = z.infer<typeof checkSectionSchema>;
export type CheckDefinition = z.infer<typeof checkDefinitionSchema>;

/**
 * One answer. Which fields matter depends on the question type: `choice` for YES_NO(_NUMBER),
 * `number` for YES_NO_NUMBER/COUNT/NUMBER, `text` for TEXT. `note` is always allowed.
 */
export const checkAnswerSchema = z.object({
  choice: checkChoiceSchema.optional(),
  number: z.number().finite().optional(),
  text: z.string().trim().max(2000).optional(),
  note: z.string().trim().max(2000).optional(),
});

/** Answers keyed by section id → one record per block (a single block unless repeated). */
export const checkAnswersSchema = z.record(
  z.string(),
  z.array(z.record(z.string(), checkAnswerSchema)).max(50),
);

export type CheckAnswer = z.infer<typeof checkAnswerSchema>;
export type CheckAnswers = z.infer<typeof checkAnswersSchema>;

/** Body for creating/updating a template. A weekly check must run on at least one day. */
export const checkTemplateInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    scheduleKind: checkScheduleKindSchema,
    scheduleDays: z.array(weekdaySchema).max(7).default([]),
    dueByTime: timeString.nullable().optional(),
    definition: checkDefinitionSchema,
  })
  .refine((t) => t.scheduleKind === 'DAILY' || t.scheduleDays.length > 0, {
    message: 'Pick at least one day for a weekly check',
    path: ['scheduleDays'],
  });

export const checkTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  scheduleKind: checkScheduleKindSchema,
  scheduleDays: z.array(weekdaySchema),
  dueByTime: z.string().nullable(),
  definition: checkDefinitionSchema,
  version: z.number().int(),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const checkTemplateActiveSchema = z.object({ active: z.boolean() });

/** Body for submitting one occurrence of a check at a home. */
export const checkSubmissionInputSchema = z.object({
  templateId: z.string().uuid(),
  homeId: z.string().uuid(),
  dueDate: dateString,
  answers: checkAnswersSchema,
});

/** A signed submission (PDF bytes are served separately). `definition` is the snapshot used. */
export const checkSubmissionSchema = z.object({
  id: z.string().uuid(),
  templateId: z.string().uuid(),
  templateName: z.string(),
  templateVersion: z.number().int(),
  homeId: z.string().uuid(),
  homeName: z.string(),
  dueDate: dateString,
  definition: checkDefinitionSchema,
  answers: checkAnswersSchema,
  issueCount: z.number().int(),
  late: z.boolean(),
  submittedById: z.string().uuid().nullable(),
  submittedByName: z.string().nullable(),
  submittedAt: z.string(),
});

/** One scheduled occurrence of a check at a home, with its status. */
export const checkOccurrenceSchema = z.object({
  templateId: z.string().uuid(),
  templateName: z.string(),
  dueDate: dateString,
  dueByTime: z.string().nullable(),
  status: checkOccurrenceStatusSchema,
  submissionId: z.string().uuid().nullable(),
  submittedByName: z.string().nullable(),
  submittedAt: z.string().nullable(),
  issueCount: z.number().int().nullable(),
});

/** Manager grid: each check's occurrences in one Mon–Sun week at one home. */
export const checkWeekGridSchema = z.object({
  homeId: z.string().uuid(),
  weekCommencing: dateString,
  rows: z.array(
    z.object({
      templateId: z.string().uuid(),
      templateName: z.string(),
      occurrences: z.array(checkOccurrenceSchema),
    }),
  ),
});

export const checkWeekQuerySchema = z.object({ weekCommencing: dateString });

/** How far back the manager overview looks for missed and flagged checks. */
export const CHECK_OVERVIEW_DAYS = 7;

/**
 * Manager overview across every active home: each home's checks open right now, how many it
 * missed in the last `CHECK_OVERVIEW_DAYS` days, and recent submissions with issues to report.
 */
export const checkOverviewSchema = z.object({
  since: dateString,
  homes: z.array(
    z.object({
      homeId: z.string().uuid(),
      homeName: z.string(),
      open: z.array(checkOccurrenceSchema),
      missed: z.array(checkOccurrenceSchema),
      flagged: z.array(checkOccurrenceSchema),
    }),
  ),
});

export type CheckTemplateInput = z.infer<typeof checkTemplateInputSchema>;
export type CheckTemplate = z.infer<typeof checkTemplateSchema>;
export type CheckSubmissionInput = z.infer<typeof checkSubmissionInputSchema>;
export type CheckSubmission = z.infer<typeof checkSubmissionSchema>;
export type CheckOccurrence = z.infer<typeof checkOccurrenceSchema>;
export type CheckWeekGrid = z.infer<typeof checkWeekGridSchema>;
export type CheckOverview = z.infer<typeof checkOverviewSchema>;

// ---------------------------------------------------------------------------------------------
// Answers: validation and issues
// ---------------------------------------------------------------------------------------------

/** Whether this answer trips the question's "report to management" flag. */
export function isFlagged(question: CheckQuestion, answer: CheckAnswer | undefined): boolean {
  return question.flagWhen !== undefined && answer?.choice === question.flagWhen;
}

function hasText(s: string | undefined): boolean {
  return s !== undefined && s.trim().length > 0;
}

function answerProblem(question: CheckQuestion, answer: CheckAnswer | undefined): string | null {
  const blank =
    answer === undefined ||
    (answer.choice === undefined && answer.number === undefined && !hasText(answer.text));
  if (blank) return question.optional ? null : 'is required';
  switch (question.type) {
    case 'YES_NO':
      if (answer.choice === undefined) return 'needs Yes or No';
      if (answer.choice === 'NA' && !question.allowNA) return 'cannot be N/A';
      break;
    case 'YES_NO_NUMBER':
      if (answer.choice === undefined) return 'needs Yes or No';
      if (answer.choice === 'NA' && !question.allowNA) return 'cannot be N/A';
      if (answer.choice !== 'NA' && answer.number === undefined) return 'needs a reading';
      break;
    case 'COUNT':
      if (answer.number === undefined || !Number.isInteger(answer.number) || answer.number < 0) {
        return 'needs a whole number';
      }
      break;
    case 'NUMBER':
      if (answer.number === undefined) return 'needs a number';
      break;
    case 'TEXT':
      if (!hasText(answer.text) && !question.optional) return 'is required';
      break;
  }
  if (question.noteRequiredOnFlag && isFlagged(question, answer) && !hasText(answer.note)) {
    return 'needs details (report it to the management)';
  }
  return null;
}

/**
 * Problems with a set of answers against a definition, as human-readable strings (empty when
 * valid). Non-repeating sections need exactly one block; repeating ones one or more.
 */
export function validateAnswers(definition: CheckDefinition, answers: CheckAnswers): string[] {
  const problems: string[] = [];
  const known = new Set(definition.sections.map((s) => s.id));
  for (const id of Object.keys(answers)) {
    if (!known.has(id)) problems.push(`Unknown section ${id}`);
  }
  for (const section of definition.sections) {
    const blocks = answers[section.id] ?? [];
    const label = section.title ?? section.id;
    if (section.repeat ? blocks.length < 1 : blocks.length !== 1) {
      problems.push(`${label}: wrong number of entries`);
      continue;
    }
    blocks.forEach((block, i) => {
      for (const question of section.questions) {
        const problem = answerProblem(question, block[question.id]);
        if (problem) {
          const where = section.repeat ? `${section.repeat.label} ${i + 1}: ` : '';
          problems.push(`${where}"${question.text}" ${problem}`);
        }
      }
    });
  }
  return problems;
}

/** How many answers trip a "report to management" flag. */
export function countIssues(definition: CheckDefinition, answers: CheckAnswers): number {
  let n = 0;
  for (const section of definition.sections) {
    for (const block of answers[section.id] ?? []) {
      for (const question of section.questions) {
        if (isFlagged(question, block[question.id])) n += 1;
      }
    }
  }
  return n;
}

// ---------------------------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------------------------

export type CheckSchedule = {
  scheduleKind: CheckScheduleKind;
  scheduleDays: readonly Weekday[];
  dueByTime: string | null;
};

/** Shift a `YYYY-MM-DD` date by whole days. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The Monday-first weekday of a `YYYY-MM-DD` date. */
export function weekdayOf(date: string): Weekday {
  return WEEKDAYS[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7];
}

export function isScheduledOn(schedule: CheckSchedule, date: string): boolean {
  return schedule.scheduleKind === 'DAILY' || schedule.scheduleDays.includes(weekdayOf(date));
}

/** Every scheduled date from `from` to `to` inclusive. */
export function occurrencesBetween(schedule: CheckSchedule, from: string, to: string): string[] {
  const dates: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (isScheduledOn(schedule, d)) dates.push(d);
  }
  return dates;
}

/**
 * The occurrence that can be completed today: the latest scheduled date on or before today.
 * An occurrence stays open until the next scheduled date, so a daily check is open only on its
 * own day while a Monday weekly check can still be done (late) on Tuesday. Null if never due.
 */
export function openOccurrence(schedule: CheckSchedule, today: string): string | null {
  for (let i = 0; i < 7; i += 1) {
    const d = addDays(today, -i);
    if (isScheduledOn(schedule, d)) return d;
  }
  return null;
}

/** Date + HH:MM wall-clock time in Europe/London — the homes' clock. */
export function londonNow(now: Date = new Date()): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
}

/** Whether completing `dueDate`'s occurrence at `at` is late (after the day, or its due-by time). */
export function isLateAt(schedule: CheckSchedule, dueDate: string, at: Date): boolean {
  const { date, time } = londonNow(at);
  if (date > dueDate) return true;
  return date === dueDate && schedule.dueByTime !== null && time > schedule.dueByTime;
}

/**
 * Status of one occurrence. With a submission it is DONE or LATE; otherwise UPCOMING in the
 * future, DUE/OVERDUE while it is the open occurrence, and MISSED once the next one has begun.
 */
export function occurrenceStatus(
  schedule: CheckSchedule,
  dueDate: string,
  submission: { late: boolean } | null,
  now: Date = new Date(),
): CheckOccurrenceStatus {
  if (submission) return submission.late ? 'LATE' : 'DONE';
  const today = londonNow(now).date;
  if (dueDate > today) return 'UPCOMING';
  if (dueDate !== openOccurrence(schedule, today)) return 'MISSED';
  return isLateAt(schedule, dueDate, now) ? 'OVERDUE' : 'DUE';
}

/** A blank answer set for a definition: one block per section (repeat sections get defaultCount). */
export function emptyAnswers(definition: CheckDefinition): CheckAnswers {
  const answers: CheckAnswers = {};
  for (const section of definition.sections) {
    answers[section.id] = Array.from({ length: section.repeat?.defaultCount ?? 1 }, () => ({}));
  }
  return answers;
}

const CHOICE_LABELS: Record<CheckChoice, string> = { YES: 'Yes', NO: 'No', NA: 'N/A' };

/** Display text for an answer (screen and PDF), e.g. "Yes — 21 °C", "4", "—" when blank. */
export function formatCheckAnswer(
  question: CheckQuestion,
  answer: CheckAnswer | undefined,
): string {
  if (!answer) return '—';
  const unit = question.unit ? ` ${question.unit}` : '';
  const number = answer.number !== undefined ? `${answer.number}${unit}` : '';
  switch (question.type) {
    case 'YES_NO':
      return answer.choice ? CHOICE_LABELS[answer.choice] : '—';
    case 'YES_NO_NUMBER': {
      const choice = answer.choice ? CHOICE_LABELS[answer.choice] : '—';
      return number ? `${choice} — ${number}` : choice;
    }
    case 'COUNT':
    case 'NUMBER':
      return number || '—';
    case 'TEXT':
      return answer.text?.trim() || '—';
  }
}

/** The label of one block of a section: "Room 3 — 12B" for repeats, else the section title. */
export function blockLabel(
  section: CheckSection,
  block: Record<string, CheckAnswer>,
  index: number,
): string {
  if (!section.repeat) return section.title ?? '';
  const key = section.repeat.keyQuestionId ? block[section.repeat.keyQuestionId]?.text?.trim() : '';
  return `${section.repeat.label} ${index + 1}${key ? ` — ${key}` : ''}`;
}
