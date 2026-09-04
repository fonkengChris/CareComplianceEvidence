import express, { Router } from 'express';
import { config } from '../config';
import * as aiController from '../controllers/ai.controller';
import { requireAuth, requireRole } from '../middleware/auth';

/**
 * AI routes. The "polish activity record" and "dictate" helpers are available to the roles
 * that actually record — STAFF and MANAGER; AUDITOR is read-only and excluded. Enforced here
 * on the server, never by UI hiding alone (CLAUDE.md).
 */
export const aiRouter = Router();

aiRouter.post('/polish', requireAuth, requireRole('STAFF', 'MANAGER'), aiController.polish);

// Dictation uploads raw audio bytes (not JSON), so parse the body as a size-capped Buffer.
// `type: () => true` accepts whatever audio mime the browser's MediaRecorder produces
// (webm/opus on Chrome, mp4 on Safari).
aiRouter.post(
  '/transcribe',
  requireAuth,
  requireRole('STAFF', 'MANAGER'),
  express.raw({ type: () => true, limit: config.aiTranscribeMaxBytes }),
  aiController.transcribe,
);
