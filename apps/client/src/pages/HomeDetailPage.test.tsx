import type { ShiftSession } from '@care/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { setAccessToken } from '../lib/api';
import { mockApi } from '../lib/test-utils';
import HomeDetailPage from './HomeDetailPage';

/**
 * Component tests for the manager panels: "On shift now" lists who is on shift and "End & sign
 * out" (after confirming) POSTs that session's terminate; "Assigned staff" lets the manager tick several staff and assign them
 * in one go (one POST each). The API is mocked.
 */

const HOME_ID = '33333333-3333-4333-8333-333333333333';
const home = {
  id: HOME_ID,
  name: 'Riverside House',
  address: '1 Riverside Way',
  active: true,
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
};
const session: ShiftSession = {
  id: '55555555-5555-4555-8555-555555555555',
  staffId: '11111111-1111-4111-8111-111111111111',
  homeId: HOME_ID,
  homeName: home.name,
  staffName: 'Sam Staff',
  startedAt: '2026-10-25T08:00:00.000Z',
  expiresAt: '2026-10-25T20:00:00.000Z',
  endedAt: null,
};

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function staffUser(id: string, name: string) {
  return {
    id,
    name,
    email: `${name.split(' ')[0]!.toLowerCase()}@example.com`,
    role: 'STAFF',
    active: true,
    createdAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
  };
}
const ALEX = staffUser('66666666-6666-4666-8666-666666666666', 'Alex Able');
const BLAIR = staffUser('77777777-7777-4777-8777-777777777777', 'Blair Baker');

let shifts: ShiftSession[] = [];
let ended: string[] = [];
let assigned: unknown[] = [];

beforeEach(() => {
  setAccessToken(null);
  shifts = [session];
  ended = [];
  assigned = [];
  mockApi(async (url, init) => {
    if (url === '/api/auth/refresh') {
      return json({
        accessToken: 't',
        user: {
          id: '99999999-9999-4999-8999-999999999999',
          name: 'Morgan Manager',
          email: 'morgan@example.com',
          role: 'MANAGER',
          active: true,
          createdAt: '2026-08-08T00:00:00.000Z',
          updatedAt: '2026-08-08T00:00:00.000Z',
        },
      });
    }
    if (url === `/api/shifts/active?homeId=${HOME_ID}`) return json(shifts);
    if (url.endsWith('/terminate')) {
      ended.push(url);
      shifts = [];
      return new Response(null, { status: 204 });
    }
    if (url === '/api/assignments/home' && init.method === 'POST') {
      assigned.push(JSON.parse(init.body!));
      return new Response(null, { status: 204 });
    }
    if (url === '/api/users') return json([ALEX, BLAIR]);
    if (url === `/api/homes/${HOME_ID}`) return json(home);
    if (
      url.startsWith('/api/homes/') ||
      url.startsWith('/api/assignments') ||
      url === '/api/users'
    ) {
      return json([]);
    }
    return new Response(null, { status: 404 });
  });
});
afterEach(() => cleanup());

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/homes/${HOME_ID}`]}>
        <AuthProvider>
          <Routes>
            <Route path="/homes/:id" element={<HomeDetailPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('HomeDetailPage — on shift now', () => {
  it('lists who is on shift and lets the manager end a shift and sign them out', async () => {
    renderPage();
    expect(await screen.findByText('Sam Staff')).toBeDefined();
    fireEvent.click(
      screen.getByRole('button', { name: "End Sam Staff's shift and sign them out" }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirm sign-out' }));
    await waitFor(() => expect(ended).toEqual([`/api/shifts/${session.id}/terminate`]));
    expect(await screen.findByText('Nobody is on shift here right now.')).toBeDefined();
  });
});

describe('HomeDetailPage — assigning staff', () => {
  it('assigns several ticked staff in one go', async () => {
    renderPage();
    const button = await screen.findByRole('button', { name: 'Assign selected (0)' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Alex Able'));
    fireEvent.click(screen.getByLabelText('Blair Baker'));
    fireEvent.click(screen.getByRole('button', { name: 'Assign selected (2)' }));
    await waitFor(() =>
      expect(assigned).toEqual([
        { staffId: ALEX.id, homeId: HOME_ID },
        { staffId: BLAIR.id, homeId: HOME_ID },
      ]),
    );
  });

  it('ticks every unassigned staff member with Select all', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Select all' }));
    expect((screen.getByLabelText('Alex Able') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Blair Baker') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole('button', { name: 'Assign selected (2)' })).toBeDefined();
  });
});
