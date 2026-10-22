import { expect, test } from '@playwright/test';
import { login } from './helpers';

/**
 * Role gating (Phase 10). At the UI level the client guard redirects a user away from a
 * route their role may not see; the authoritative *API* 403s are covered by the server
 * integration test (apps/server/src/app.integration.test.ts). Here we confirm the
 * restricted roles land where they should and are bounced from what they shouldn't.
 */

test('auditor: Reports only, bounced from every other route', async ({ page }) => {
  await login(page, 'AUDITOR');

  // Auditors land on Reports, and it is their only nav item.
  await expect(page).toHaveURL(/\/reports$/);
  await expect(page.getByRole('link', { name: 'Reports' })).toBeVisible();
  for (const hidden of ['Dashboard', 'Service Users', 'Homes', 'Audit', 'Users']) {
    await expect(page.getByRole('link', { name: hidden, exact: true })).toHaveCount(0);
  }

  // No way to browse or request other service users (GDPR): a manager assigns them.
  await expect(page.getByRole('form', { name: 'Request audit access' })).toHaveCount(0);

  // Any other section bounces back to Reports.
  for (const path of ['/service-users', '/audit', '/users']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/reports$/);
  }
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
