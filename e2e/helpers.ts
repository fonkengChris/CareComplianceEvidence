import { expect, type Page } from '@playwright/test';

/** Seeded dev logins — one per role, all sharing the same password (see db/seed.ts). */
export const CREDENTIALS = {
  MANAGER: { email: 'manager@example.com', password: 'Password123!' },
  STAFF: { email: 'staff@example.com', password: 'Password123!' },
  AUDITOR: { email: 'auditor@example.com', password: 'Password123!' },
} as const;

export type RoleKey = keyof typeof CREDENTIALS;

/** Log in through the real login form and wait for the authenticated shell to render. */
export async function login(page: Page, role: RoleKey): Promise<void> {
  const { email, password } = CREDENTIALS[role];
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // NavShell shows the current user + role once authenticated.
  await expect(page.getByText(new RegExp(`· ${role}`))).toBeVisible();
}
