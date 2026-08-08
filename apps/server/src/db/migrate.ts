import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { client, db } from './index';

/**
 * Applies the committed SQL migrations under `./drizzle` to the configured
 * database. Run via `bun run db:migrate` after `db:generate`. Versioned migrations
 * (not `drizzle-kit push`) are used deliberately for an auditable, reproducible
 * schema history.
 */
await migrate(db, { migrationsFolder: './drizzle' });
await client.end();
console.log('Migrations applied.');
