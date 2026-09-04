import { z } from 'zod';

/**
 * Manager-authored guidance shown to staff on the recording screen, above each comment
 * field — how to write a good activity record and which highlights to capture. It is a
 * single app-wide setting (stored on the settings singleton) that any authenticated user may
 * READ (staff need to see it while recording) but only a MANAGER may edit. It is deliberately
 * separate from `ComplianceSettings`: staff must not see the 🟢/🟡/🔴 thresholds (CLAUDE.md),
 * so this has its own staff-readable endpoint. May be empty (nothing shown).
 */
export const recordingGuidanceSchema = z.object({
  guidance: z.string(),
});

export const recordingGuidanceUpdateSchema = z.object({
  guidance: z.string().max(2000),
});

export type RecordingGuidance = z.infer<typeof recordingGuidanceSchema>;
export type RecordingGuidanceUpdate = z.infer<typeof recordingGuidanceUpdateSchema>;
