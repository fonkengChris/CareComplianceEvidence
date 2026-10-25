import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import { setAccessToken } from './lib/api';
import { mockApi } from './lib/test-utils';

// A MANAGER: managers land on the weekly summary dashboard (Phase 7); auditors are sent to
// Reports. (STAFF instead get their recording dashboard, covered by StaffDashboardPage/
// RecordWeekPage tests.)
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
  // Mirror main.tsx: the app relies on a QueryClientProvider at the root (the manager
  // dashboard renders the summary, which uses useQuery).
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const emptySummary = {
  weekCommencing: '2026-08-03',
  settings: {
    id: 'settings-1',
    greenMin: 90,
    amberMin: 75,
    redOverPct: 110,
    createdAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
  },
  rows: [],
};

beforeEach(() => {
  setAccessToken(null);
});
afterEach(() => {
  cleanup();
});

describe('App routing', () => {
  it('redirects to the login screen when unauthenticated', async () => {
    mockApi(async () => new Response(null, { status: 401 }));
    renderApp();
    expect(await screen.findByLabelText('Email')).toBeDefined();
  });

  it('lands an authenticated manager on the weekly summary dashboard', async () => {
    mockApi(async (url) => {
      if (url === '/api/auth/refresh') return jsonResponse({ accessToken: 't', user });
      if (url.startsWith('/api/summary')) return jsonResponse(emptySummary);
      return new Response(null, { status: 404 });
    });

    renderApp();
    expect(await screen.findByRole('heading', { name: 'Weekly Summary' })).toBeDefined();
  });

  it('lands an auditor on Reports with Reports as the only nav item', async () => {
    mockApi(async (url) => {
      if (url === '/api/auth/refresh') {
        return jsonResponse({ accessToken: 't', user: { ...user, role: 'AUDITOR' } });
      }
      if (url.startsWith('/api/summary/period')) {
        return jsonResponse({
          ...emptySummary,
          from: '2026-08-03',
          to: '2026-08-03',
          weekCount: 1,
        });
      }
      return new Response(null, { status: 404 });
    });

    renderApp();
    expect(await screen.findByRole('heading', { name: 'Reports & compliance' })).toBeDefined();
    const navLinks = screen.getAllByRole('link').map((a) => a.textContent?.trim());
    expect(navLinks).toContain('Reports');
    for (const hidden of ['Dashboard', 'Service Users', 'Homes', 'Audit', 'Users']) {
      expect(navLinks).not.toContain(hidden);
    }
  });

  it('lands a key worker on their recording dashboard with Dashboard + Reports nav only', async () => {
    mockApi(async (url) => {
      if (url === '/api/auth/refresh') {
        return jsonResponse({ accessToken: 't', user: { ...user, role: 'KEY_WORKER' } });
      }
      if (url === '/api/assignments/me' || url.startsWith('/api/week-plans')) {
        return jsonResponse([]);
      }
      return new Response(null, { status: 404 });
    });

    renderApp();
    expect(
      await screen.findByText(
        'No service users to show. If you work at a home, start a shift to see its residents.',
      ),
    ).toBeDefined();
    const navLinks = screen.getAllByRole('link').map((a) => a.textContent?.trim());
    expect(navLinks).toContain('Dashboard');
    expect(navLinks).toContain('Reports');
    for (const hidden of ['Service Users', 'Homes', 'Audit', 'Users', 'Access requests']) {
      expect(navLinks).not.toContain(hidden);
    }
  });
});
