import { expect, test } from '@playwright/test';
import { CREDENTIALS, login } from './helpers';

/**
 * Auth journeys (Phase 10): each seeded role can log in and land on the dashboard, a bad
 * password is rejected, and a reload silently restores the session from the refresh
 * cookie (no re-login). Forcing an *access-token* expiry mid-session needs a short JWT
 * TTL — set ACCESS_TOKEN_TTL short in the server env and assert an authenticated action
 * still succeeds after the TTL to cover the refresh-on-401 path end to end.
 */

test('each role can log in and reach the app', async ({ page }) => {
  for (const role of ['MANAGER', 'STAFF', 'AUDITOR'] as const) {
    await login(page, role);
    await expect(page.getByText(new RegExp(`· ${role}`))).toBeVisible();
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login$/);
  }
});

test('rejects an invalid password', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(CREDENTIALS.MANAGER.email);
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText(/invalid email or password/i);
  await expect(page).toHaveURL(/\/login$/);
});

test('silently restores the session on reload (refresh cookie)', async ({ page }) => {
  await login(page, 'MANAGER');
  await page.reload();
  // Still authenticated — the silent refresh on mount rehydrated the user.
  await expect(page.getByText(/· MANAGER/)).toBeVisible();
  await expect(page).not.toHaveURL(/\/login$/);
});
