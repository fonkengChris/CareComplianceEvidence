import { checkTemplateInputSchema } from '@care/shared';
import { DEFAULT_CHECK_TEMPLATES } from './house-check-defaults';
import { client, db } from './index';
import { checkTemplates } from './schema';

/**
 * Creates the starting house-check templates (see house-check-defaults.ts). Idempotent: a
 * template whose name already exists is left untouched, so managers' edits in the app are never
 * overwritten by a re-run.
 *
 * Usage (after `bun run db:migrate`): bun run db:seed-checks
 */

const created: string[] = [];
const skipped: string[] = [];

try {
  await db.transaction(async (tx) => {
    const existing = await tx.select({ name: checkTemplates.name }).from(checkTemplates);
    const names = new Set(existing.map((t) => t.name.trim().toLowerCase()));
    for (const input of DEFAULT_CHECK_TEMPLATES) {
      const template = checkTemplateInputSchema.parse(input);
      if (names.has(template.name.toLowerCase())) {
        skipped.push(template.name);
        continue;
      }
      await tx.insert(checkTemplates).values({
        name: template.name,
        scheduleKind: template.scheduleKind,
        scheduleDays: template.scheduleDays,
        dueByTime: template.dueByTime ?? null,
        definition: template.definition,
      });
      created.push(template.name);
    }
  });
} finally {
  await client.end();
}

if (skipped.length) console.log(`Already present — left unchanged: ${skipped.join(', ')}`);
console.log(
  created.length ? `Created ${created.length} check(s): ${created.join(', ')}` : 'No new checks.',
);
