import type { ShiftSession } from '@care/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { setAccessToken } from '../lib/api';
import { storedDisplayToken, storeDisplayToken } from '../lib/shifts';
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

const DISPLAY = {
  id: '88888888-8888-4888-8888-888888888888',
  homeId: HOME_ID,
  name: 'Office tablet',
  createdAt: '2026-11-23T09:00:00.000Z',
  lastSeenAt: null,
  revokedAt: null,
};

let shifts: ShiftSession[] = [];
let ended: string[] = [];
let assigned: unknown[] = [];
let displays: (typeof DISPLAY)[] = [];
let homeStaff: ReturnType<typeof staffUser>[] = [];
let posts: { url: string; body: unknown }[] = [];

beforeEach(() => {
  setAccessToken(null);
  shifts = [session];
  ended = [];
  assigned = [];
  displays = [];
  homeStaff = [];
  posts = [];
  mockApi(async (url, init) => {
    if (init.method === 'POST' && url !== '/api/auth/refresh') {
      posts.push({ url, body: init.body ? JSON.parse(init.body) : undefined });
    }
    if (url === `/api/homes/${HOME_ID}/displays` && init.method === 'GET') return json(displays);
    if (url === `/api/homes/${HOME_ID}/displays` && init.method === 'POST') {
      displays = [DISPLAY];
      return json({ display: DISPLAY, token: 'raw-pairing-token' });
    }
    if (url.endsWith('/revoke')) {
      displays = [];
      return new Response(null, { status: 204 });
    }
    if (url === '/api/shifts/start-for') return json(session);
    if (url === '/api/auth/logout') return new Response(null, { status: 204 });
    if (url === `/api/assignments/home/${HOME_ID}`) return json(homeStaff);
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
afterEach(() => {
  cleanup();
  storeDisplayToken(null);
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/homes/${HOME_ID}`]}>
        <AuthProvider>
          <Routes>
            <Route path="/homes/:id" element={<HomeDetailPage />} />
            <Route path="/check-in-display" element={<div>Check-in display</div>} />
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

describe('HomeDetailPage — work devices', () => {
  it('makes this device a work device: keeps its token, signs the manager out, shows the code', async () => {
    renderPage();
    fireEvent.change(await screen.findByLabelText('Device name'), {
      target: { value: 'Office tablet' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Make this a work device' }));
    expect(await screen.findByText('Check-in display')).toBeDefined();
    expect(storedDisplayToken()).toBe('raw-pairing-token');
    await waitFor(() => expect(posts.some((p) => p.url === '/api/auth/logout')).toBe(true));
    expect(posts).toContainEqual({
      url: `/api/homes/${HOME_ID}/displays`,
      body: { name: 'Office tablet' },
    });
  });

  it('warns when no device is paired, then pairs another via its one-time link', async () => {
    renderPage();
    expect(await screen.findByText(/No work device yet/)).toBeDefined();
    fireEvent.change(screen.getByLabelText('Device name'), {
      target: { value: 'Office tablet' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Get a pairing link' }));
    const link = (await screen.findByLabelText('Pairing link')) as HTMLInputElement;
    expect(link.value).toMatch(/\/check-in-display#token=raw-pairing-token$/);
    expect(storedDisplayToken()).toBeNull();
    expect(posts).toContainEqual({
      url: `/api/homes/${HOME_ID}/displays`,
      body: { name: 'Office tablet' },
    });
  });

  it('unpairs a work device', async () => {
    displays = [DISPLAY];
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Unpair Office tablet' }));
    await waitFor(() =>
      expect(
        posts.some((p) => p.url === `/api/homes/${HOME_ID}/displays/${DISPLAY.id}/revoke`),
      ).toBe(true),
    );
  });

  it("lets a manager start an assigned staff member's shift with a reason", async () => {
    homeStaff = [ALEX];
    renderPage();
    fireEvent.change(await screen.findByLabelText('Staff member'), { target: { value: ALEX.id } });
    fireEvent.change(screen.getByLabelText('Reason (optional)'), {
      target: { value: 'Tablet offline' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Start a shift for a staff member' }));
    await waitFor(() =>
      expect(posts).toContainEqual({
        url: '/api/shifts/start-for',
        body: { staffId: ALEX.id, homeId: HOME_ID, reason: 'Tablet offline' },
      }),
    );
  });
});
