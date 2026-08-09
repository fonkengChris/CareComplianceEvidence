import type { Role } from '@care/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { setAccessToken } from '../lib/api';
import ServiceUsersPage from './ServiceUsersPage';

/**
 * Component tests for the service-user list: rows render from the API, switching the
 * active/inactive filter refetches with the right query string, and the "New" link is
 * manager-only (auditors browse read-only). fetch is mocked; the QueryClient disables
 * retries so error/empty states settle synchronously.
 */

const rows = [
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Ada Lovelace',
    address: '1 Analytical Ave',
    contractedHours: 12.5,
    active: true,
    createdAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
  },
];

let requestedUrls: string[] = [];

function mockList(role: Role = 'MANAGER') {
  requestedUrls = [];
  globalThis.fetch = mock(async (input: string | URL | Request) => {
    const url = String(input);
    requestedUrls.push(url);
    if (url === '/api/auth/refresh') {
      return new Response(
        JSON.stringify({
          accessToken: 't',
          user: {
            id: 'me',
            name: 'Test User',
            email: 'test@example.com',
            role,
            active: true,
            createdAt: '2026-08-08T00:00:00.000Z',
            updatedAt: '2026-08-08T00:00:00.000Z',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.startsWith('/api/service-users')) {
      return new Response(JSON.stringify(rows), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(null, { status: 404 });
  }) as unknown as typeof fetch;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuthProvider>
          <ServiceUsersPage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  setAccessToken(null);
  mockList();
});
afterEach(() => {
  cleanup();
});

describe('ServiceUsersPage', () => {
  it('renders rows returned from the API', async () => {
    renderPage();
    expect(await screen.findByText('Ada Lovelace')).toBeDefined();
    expect(screen.getByText('1 Analytical Ave')).toBeDefined();
  });

  it('defaults to the active filter', async () => {
    renderPage();
    await screen.findByText('Ada Lovelace');
    expect(requestedUrls.some((u) => u.includes('active=true'))).toBe(true);
  });

  it('refetches with no filter when "All" is selected', async () => {
    renderPage();
    await screen.findByText('Ada Lovelace');
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    await waitFor(() => {
      expect(requestedUrls.some((u) => u === '/api/service-users')).toBe(true);
    });
  });

  it('shows the "New service user" link to a manager', async () => {
    mockList('MANAGER');
    renderPage();
    expect(await screen.findByRole('link', { name: 'New service user' })).toBeDefined();
  });

  it('hides the "New service user" link from an auditor', async () => {
    mockList('AUDITOR');
    renderPage();
    await screen.findByText('Ada Lovelace');
    expect(screen.queryByRole('link', { name: 'New service user' })).toBeNull();
  });
});
