import { existsSync } from 'node:fs';
import path from 'node:path';
import { healthStatusSchema, type HealthStatus } from '@care/shared';
import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import { config } from './config';
import { checkDb } from './db';
import { activityTypeRouter } from './routes/activity-type.routes';
import { aiRouter } from './routes/ai.routes';
import { auditRouter } from './routes/audit.routes';
import { authRouter } from './routes/auth.routes';
import { complianceRouter } from './routes/compliance.routes';
import { homeRouter } from './routes/home.routes';
import { serviceUserRouter } from './routes/service-user.routes';
import { staffAssignmentRouter } from './routes/staff-assignment.routes';
import { summaryRouter } from './routes/summary.routes';
import { userRouter } from './routes/user.routes';
import { weekPlanTemplateRouter } from './routes/week-plan-template.routes';
import { weekPlanRouter } from './routes/week-plan.routes';

/** Builds and validates the health response body from a DB-connectivity flag. */
export function buildHealthBody(dbUp: boolean): HealthStatus {
  return healthStatusSchema.parse({ status: 'ok', db: dbUp ? 'up' : 'down' });
}

export const app = express();
app.use(express.json());
app.use(cookieParser());

// Liveness/readiness probe (Render health check). Kept at the root, outside `/api`.
app.get('/health', async (_req, res) => {
  const dbUp = await checkDb();
  res.json(buildHealthBody(dbUp));
});

// Every feature route lives under `/api` so the SPA can own the rest of the path space
// when the client is served from the same origin (e.g. the SPA route `/service-users`
// must not collide with the API `GET /service-users`). The Vite dev proxy forwards
// `/api/*` here unchanged, so dev and prod share the same URL shape.
const api = express.Router();
api.use('/auth', authRouter);
api.use('/users', userRouter);
api.use('/service-users', serviceUserRouter);
api.use('/homes', homeRouter);
api.use('/week-plans', weekPlanRouter);
api.use('/week-plan-templates', weekPlanTemplateRouter);
api.use('/activity-types', activityTypeRouter);
api.use('/assignments', staffAssignmentRouter);
api.use('/compliance-settings', complianceRouter);
api.use('/summary', summaryRouter);
api.use('/audit-logs', auditRouter);
api.use('/ai', aiRouter);
app.use('/api', api);

serveClient(app);

/**
 * In production the same service serves the built React SPA (`apps/client/dist`).
 * Hashed asset files get a long immutable cache; every other GET falls back to
 * `index.html` so client-side routes deep-link and hard-refresh correctly. Mounted
 * only when the build is present, so unit tests and dev (Vite) are untouched.
 */
function serveClient(target: Express): void {
  if (!config.isProd) return;
  const clientDist =
    process.env.CLIENT_DIST_PATH ?? path.resolve(process.cwd(), 'apps/client/dist');
  const indexHtml = path.join(clientDist, 'index.html');
  if (!existsSync(indexHtml)) return;

  target.use(express.static(clientDist, { index: false, maxAge: '1y' }));
  target.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexHtml);
  });
}
