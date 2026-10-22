import type { Role } from '@care/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { setAccessToken } from '../lib/api';
import { mockApi } from '../lib/test-utils';
import HomesPage from './HomesPage';

/**
 * Component tests for the home list's manager-only delete: confirmed deletes hit the API,
 * cancelled ones don't, and non-managers never see the button. The API is mocked; the
 * QueryClient disables retries so error states settle synchronously.
 */

const rows = [
  {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Riverside House',
    address: '1 Riverside Way',
    active: true,
    createdAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
  },
];

let requestedUrls: string[] = [];
const deleted: string[] = [];

function mockList(role: Role = 'MANAGER') {
  requestedUrls = [];
  deleted.length = 0;
  mockApi(async (url, init) => {
    requestedUrls.push(url);
    if (init.method === 'DELETE') {
      deleted.push(url);
      return new Response(null, { status: 204 });
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
    if (url.startsWith('/api/homes')) {
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
          <HomesPage />
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

describe('HomesPage', () => {
  it('renders homes returned from the API', async () => {
    renderPage();
    expect(await screen.findByText('Riverside House')).toBeDefined();
  });

  it('deletes a home after the manager confirms', async () => {
    window.confirm = () => true;
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Riverside House' }));
    await waitFor(() => {
      expect(deleted).toEqual([`/api/homes/${rows[0].id}`]);
    });
  });

  it('does not delete when the confirmation is cancelled', async () => {
    window.confirm = () => false;
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Riverside House' }));
    expect(deleted).toEqual([]);
  });

  it('hides the delete button from non-managers', async () => {
    mockList('STAFF');
    renderPage();
    await screen.findByText('Riverside House');
    expect(screen.queryByRole('button', { name: 'Delete Riverside House' })).toBeNull();
  });
});
