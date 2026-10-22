import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { client, db } from './index';
import { homes } from './schema';
import { readHomesSheet } from './homes-sheet';

/**
 * Creates every home in the homes export (`homes.csv` at the repo root: columns Name,
 * Address, City, Postcode, …, Active). The address is stored as one line
 * ("Address, City, Postcode").
 *
 * Idempotent like seed-staff: a home whose name already exists (case-insensitive) is left
 * untouched, so re-running after adding rows only creates the new ones. `homes.name` has no
 * unique constraint, so the match is done here rather than with ON CONFLICT.
 *
 * Usage (after `bun run db:migrate`): bun run db:seed-homes [path/to/homes.csv]
 */

const REPO_ROOT = resolve(import.meta.dir, '../../../..');

const sheetArg = process.argv[2];
const sheetPath = sheetArg ? resolve(sheetArg) : resolve(REPO_ROOT, 'homes.csv');

const rows = readHomesSheet(await readFile(sheetPath, 'utf8'));

const created: string[] = [];
const skipped: string[] = [];

try {
  await db.transaction(async (tx) => {
    const existing = await tx.select({ name: homes.name }).from(homes);
    const names = new Set(existing.map((h) => h.name.trim().toLowerCase()));
    for (const home of rows) {
      if (names.has(home.name.toLowerCase())) {
        skipped.push(home.name);
        continue;
      }
      await tx.insert(homes).values(home);
      names.add(home.name.toLowerCase());
      created.push(home.name);
    }
  });
} finally {
  await client.end();
}

console.log(`Read ${rows.length} homes from ${sheetPath}`);
if (skipped.length) {
  console.log(`${skipped.length} already exist — left unchanged:`);
  for (const name of skipped) console.log(`  ${name}`);
}
if (created.length) {
  console.log(`${created.length} home(s) created:`);
  for (const name of created) console.log(`  ${name}`);
} else {
  console.log('No new homes created.');
}
