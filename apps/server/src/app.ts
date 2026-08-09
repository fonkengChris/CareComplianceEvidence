import { healthStatusSchema, type HealthStatus } from '@care/shared';
import cookieParser from 'cookie-parser';
import express from 'express';
import { checkDb } from './db';
import { activityTypeRouter } from './routes/activity-type.routes';
import { auditRouter } from './routes/audit.routes';
import { authRouter } from './routes/auth.routes';
import { complianceRouter } from './routes/compliance.routes';
import { homeRouter } from './routes/home.routes';
import { serviceUserRouter } from './routes/service-user.routes';
import { staffAssignmentRouter } from './routes/staff-assignment.routes';
import { summaryRouter } from './routes/summary.routes';
import { userRouter } from './routes/user.routes';
import { weekPlanRouter } from './routes/week-plan.routes';

/** Builds and validates the health response body from a DB-connectivity flag. */
export function buildHealthBody(dbUp: boolean): HealthStatus {
  return healthStatusSchema.parse({ status: 'ok', db: dbUp ? 'up' : 'down' });
}

export const app = express();
app.use(express.json());
app.use(cookieParser());

app.get('/health', async (_req, res) => {
  const dbUp = await checkDb();
  res.json(buildHealthBody(dbUp));
});

app.use('/auth', authRouter);
app.use('/users', userRouter);
app.use('/service-users', serviceUserRouter);
app.use('/homes', homeRouter);
app.use('/week-plans', weekPlanRouter);
app.use('/activity-types', activityTypeRouter);
app.use('/assignments', staffAssignmentRouter);
app.use('/compliance-settings', complianceRouter);
app.use('/summary', summaryRouter);
app.use('/audit-logs', auditRouter);
