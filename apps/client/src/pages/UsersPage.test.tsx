import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { setAccessToken } from '../lib/api';
import { mockApi } from '../lib/test-utils';
import UsersPage from './UsersPage';

/**
 * Component tests for the manager users list: rows (name/email/role/status) render from
 * the API, and the delete flow (confirm, refusal message, no button on your own row).
 * The API is mocked; the QueryClient disables retries so states settle.
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

let deleteStatus = 204;
const deleted: string[] = [];

function mockList() {
  deleted.length = 0;
  deleteStatus = 204;
  mockApi(async (url, init) => {
    if (init.method === 'DELETE') {
      deleted.push(url);
      return deleteStatus === 204
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify({ error: 'Deactivate them instead.' }), {
            status: deleteStatus,
            headers: { 'content-type': 'application/json' },
          });
    }
    // Signed in as Morgan Manager (rows[0]).
    if (url === '/api/auth/refresh') {
      return new Response(JSON.stringify({ accessToken: 't', user: rows[0] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
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
        <AuthProvider>
          <UsersPage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  setAccessToken(null);
  mockList();
});
const originalConfirm = window.confirm;
afterEach(() => {
  cleanup();
  window.confirm = originalConfirm;
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

  it('deletes a user after the manager confirms', async () => {
    window.confirm = () => true;
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Sam Staff' }));
    await waitFor(() => {
      expect(deleted).toEqual([`/api/users/${rows[1].id}`]);
    });
  });

  it('does not delete when the confirmation is cancelled', async () => {
    window.confirm = () => false;
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Sam Staff' }));
    expect(deleted).toEqual([]);
  });

  it("shows the server's reason when the delete is refused", async () => {
    window.confirm = () => true;
    deleteStatus = 409;
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Sam Staff' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Deactivate them instead.');
  });

  it('has no delete button on your own row', async () => {
    renderPage();
    await screen.findByRole('button', { name: 'Delete Sam Staff' });
    expect(screen.queryByRole('button', { name: 'Delete Morgan Manager' })).toBeNull();
  });
});
