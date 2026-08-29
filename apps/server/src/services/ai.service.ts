import { createOpenAI } from '@ai-sdk/openai';
import type { PolishRecordInput } from '@care/shared';
import { generateText } from 'ai';
import { config } from '../config';

/**
 * AI "polish" service — rewrites a staff activity comment into clear, professional care-note
 * prose via the Vercel AI SDK (OpenAI, gpt-4.1-nano). This is presentation only: the model
 * must stay faithful to what the staff member wrote and never invent facts, times, or
 * outcomes (those are the authoritative fields, owned elsewhere — CLAUDE.md). The provider
 * is built from the config key so a missing key is a caught, reported condition rather than
 * a boot-time crash.
 */

/** Thrown when the feature is not configured (no API key). Controllers map this to 503. */
export class AiNotConfiguredError extends Error {
  constructor() {
    super('AI polish is not configured');
    this.name = 'AiNotConfiguredError';
  }
}

export function isAiConfigured(): boolean {
  return config.openaiApiKey.length > 0;
}

const SYSTEM_PROMPT = [
  'You are an assistant that improves the wording of care support records written by care staff.',
  'Rewrite the given note as a single, clear, professional care-note in plain UK English.',
  'Fix grammar, spelling and punctuation, and make it concise and objective.',
  'Preserve every fact exactly: never invent, add, remove or change details, times, names or outcomes.',
  'Do not add a heading, quotation marks, or any commentary — return only the rewritten note.',
].join(' ');

/** Rewrite a staff comment; returns the improved text. */
export async function polishActivityComment(input: PolishRecordInput): Promise<string> {
  if (!isAiConfigured()) throw new AiNotConfiguredError();

  const openai = createOpenAI({ apiKey: config.openaiApiKey });

  const context = [
    input.activity ? `Activity: ${input.activity}` : null,
    input.outcome ? `Outcome: ${input.outcome}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const prompt = [context && `Context (do not restate verbatim):\n${context}`, `Note:\n${input.comment}`]
    .filter(Boolean)
    .join('\n\n');

  const { text } = await generateText({
    model: openai(config.aiPolishModel),
    system: SYSTEM_PROMPT,
    prompt,
    temperature: 0.3,
  });

  return text.trim();
}
