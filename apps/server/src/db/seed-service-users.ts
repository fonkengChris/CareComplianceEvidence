import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { client, db } from './index';
import { homes, serviceUsers } from './schema';
import { readServiceUsersSheet } from './service-users-sheet';

/**
 * Creates every service user in the export (`service_users.csv` at the repo root: columns
 * Name, Home, Active, optionally Contracted Hours), linking each to its home by name.
 * Contracted hours default to 0 when the sheet has none — set the real values in the app.
 *
 * Idempotent like seed-homes: a service user whose name already exists (case-insensitive) is
 * left untouched, so re-running after adding rows only creates the new ones. An unknown home
 * name aborts the whole run before anything is written.
 *
 * Usage (after `bun run db:seed-homes`): bun run db:seed-service-users [path/to/service_users.csv]
 */

const REPO_ROOT = resolve(import.meta.dir, '../../../..');

const sheetArg = process.argv[2];
const sheetPath = sheetArg ? resolve(sheetArg) : resolve(REPO_ROOT, 'service_users.csv');

const rows = readServiceUsersSheet(await readFile(sheetPath, 'utf8'));

const created: { name: string; home: string | null }[] = [];
const skipped: string[] = [];

try {
  await db.transaction(async (tx) => {
    const homeRows = await tx.select({ id: homes.id, name: homes.name }).from(homes);
    const homeIds = new Map(homeRows.map((h) => [h.name.trim().toLowerCase(), h.id]));
    const unknown = [
      ...new Set(
        rows
          .filter((r) => r.homeName && !homeIds.has(r.homeName.toLowerCase()))
          .map((r) => r.homeName),
      ),
    ];
    if (unknown.length)
      throw new Error(
        `Unknown home(s) — run db:seed-homes first or fix the sheet:\n  ${unknown.join('\n  ')}`,
      );

    const existing = await tx.select({ name: serviceUsers.name }).from(serviceUsers);
    const names = new Set(existing.map((s) => s.name.trim().toLowerCase()));
    for (const { homeName, contractedHours, ...su } of rows) {
      if (names.has(su.name.toLowerCase())) {
        skipped.push(su.name);
        continue;
      }
      await tx.insert(serviceUsers).values({
        ...su,
        // numeric column → string for Drizzle.
        contractedHours: String(contractedHours),
        homeId: homeName ? homeIds.get(homeName.toLowerCase()) : null,
      });
      names.add(su.name.toLowerCase());
      created.push({ name: su.name, home: homeName });
    }
  });
} finally {
  await client.end();
}

console.log(`Read ${rows.length} service users from ${sheetPath}`);
if (skipped.length) {
  console.log(`${skipped.length} already exist — left unchanged:`);
  for (const name of skipped) console.log(`  ${name}`);
}
if (created.length) {
  console.log(`${created.length} service user(s) created:`);
  for (const c of created) console.log(`  ${c.name.padEnd(30)} ${c.home ?? '(no home)'}`);
} else {
  console.log('No new service users created.');
}
