import type { Role } from '@care/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { setAccessToken } from '../lib/api';
import ServiceUserDetailPage from './ServiceUserDetailPage';

/**
 * Service-user detail tests focused on the Phase 5 supervision-group section: a manager
 * can assign a staff member (POST) and remove one (DELETE). Assignment controls are
 * manager-only.
 */

const SU = '22222222-2222-4222-8222-222222222222';
const STAFF = '11111111-1111-4111-8111-111111111111';

const serviceUser = {
  id: SU,
  name: 'Alice Morgan',
  address: '12 Elm Street',
  contractedHours: 20,
  active: true,
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
};

const staffUser = {
  id: STAFF,
  name: 'Sam Staff',
  email: 'staff@example.com',
  role: 'STAFF' as const,
  active: true,
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
};

let assignCount = 0;
let unassignCount = 0;
// After an assign, the assigned-staff list returns Sam so the Remove button appears.
let assigned: unknown[] = [];

function makeUser(role: Role) {
  return { ...staffUser, id: 'me', name: 'Morgan Manager', role };
}

function mockApi(role: Role) {
  assignCount = 0;
  unassignCount = 0;
  assigned = [];
  globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

    if (url === '/api/auth/refresh') return json({ accessToken: 't', user: makeUser(role) });
    if (url === `/api/service-users/${SU}`) return json(serviceUser);
    if (url.startsWith(`/api/week-plans?serviceUserId=${SU}`)) return json([]);
    if (url === `/api/assignments/service-user/${SU}`) return json(assigned);
    if (url === '/api/users') return json([staffUser]);
    if (url === '/api/assignments' && method === 'POST') {
      assignCount += 1;
      assigned = [staffUser];
      return new Response(null, { status: 204 });
    }
    if (url === `/api/assignments/service-user/${SU}/staff/${STAFF}` && method === 'DELETE') {
      unassignCount += 1;
      assigned = [];
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 404 });
  }) as unknown as typeof fetch;
}

function renderDetail() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/service-users/${SU}`]}>
        <AuthProvider>
          <Routes>
            <Route path="/service-users/:id" element={<ServiceUserDetailPage />} />
            <Route path="/service-users" element={<div>List</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  setAccessToken(null);
});
afterEach(() => {
  cleanup();
});

describe('ServiceUserDetailPage assignments', () => {
  it('lets a manager assign a staff member', async () => {
    mockApi('MANAGER');
    renderDetail();
    fireEvent.change(await screen.findByLabelText('Assign a staff member'), {
      target: { value: STAFF },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));
    await waitFor(() => expect(assignCount).toBe(1));
  });

  it('hides the assignment section from non-managers', async () => {
    mockApi('AUDITOR');
    renderDetail();
    expect(await screen.findByText('Alice Morgan')).toBeDefined();
    expect(screen.queryByLabelText('Assign a staff member')).toBeNull();
  });
});
