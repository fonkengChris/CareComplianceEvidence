import type { Role } from '@care/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { setAccessToken } from '../lib/api';
import { mockApi as installApiMock } from '../lib/test-utils';
import ServiceUserDetailPage from './ServiceUserDetailPage';

/**
 * Service-user detail tests focused on the supervision-group section: a manager assigns a staff
 * member until an end date (POST), renews or removes the link (DELETE), sees links nearing their
 * end flagged, and can open the access history (who viewed the records). Manager-only controls.
 */

const SU = '22222222-2222-4222-8222-222222222222';
const STAFF = '11111111-1111-4111-8111-111111111111';

const serviceUser = {
  id: SU,
  name: 'Alice Morgan',
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
let assignBodies: { staffId: string; serviceUserId: string; endsAt: string }[] = [];
// After an assign, the assigned-staff list returns Sam so the Remove button appears.
let assigned: unknown[] = [];
let history: unknown[] = [];

function makeUser(role: Role) {
  return { ...staffUser, id: 'me', name: 'Morgan Manager', role };
}

function mockApi(role: Role) {
  assignCount = 0;
  unassignCount = 0;
  assignBodies = [];
  assigned = [];
  history = [];
  installApiMock(async (url, init) => {
    const method = init.method;
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });

    if (url === '/api/auth/refresh') return json({ accessToken: 't', user: makeUser(role) });
    if (url === `/api/service-users/${SU}`) return json(serviceUser);
    if (url.startsWith(`/api/week-plans?serviceUserId=${SU}`)) return json([]);
    if (url === `/api/assignments/service-user/${SU}`) return json(assigned);
    if (url === '/api/users') return json([staffUser]);
    if (url === `/api/audit-logs?entityType=SERVICE_USER&entityId=${SU}`) return json(history);
    if (url === '/api/assignments' && method === 'POST') {
      assignCount += 1;
      const body = JSON.parse(init.body!);
      assignBodies.push(body);
      assigned = [{ ...staffUser, assignmentEndsAt: body.endsAt }];
      return new Response(null, { status: 204 });
    }
    if (url === `/api/assignments/service-user/${SU}/staff/${STAFF}` && method === 'DELETE') {
      unassignCount += 1;
      assigned = [];
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 404 });
  });
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
  it('lets a manager assign and then remove a staff member', async () => {
    mockApi('MANAGER');
    renderDetail();
    fireEvent.change(await screen.findByLabelText('Assign a staff member'), {
      target: { value: STAFF },
    });
    fireEvent.change(screen.getByLabelText('Until'), { target: { value: '2099-03-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));
    await waitFor(() => expect(assignCount).toBe(1));
    expect(assignBodies[0]).toEqual({
      staffId: STAFF,
      serviceUserId: SU,
      endsAt: '2099-03-31T23:59:59.000Z',
    });

    // After assigning, the list shows Sam with a Remove button (DELETE).
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(unassignCount).toBe(1));
  });
});

describe('ServiceUserDetailPage assignment expiry', () => {
  it('flags a link ending soon and renews it with a fresh end date', async () => {
    mockApi('MANAGER');
    assigned = [
      { ...staffUser, assignmentEndsAt: new Date(Date.now() + 5 * 86_400_000).toISOString() },
    ];
    renderDetail();
    expect(await screen.findByText(/^Ends /)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Renew Sam Staff for 90 days' }));
    await waitFor(() => expect(assignCount).toBe(1));
    const renewedUntil = new Date(assignBodies[0]!.endsAt).getTime();
    expect(renewedUntil).toBeGreaterThan(Date.now() + 88 * 86_400_000);
  });

  it('marks an expired link', async () => {
    mockApi('MANAGER');
    assigned = [{ ...staffUser, assignmentEndsAt: '2026-01-01T23:59:59.000Z' }];
    renderDetail();
    expect(await screen.findByText(/^Expired /)).toBeDefined();
  });
});

describe('ServiceUserDetailPage access history', () => {
  it('shows who viewed the records once opened', async () => {
    mockApi('MANAGER');
    history = [
      {
        id: '44444444-4444-4444-8444-444444444444',
        userId: STAFF,
        action: 'VIEW',
        entityType: 'SERVICE_USER',
        entityId: SU,
        field: 'WEEK_PLAN',
        fromValue: null,
        toValue: '2026-11-23',
        createdAt: '2026-11-23T10:00:00.000Z',
        actorName: 'Sam Staff',
        entityLabel: 'Alice Morgan',
      },
    ];
    renderDetail();
    fireEvent.click(await screen.findByRole('button', { name: 'Show who accessed these records' }));
    expect(await screen.findByText('viewed week plan')).toBeDefined();
    expect(screen.getByText('2026-11-23')).toBeDefined();
  });
});
