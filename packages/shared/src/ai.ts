import { z } from 'zod';
import { outcomeSchema } from './enums';

/**
 * AI "polish" of a staff activity record. The model rewrites the free-text comment into
 * clearer, professional care-note prose — it never changes the authoritative fields
 * (time spent, outcome); those are passed only as read-only context for a faithful
 * rewrite. Request/response shapes are shared so client and server validate the same shape.
 */
export const polishRecordSchema = z.object({
  // The staff comment to improve. Required and non-empty — there is nothing to polish
  // otherwise, and the client disables the button when the comment is blank.
  comment: z.string().trim().min(1).max(2000),
  // Optional context so the rewrite stays faithful to what actually happened.
  activity: z.string().trim().max(200).optional(),
  outcome: outcomeSchema.optional(),
});

export type PolishRecordInput = z.infer<typeof polishRecordSchema>;

export const polishedRecordSchema = z.object({
  comment: z.string(),
});

export type PolishedRecord = z.infer<typeof polishedRecordSchema>;
