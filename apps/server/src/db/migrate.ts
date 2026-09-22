import path from 'node:path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { client, db } from './index';

/**
 * Applies the committed SQL migrations under `apps/server/drizzle` to the configured
 * database. Versioned migrations (not `drizzle-kit push`) are used deliberately for an
 * auditable, reproducible schema history.
 *
 * The folder is resolved relative to THIS module rather than `process.cwd()` so it works
 * both when invoked as `bun run db:migrate` (cwd = apps/server) and when imported by the
 * server entrypoint at container start (cwd = repo root in the Docker image).
 */
const migrationsFolder = path.resolve(import.meta.dir, '../../drizzle');

/** Apply all pending migrations. Idempotent — already-applied migrations are skipped. */
export async function runMigrations(): Promise<void> {
  await migrate(db, { migrationsFolder });
}

// Run directly (`bun run db:migrate`): apply, then close the pool so the process exits.
if (import.meta.main) {
  await runMigrations();
  await client.end();
  console.log('Migrations applied.');
}
