import { expect, test } from '@playwright/test';
import { login } from './helpers';

/**
 * The core weekly cycle end to end (Phase 10), on a mobile viewport (staff recording is
 * mobile-first). A staff member records time + outcome against a planned line, then a
 * manager sees the service user in the weekly summary and exports the PDF.
 *
 * This exercises the full stack and depends on seeded demo data — Sam Staff supervising
 * Alice Morgan with at least one week plan (db/seed.ts + db/mock.ts). Run `bun run db:seed`
 * (and optionally `bun run apps/server/src/db/mock.ts`) before this spec. Selectors target
 * the first available plan/line so the test does not hard-code a specific week or activity.
 */

test('staff records an entry, then a manager sees it in the summary and exports a PDF', async ({
  page,
}) => {
  // 1. Staff records against the first planned line of their first week plan.
  await login(page, 'STAFF');
  await page.getByRole('link', { name: /^Record — week of/ }).first().click();
  await expect(page.getByRole('heading', { name: /^Record — week of/ })).toBeVisible();

  await page.getByRole('spinbutton', { name: /^Time spent for/ }).first().fill('60');
  await page.getByRole('combobox', { name: /^Outcome for/ }).first().selectOption('Completed');
  await page.getByRole('button', { name: 'Save' }).first().click();
  // A successful save shows no error alert on the card.
  await expect(page.getByRole('alert')).toHaveCount(0);

  await page.getByRole('button', { name: 'Log out' }).click();

  // 2. Manager sees the weekly summary and exports the report as a PDF download.
  await login(page, 'MANAGER');
  await page.getByRole('link', { name: 'Reports' }).click();
  await expect(page.getByRole('heading', { name: 'Weekly Summary' })).toBeVisible();

  // Expand the first service user that has a plan, then export.
  await page
    .getByRole('button', { name: /▸/ })
    .first()
    .click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export PDF' }).first().click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
});
