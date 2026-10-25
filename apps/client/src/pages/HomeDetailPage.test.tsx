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
 * Component tests for the manager's "On shift now" panel: it lists who is on shift at the home
 * and "End shift" POSTs that session's end. The API is mocked.
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

let shifts: ShiftSession[] = [];
let ended: string[] = [];

beforeEach(() => {
  setAccessToken(null);
  shifts = [session];
  ended = [];
  mockApi(async (url) => {
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
    if (url === `/api/shifts/home/${HOME_ID}`) return json(shifts);
    if (url.endsWith('/end')) {
      ended.push(url);
      shifts = [];
      return new Response(null, { status: 204 });
    }
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
  it('lists who is on shift and lets the manager end a shift', async () => {
    renderPage();
    expect(await screen.findByText('Sam Staff')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'End shift' }));
    await waitFor(() => expect(ended).toEqual([`/api/shifts/${session.id}/end`]));
    expect(await screen.findByText('Nobody is on shift here right now.')).toBeDefined();
  });
});
