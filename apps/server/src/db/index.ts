import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql:///care_tracker?host=/var/run/postgresql';

/**
 * postgres.js does not honour libpq's `?host=/path` unix-socket parameter when it
 * appears in a connection URL, so pull it out and pass it as an explicit option.
 * A normal TCP URL (as used in CI) is handed to postgres.js untouched.
 */
function createClient(url: string): postgres.Sql {
  const parsed = new URL(url);
  const socketHost = parsed.searchParams.get('host');
  if (socketHost?.startsWith('/')) {
    return postgres({
      host: socketHost,
      database: decodeURIComponent(parsed.pathname.replace(/^\//, '')) || undefined,
      username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    });
  }
  return postgres(url);
}

export const client = createClient(connectionString);
export const db = drizzle(client);

/** Returns true if a trivial round-trip to Postgres succeeds. */
export async function checkDb(): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}
