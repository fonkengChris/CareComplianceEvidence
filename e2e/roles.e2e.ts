import { expect, test } from '@playwright/test';
import { login } from './helpers';

/**
 * Role gating (Phase 10). At the UI level the client guard redirects a user away from a
 * route their role may not see; the authoritative *API* 403s are covered by the server
 * integration test (apps/server/src/app.integration.test.ts). Here we confirm the two
 * read-only roles land where they should and are bounced from what they shouldn't.
 */

test('auditor: read-only access, bounced from manager-only routes', async ({ page }) => {
  await login(page, 'AUDITOR');

  // Auditor nav: Reports, Audit and (read-only) Service Users are present…
  await expect(page.getByRole('link', { name: 'Reports' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Audit' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Service Users' })).toBeVisible();
  // …but manager-only sections are not.
  await expect(page.getByRole('link', { name: 'Users' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Compliance' })).toHaveCount(0);

  // The service-user list renders read-only — no create action.
  await page.getByRole('link', { name: 'Service Users' }).click();
  await expect(page.getByRole('heading', { name: 'Service Users' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'New service user' })).toHaveCount(0);

  // A manager-only URL redirects back to the dashboard.
  await page.goto('/users');
  await expect(page).toHaveURL(/\/$/);
});

test('staff: cannot see or reach manager/auditor sections', async ({ page }) => {
  await login(page, 'STAFF');

  await expect(page.getByRole('link', { name: 'Reports' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Audit' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Service Users' })).toHaveCount(0);

  // Direct navigation to a report route bounces a staff user home.
  await page.goto('/reports');
  await expect(page).toHaveURL(/\/$/);
});
