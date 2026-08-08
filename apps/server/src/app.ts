import { healthStatusSchema, type HealthStatus } from '@care/shared';
import cookieParser from 'cookie-parser';
import express from 'express';
import { checkDb } from './db';
import { authRouter } from './routes/auth.routes';
import { serviceUserRouter } from './routes/service-user.routes';

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
app.use('/service-users', serviceUserRouter);
