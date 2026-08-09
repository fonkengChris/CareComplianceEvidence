import type { Role } from '@care/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { setAccessToken } from '../lib/api';
import WeekPlanDetailPage from './WeekPlanDetailPage';

/**
 * Planner component tests. The plan + activity list load from mocked endpoints; the
 * current role comes from the mocked silent-refresh session (via AuthProvider). Managers
 * get the editable grid + a single bulk Save and Duplicate; non-managers see neither.
 */

const PLAN = '11111111-1111-4111-8111-111111111111';
const serviceUserId = '22222222-2222-4222-8222-222222222222';

const planWithEntries = {
  id: PLAN,
  serviceUserId,
  weekCommencing: '2026-08-17',
  notes: null,
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
  dayEntries: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      weekPlanId: PLAN,
      day: 'MON',
      lineNumber: 1,
      activityTypeId: '44444444-4444-4444-8444-444444444444',
      description: 'Shopping trip',
      timeAllocated: 60,
      timeSpent: null,
      outcome: null,
      createdAt: '2026-08-08T00:00:00.000Z',
      updatedAt: '2026-08-08T00:00:00.000Z',
    },
  ],
};

const activityTypes = [
  {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Shopping',
    active: true,
    createdAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
  },
];

let putCount = 0;
let duplicateCount = 0;

function makeUser(role: Role) {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    name: 'Test User',
    email: 'test@example.com',
    role,
    active: true,
    createdAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
  };
}

function mockApi(role: Role) {
  putCount = 0;
  duplicateCount = 0;
  globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

    if (url === '/api/auth/refresh') return json({ accessToken: 't', user: makeUser(role) });
    if (url === `/api/week-plans/${PLAN}` && method === 'GET') return json(planWithEntries);
    if (url === '/api/activity-types') return json(activityTypes);
    if (url === `/api/week-plans/${PLAN}/day-entries` && method === 'PUT') {
      putCount += 1;
      return json(planWithEntries);
    }
    if (url === `/api/week-plans/${PLAN}/duplicate` && method === 'POST') {
      duplicateCount += 1;
      return json({ ...planWithEntries, id: 'new-plan' }, 201);
    }
    return new Response(null, { status: 404 });
  }) as unknown as typeof fetch;
}

function renderPlanner() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/week-plans/${PLAN}`]}>
        <AuthProvider>
          <Routes>
            <Route path="/week-plans/:id" element={<WeekPlanDetailPage />} />
            <Route path="/service-users/:id" element={<div>Service User</div>} />
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

describe('WeekPlanDetailPage', () => {
  it('renders the week and its planned line for a manager', async () => {
    mockApi('MANAGER');
    renderPlanner();
    expect(await screen.findByText('Week of 2026-08-17')).toBeDefined();
    expect(await screen.findByText('Monday')).toBeDefined();
    expect(await screen.findByDisplayValue('Shopping trip')).toBeDefined();
  });

  it('saves the whole plan with a single bulk PUT', async () => {
    mockApi('MANAGER');
    renderPlanner();
    fireEvent.click(await screen.findByRole('button', { name: 'Save plan' }));
    await waitFor(() => expect(putCount).toBe(1));
  });

  it('duplicates into a chosen target week', async () => {
    mockApi('MANAGER');
    renderPlanner();
    fireEvent.change(await screen.findByLabelText('Duplicate to week commencing'), {
      target: { value: '2026-08-24' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Previous Week' }));
    await waitFor(() => expect(duplicateCount).toBe(1));
  });

  it('hides all write controls from a non-manager', async () => {
    mockApi('AUDITOR');
    renderPlanner();
    // Wait for the plan to render, then assert no manager actions are present.
    expect(await screen.findByText('Monday')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Save plan' })).toBeNull();
    expect(screen.queryByRole('button', { name: '+ Add line' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Duplicate Previous Week' })).toBeNull();
  });
});
