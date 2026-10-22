import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { generateStrongPassword, hashPassword } from '../auth/password';
import { client, db } from './index';
import { users } from './schema';
import { readStaffSheet } from './staff-sheet';

/**
 * Creates a login for every person in the staff roster spreadsheet (`staff-credentials.ods`
 * at the repo root: columns name, email, role). Each new account gets its own random
 * strong password, printed once and stored only as a hash — the sheet holds no passwords.
 *
 * Idempotent like create-admin: an email that already exists is left untouched (name,
 * role and password unchanged), so re-running after adding rows only creates the new ones.
 * Staff are not assigned to homes/service users here — managers do that in the app.
 *
 * Usage (after `bun run db:migrate` and `bun run db:create-admin`):
 *   bun run db:seed-staff [path/to/sheet.ods] [--out new-staff-passwords.csv]
 * `--out` also writes the new credentials to a CSV for distribution — it is plaintext,
 * so hand the passwords out and delete it; never commit it.
 */

const REPO_ROOT = resolve(import.meta.dir, '../../../..');

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outPath = outIdx >= 0 ? args[outIdx + 1] : undefined;
if (outIdx >= 0 && !outPath) throw new Error('--out needs a file path');
const sheetArg = args.find((_, i) => i !== outIdx && i !== outIdx + 1);
const sheetPath = sheetArg ? resolve(sheetArg) : resolve(REPO_ROOT, 'staff-credentials.ods');

const staff = readStaffSheet(await readFile(sheetPath));

const created: { name: string; email: string; role: string; password: string }[] = [];
const skipped: string[] = [];

try {
  await db.transaction(async (tx) => {
    for (const person of staff) {
      const password = generateStrongPassword();
      const inserted = await tx
        .insert(users)
        .values({ ...person, passwordHash: await hashPassword(password) })
        .onConflictDoNothing({ target: users.email })
        .returning({ id: users.id });
      if (inserted.length > 0) created.push({ ...person, password });
      else skipped.push(person.email);
    }
  });
} finally {
  await client.end();
}

console.log(`Read ${staff.length} staff from ${sheetPath}`);
if (skipped.length) {
  console.log(`${skipped.length} already exist — left unchanged:`);
  for (const email of skipped) console.log(`  ${email}`);
}
if (created.length) {
  console.log(`${created.length} account(s) created:`);
  for (const c of created) console.log(`  ${c.email.padEnd(40)} ${c.role.padEnd(8)} ${c.password}`);
  console.log('Store these passwords securely now — they will not be shown again.');
  if (outPath) {
    const csv = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [
      'name,email,role,password',
      ...created.map((c) => [c.name, c.email, c.role, c.password].map(csv).join(',')),
    ];
    await writeFile(outPath, `${lines.join('\n')}\n`, { mode: 0o600 });
    console.log(`Credentials also written to ${resolve(outPath)} — delete it once distributed.`);
  }
} else {
  console.log('No new accounts created.');
}
