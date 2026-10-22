import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { getAccessToken, setAccessToken } from '../lib/api';
import { mockApi } from '../lib/test-utils';
import AccountPage from './AccountPage';

/**
 * My account: the profile form PUTs name/email to /api/auth/me, and the password form
 * blocks a mismatched confirmation client-side, surfaces a wrong current password, and
 * stores the rotated access token on success.
 */

const me = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Sam Staff',
  email: 'sam@example.com',
  role: 'STAFF',
  active: true,
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
};

let profileBody: Record<string, unknown> | null = null;
let passwordBody: Record<string, unknown> | null = null;
let passwordStatus = 200;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  setAccessToken(null);
  profileBody = null;
  passwordBody = null;
  passwordStatus = 200;
  mockApi(async (url, init) => {
    if (url === '/api/auth/refresh') return json({ accessToken: 'initial', user: me });
    if (url === '/api/auth/me' && init.method === 'PUT') {
      profileBody = JSON.parse(String(init.body));
      return json({ ...me, ...profileBody });
    }
    if (url === '/api/auth/me/password' && init.method === 'PUT') {
      passwordBody = JSON.parse(String(init.body));
      return passwordStatus === 200
        ? json({ accessToken: 'rotated', user: me })
        : json({ error: 'Current password is incorrect' }, passwordStatus);
    }
    return new Response(null, { status: 404 });
  });
});
afterEach(() => cleanup());

async function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuthProvider>
          <AccountPage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByRole('heading', { name: 'My account' });
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('AccountPage', () => {
  it('prefills and saves the profile', async () => {
    await renderPage();
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Sam Staff');
    fill('Name', 'Samantha Staff');
    fireEvent.submit(screen.getByRole('form', { name: 'Profile' }));
    expect(await screen.findByText('Profile updated.')).toBeDefined();
    expect(profileBody).toEqual({ name: 'Samantha Staff', email: 'sam@example.com' });
  });

  it('blocks a mismatched confirmation without calling the API', async () => {
    await renderPage();
    fill('Current password', 'Password123!');
    fill('New password', 'NewPassword1!');
    fill('Confirm new password', 'Different1!');
    fireEvent.submit(screen.getByRole('form', { name: 'Change password' }));
    expect(await screen.findByText('Passwords do not match')).toBeDefined();
    expect(passwordBody).toBeNull();
  });

  it('shows the server error for a wrong current password', async () => {
    passwordStatus = 400;
    await renderPage();
    fill('Current password', 'wrong');
    fill('New password', 'NewPassword1!');
    fill('Confirm new password', 'NewPassword1!');
    fireEvent.submit(screen.getByRole('form', { name: 'Change password' }));
    expect(await screen.findByText('Current password is incorrect')).toBeDefined();
  });

  it('sends only current + new and stores the rotated access token', async () => {
    await renderPage();
    fill('Current password', 'Password123!');
    fill('New password', 'NewPassword1!');
    fill('Confirm new password', 'NewPassword1!');
    fireEvent.submit(screen.getByRole('form', { name: 'Change password' }));
    expect(await screen.findByText(/Password changed/)).toBeDefined();
    expect(passwordBody).toEqual({ currentPassword: 'Password123!', newPassword: 'NewPassword1!' });
    await waitFor(() => expect(getAccessToken()).toBe('rotated'));
  });
});
