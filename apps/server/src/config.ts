/**
 * Centralised, env-driven configuration. Auth secrets and token lifetimes are read
 * here once — never hardcoded at call sites (CLAUDE.md rule). In production a real
 * `JWT_SECRET` is mandatory; outside production a clearly-labelled dev fallback keeps
 * local setup frictionless.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Load the monorepo-root `.env` when present. The server is usually launched from its own
 * workspace directory (`bun --watch src/index.ts` under `apps/server`, via
 * `bun run --filter '*' dev`), where Bun's automatic `.env` lookup misses the shared root
 * file that holds `OPENAI_API_KEY`, `DATABASE_URL`, etc. We fill only keys that aren't
 * already set, so real platform/shell env always wins (e.g. Render in production, where no
 * file exists and this is a harmless no-op). Kept dependency-free (no dotenv).
 */
function loadRootEnv(): void {
  const rootEnv = path.resolve(import.meta.dir, '../../../.env');
  if (!existsSync(rootEnv)) return;
  for (const line of readFileSync(rootEnv, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (key in process.env) continue; // never override an already-set value
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadRootEnv();

const isProd = process.env.NODE_ENV === 'production';

const DEV_JWT_SECRET = 'dev-insecure-jwt-secret-change-me';

function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length > 0) return secret;
  if (isProd) {
    throw new Error('JWT_SECRET is required in production but was not set.');
  }
  return DEV_JWT_SECRET;
}

export const config = {
  isProd,
  // HMAC signing key for access-token JWTs.
  jwtSecret: resolveJwtSecret(),
  // Short-lived access token; anything `jose` accepts (e.g. "15m", "1h").
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? '15m',
  // Longer-lived, server-side, revocable refresh token.
  refreshTokenTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30),
  // OpenAI API key powering the "polish activity record" feature. Optional: absent means
  // the feature is disabled and the endpoint answers 503 rather than crashing at boot.
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  // Small, cheap model for the short rewrite task. Overridable, never inlined at the call site.
  aiPolishModel: process.env.AI_POLISH_MODEL ?? 'gpt-4.1-nano',
  // Speech-to-text model for dictated activity notes. Same OpenAI key as polish; overridable.
  aiTranscribeModel: process.env.AI_TRANSCRIBE_MODEL ?? 'gpt-4o-mini-transcribe',
  // Cap on uploaded audio size (bytes) to keep the transcription endpoint bounded.
  aiTranscribeMaxBytes: Number(process.env.AI_TRANSCRIBE_MAX_BYTES ?? 25 * 1024 * 1024),
  // Hard cap on a shift session's length: home-path access lapses automatically after this
  // many hours even if the staff member forgets to tap "End shift".
  shiftMaxHours: Number(process.env.SHIFT_MAX_HOURS ?? 12),
  // How long each on-site check-in code (shown on a home's paired display) stays current. The
  // previous code is still accepted, so a staff member always has at least this long to type it.
  checkInCodeWindowSeconds: Number(process.env.CHECK_IN_CODE_WINDOW_SECONDS ?? 60),
  // Wrong check-in codes a staff member may enter per window before shift start is refused
  // until the window passes (brute-force guard for the 6-digit code).
  checkInMaxFailures: Number(process.env.CHECK_IN_MAX_FAILURES ?? 5),
  checkInFailureWindowMinutes: Number(process.env.CHECK_IN_FAILURE_WINDOW_MINUTES ?? 15),
  // GDPR minimisation: STAFF/KEY_WORKER open and record week plans only from the current week
  // back this many weeks (future weeks too). Managers and key-worker reports are unaffected.
  staffHistoryWeeks: Number(process.env.STAFF_HISTORY_WEEKS ?? 2),
  // Default length of a direct staff↔service-user assignment before it must be renewed.
  assignmentDefaultDays: Number(process.env.ASSIGNMENT_DEFAULT_DAYS ?? 90),
  // Cap on one uploaded evidence photo (bytes). The client downscales to ~1600px JPEG first,
  // so real uploads are a few hundred KB; this bounds what lands in Postgres.
  photoMaxBytes: Number(process.env.PHOTO_MAX_BYTES ?? 5 * 1024 * 1024),
  // Cap on photos attached to one recorded activity, so storage stays bounded.
  photoMaxPerEntry: Number(process.env.PHOTO_MAX_PER_ENTRY ?? 10),
  // Cloudflare R2 (S3-compatible) bucket for uploaded files. Optional: with no credentials
  // files stay in Postgres. `R2_ENDPOINT` overrides the endpoint derived from the account id
  // (e.g. an EU-jurisdiction bucket: https://<account>.eu.r2.cloudflarestorage.com).
  r2: {
    accountId: process.env.R2_ACCOUNT_ID ?? '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
    bucket: process.env.R2_BUCKET ?? '',
    endpoint: process.env.R2_ENDPOINT ?? '',
  },
} as const;
