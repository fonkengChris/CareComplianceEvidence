import type { Role } from '@care/shared';
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { setAccessToken } from '../lib/api';
import { AuthProvider } from './AuthContext';
import { ProtectedRoute } from './ProtectedRoute';

function makeUser(role: Role) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Test User',
    email: 'test@example.com',
    role,
    active: true,
    createdAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
  };
}

function mockSession(role: Role | null) {
  globalThis.fetch = mock(async (input: string | URL | Request) => {
    if (String(input) === '/api/auth/refresh') {
      return role
        ? new Response(JSON.stringify({ accessToken: 't', user: makeUser(role) }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        : new Response(null, { status: 401 });
    }
    return new Response(null, { status: 404 });
  }) as unknown as typeof fetch;
}

function renderGuarded(guardRoles?: Role[]) {
  return render(
    <MemoryRouter initialEntries={['/secret']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>Login Screen</div>} />
          <Route path="/" element={<div>Home</div>} />
          <Route element={<ProtectedRoute roles={guardRoles} />}>
            <Route path="/secret" element={<div>Secret Page</div>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  setAccessToken(null);
});
afterEach(() => {
  cleanup();
});

describe('ProtectedRoute', () => {
  it('redirects an unauthenticated user to /login', async () => {
    mockSession(null);
    renderGuarded();
    expect(await screen.findByText('Login Screen')).toBeDefined();
  });

  it('renders the protected page for an authenticated user', async () => {
    mockSession('MANAGER');
    renderGuarded();
    expect(await screen.findByText('Secret Page')).toBeDefined();
  });

  it('redirects a user whose role is not allowed back to the dashboard', async () => {
    mockSession('STAFF');
    renderGuarded(['MANAGER']);
    expect(await screen.findByText('Home')).toBeDefined();
  });
});
