import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { setAccessToken } from '../lib/api';
import { mockApi } from '../lib/test-utils';
import UsersPage from './UsersPage';

/**
 * Component tests for the manager users list: rows (name/email/role/status) render from
 * the API. fetch is mocked; the QueryClient disables retries so states settle.
 */

const rows = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Morgan Manager',
    email: 'manager@example.com',
    role: 'MANAGER',
    active: true,
    createdAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Sam Staff',
    email: 'staff@example.com',
    role: 'STAFF',
    active: false,
    createdAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
  },
];

function mockList() {
  mockApi(async (url) => {
    if (url === '/api/users') {
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
        <UsersPage />
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

describe('UsersPage', () => {
  it('renders users returned from the API with their role and status', async () => {
    renderPage();
    expect(await screen.findByText('Morgan Manager')).toBeDefined();
    expect(screen.getByText('manager@example.com')).toBeDefined();
    expect(screen.getByText('Active')).toBeDefined();
    expect(screen.getByText('Sam Staff')).toBeDefined();
    expect(screen.getByText('Inactive')).toBeDefined();
  });

  it('shows an Add new user action', async () => {
    renderPage();
    await screen.findByText('Morgan Manager');
    expect(screen.getByRole('link', { name: 'Add new user' })).toBeDefined();
  });
});
