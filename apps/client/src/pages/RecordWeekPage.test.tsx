import type { Role } from '@care/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { setAccessToken } from '../lib/api';
import { mockApi as installApiMock } from '../lib/test-utils';
import RecordWeekPage from './RecordWeekPage';

/**
 * Staff recording component tests. The plan + activity list load from mocked endpoints;
 * the STAFF role comes from the mocked silent-refresh session. Covers: recording a line
 * (PATCH), the keyword review hint surfacing (never as a status), and adding an unplanned
 * activity (POST).
 */

const PLAN = '11111111-1111-4111-8111-111111111111';
const ENTRY = '33333333-3333-4333-8333-333333333333';
const ACTIVITY = '44444444-4444-4444-8444-444444444444';

const planWithEntries = {
  id: PLAN,
  serviceUserId: '22222222-2222-4222-8222-222222222222',
  weekCommencing: '2026-08-17',
  notes: null,
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
  dayEntries: [
    {
      id: ENTRY,
      weekPlanId: PLAN,
      day: 'MON',
      lineNumber: 1,
      activityTypeId: ACTIVITY,
      description: 'Shopping trip',
      comment: 'Client declined to go out',
      timeAllocated: 60,
      timeSpent: null,
      outcome: null,
      reviewHint: true,
      createdAt: '2026-08-08T00:00:00.000Z',
      updatedAt: '2026-08-08T00:00:00.000Z',
    },
  ],
  compliance: {
    deliveredMinutes: 0,
    contractedMinutes: 1200,
    remainingMinutes: 1200,
    deliveryPct: 0,
    status: 'ATTENTION',
  },
};

const activityTypes = [
  {
    id: ACTIVITY,
    name: 'Shopping',
    active: true,
    createdAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
  },
];

let patchCount = 0;
let postCount = 0;
let lastPatchBody: unknown = null;

function makeUser(role: Role) {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    name: 'Sam Staff',
    email: 'staff@example.com',
    role,
    active: true,
    createdAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
  };
}

function mockApi(role: Role) {
  patchCount = 0;
  postCount = 0;
  lastPatchBody = null;
  installApiMock(async (url, init) => {
    const method = init.method;
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

    if (url === '/api/auth/refresh') return json({ accessToken: 't', user: makeUser(role) });
    if (url === `/api/week-plans/${PLAN}` && method === 'GET') return json(planWithEntries);
    if (url === '/api/activity-types') return json(activityTypes);
    if (url === `/api/week-plans/${PLAN}/day-entries/${ENTRY}/record` && method === 'PATCH') {
      patchCount += 1;
      lastPatchBody = init.body ? JSON.parse(String(init.body)) : null;
      return json(planWithEntries);
    }
    if (url === `/api/week-plans/${PLAN}/day-entries` && method === 'POST') {
      postCount += 1;
      return json(planWithEntries, 201);
    }
    return new Response(null, { status: 404 });
  });
}

function renderRecord() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/week-plans/${PLAN}/record`]}>
        <AuthProvider>
          <Routes>
            <Route path="/week-plans/:id/record" element={<RecordWeekPage />} />
            <Route path="/" element={<div>Dashboard</div>} />
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

describe('RecordWeekPage', () => {
  it('shows the planned activity with read-only allocated time', async () => {
    mockApi('STAFF');
    renderRecord();
    expect(await screen.findByText('Shopping')).toBeDefined();
    expect(screen.getByText('Allocated: 60 min')).toBeDefined();
  });

  it('shows the backend-computed compliance status badge', async () => {
    mockApi('STAFF');
    renderRecord();
    expect(await screen.findByLabelText('Compliance status: Attention Required')).toBeDefined();
  });

  it('records time, outcome and comment via a PATCH', async () => {
    mockApi('STAFF');
    renderRecord();
    fireEvent.change(await screen.findByLabelText('Time spent for Shopping'), {
      target: { value: '45' },
    });
    fireEvent.change(screen.getByLabelText('Outcome for Shopping'), {
      target: { value: 'COMPLETED' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patchCount).toBe(1));
    expect(lastPatchBody).toEqual({ timeSpent: 45, outcome: 'COMPLETED', comment: 'Client declined to go out' });
  });

  it('surfaces the review hint without showing it as a status', async () => {
    mockApi('STAFF');
    renderRecord();
    expect(await screen.findByLabelText('Review hint')).toBeDefined();
    // The hint is a nudge, not the outcome — the outcome control stays "not recorded".
    expect((screen.getByLabelText('Outcome for Shopping') as HTMLSelectElement).value).toBe('');
  });

  it('adds an unplanned activity via a POST', async () => {
    mockApi('STAFF');
    renderRecord();
    fireEvent.click(await screen.findByRole('button', { name: '+ Record Activity' }));
    fireEvent.change(await screen.findByLabelText('Activity'), { target: { value: ACTIVITY } });
    fireEvent.submit(screen.getByRole('form', { name: 'Record an unplanned activity' }));
    await waitFor(() => expect(postCount).toBe(1));
  });
});
