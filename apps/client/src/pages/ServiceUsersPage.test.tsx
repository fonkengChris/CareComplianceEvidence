import type { Role } from '@care/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { setAccessToken } from '../lib/api';
import { mockApi } from '../lib/test-utils';
import ServiceUsersPage from './ServiceUsersPage';

/**
 * Component tests for the service-user list: rows render from the API, switching the
 * active/inactive filter refetches with the right query string, and the "New" link is
 * manager-only. fetch is mocked; the QueryClient disables
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
let deleteStatus = 204;
const deleted: string[] = [];

function mockList(role: Role = 'MANAGER') {
  requestedUrls = [];
  deleted.length = 0;
  deleteStatus = 204;
  mockApi(async (url, init) => {
    requestedUrls.push(url);
    if (init.method === 'DELETE') {
      deleted.push(url);
      return deleteStatus === 204
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify({ error: 'Deactivate them instead.' }), {
            status: deleteStatus,
            headers: { 'content-type': 'application/json' },
          });
    }
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
  });
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
  window.confirm = originalConfirm;
});

const originalConfirm = window.confirm;

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

  it('deletes a service user after the manager confirms', async () => {
    window.confirm = () => true;
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Ada Lovelace' }));
    await waitFor(() => {
      expect(deleted).toEqual([`/api/service-users/${rows[0].id}`]);
    });
  });

  it('does not delete when the confirmation is cancelled', async () => {
    window.confirm = () => false;
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Ada Lovelace' }));
    expect(deleted).toEqual([]);
  });

  it("shows the server's reason when the delete is refused", async () => {
    window.confirm = () => true;
    deleteStatus = 409;
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Ada Lovelace' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Deactivate them instead.');
  });

  it('hides the delete button from non-managers', async () => {
    mockList('STAFF');
    renderPage();
    await screen.findByText('Ada Lovelace');
    expect(screen.queryByRole('button', { name: 'Delete Ada Lovelace' })).toBeNull();
  });
});
