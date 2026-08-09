import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import { setAccessToken } from './lib/api';

// A MANAGER: managers/auditors get the API-health dashboard. (STAFF instead get their
// recording dashboard, covered by StaffDashboardPage/RecordWeekPage tests.)
const user = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Morgan Manager',
  email: 'morgan@example.com',
  role: 'MANAGER',
  active: true,
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider>
        <App />
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

describe('App routing', () => {
  it('redirects to the login screen when unauthenticated', async () => {
    globalThis.fetch = mock(
      async () => new Response(null, { status: 401 }),
    ) as unknown as typeof fetch;
    renderApp();
    expect(await screen.findByLabelText('Email')).toBeDefined();
  });

  it('shows the dashboard with API health for an authenticated user', async () => {
    globalThis.fetch = mock(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/api/auth/refresh') return jsonResponse({ accessToken: 't', user });
      if (url === '/api/health') return jsonResponse({ status: 'ok', db: 'up' });
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;

    renderApp();
    expect(await screen.findByText(/Welcome, Morgan Manager/)).toBeDefined();
    expect((await screen.findByRole('status')).textContent).toContain('DB: up');
  });
});
