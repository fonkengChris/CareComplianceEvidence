import { generateStrongPassword, hashPassword } from '../auth/password';
import { client, db } from './index';
import { activityTypes, complianceSettings, users } from './schema';

/**
 * Creates the production admin login with a randomly generated strong password, which
 * is printed once and stored only as a hash. Idempotent: if the email already exists
 * the account is left untouched (password unchanged).
 *
 * It also ensures the reference data the app cannot run without — the standard
 * activity list and the compliance-settings singleton (compliance.service throws when
 * that row is missing). Both inserts are no-ops when the rows already exist. No sample
 * homes, service users, plans or staff are created.
 *
 * Usage (after `bun run db:migrate`): `bun run db:create-admin`
 */

// There is no separate ADMIN role — MANAGER is the app's highest-privilege role.
const ADMIN_USER = {
  name: 'Admin',
  email: 'olivier.mandengue@rightcareservices.co.uk',
  role: 'MANAGER' as const,
};

const ACTIVITY_NAMES = [
  'Shopping',
  'Cleaning',
  'Wellbeing',
  'Budgeting',
  'Admin',
  'Movies',
  'Cooking',
  'Walking',
  'Social Inclusion',
  'Personal Care',
  'Exercise',
  'Other',
];

// Default 🟢/🟡/🔴 boundaries; managers adjust them in the app afterwards.
const DEFAULT_COMPLIANCE = {
  greenMin: 90,
  amberMin: 75,
  redOverPct: 110,
  recordingGuidance:
    'Record what support was provided and how the person responded. Capture: what you did, ' +
    'the person’s engagement and mood, any concerns, changes or incidents, and the outcome. ' +
    'Be factual and objective — describe what you observed, not opinions.',
};

const password = generateStrongPassword();

const created = await db.transaction(async (tx) => {
  const passwordHash = await hashPassword(password);
  const inserted = await tx
    .insert(users)
    .values({ ...ADMIN_USER, passwordHash })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id });

  await tx
    .insert(activityTypes)
    .values(ACTIVITY_NAMES.map((name) => ({ name })))
    .onConflictDoNothing();

  await tx.insert(complianceSettings).values(DEFAULT_COMPLIANCE).onConflictDoNothing();

  return inserted.length > 0;
});

await client.end();

if (created) {
  console.log('Admin account created:');
  console.log(`  email:    ${ADMIN_USER.email}`);
  console.log(`  password: ${password}`);
  console.log('Store this password securely now — it will not be shown again.');
} else {
  console.log(`Admin account ${ADMIN_USER.email} already exists — password unchanged.`);
}
