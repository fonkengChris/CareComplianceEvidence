import { healthStatusSchema, type HealthStatus } from '@care/shared';
import express from 'express';
import { checkDb } from './db';

/** Builds and validates the health response body from a DB-connectivity flag. */
export function buildHealthBody(dbUp: boolean): HealthStatus {
  return healthStatusSchema.parse({ status: 'ok', db: dbUp ? 'up' : 'down' });
}

export const app = express();
app.use(express.json());

app.get('/health', async (_req, res) => {
  const dbUp = await checkDb();
  res.json(buildHealthBody(dbUp));
});
