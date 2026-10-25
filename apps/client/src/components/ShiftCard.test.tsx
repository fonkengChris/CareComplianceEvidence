import type { Home, ShiftSession } from '@care/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { mockApi } from '../lib/test-utils';
import { ShiftCard } from './ShiftCard';

/**
 * Component tests for staff shift check-in: off shift with one home → a single start button
 * that POSTs that home; several homes → a picker; on shift → the end button POSTs the session
 * end; no homes and no shift → nothing rendered (direct-assignment-only staff).
 */

const HOME_A: Home = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Riverside House',
  address: null,
  active: true,
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
};
const HOME_B: Home = { ...HOME_A, id: '44444444-4444-4444-8444-444444444444', name: 'Oak Lodge' };

const SESSION: ShiftSession = {
  id: '55555555-5555-4555-8555-555555555555',
  staffId: '11111111-1111-4111-8111-111111111111',
  homeId: HOME_A.id,
  homeName: HOME_A.name,
  staffName: 'Sam Staff',
  startedAt: '2026-10-25T08:00:00.000Z',
  expiresAt: '2026-10-25T20:00:00.000Z',
  endedAt: null,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

let calls: { url: string; method: string; body?: string }[] = [];

function setup(state: { shift: ShiftSession | null; homes: Home[] }) {
  calls = [];
  mockApi(async (url, init) => {
    calls.push({ url, method: init.method, body: init.body });
    if (url === '/api/shifts/me') return json(state.shift);
    if (url === '/api/assignments/my-homes') return json(state.homes);
    if (url === '/api/shifts' && init.method === 'POST') {
      state.shift = SESSION;
      return json(SESSION, 201);
    }
    if (url.endsWith('/end')) {
      state.shift = null;
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 404 });
  });
}

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ShiftCard />
    </QueryClientProvider>,
  );
}

afterEach(() => cleanup());

describe('ShiftCard', () => {
  it('starts a shift at the only home with one tap', async () => {
    setup({ shift: null, homes: [HOME_A] });
    renderCard();
    fireEvent.click(await screen.findByRole('button', { name: 'Start shift at Riverside House' }));
    await waitFor(() =>
      expect(calls.some((c) => c.url === '/api/shifts' && c.method === 'POST')).toBe(true),
    );
    const post = calls.find((c) => c.url === '/api/shifts' && c.method === 'POST')!;
    expect(JSON.parse(post.body!)).toEqual({ homeId: HOME_A.id });
    expect(await screen.findByText(/On shift at Riverside House until/)).toBeDefined();
  });

  it('asks which home when the staff member has several', async () => {
    setup({ shift: null, homes: [HOME_A, HOME_B] });
    renderCard();
    const button = await screen.findByRole('button', { name: 'Start shift' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Home'), { target: { value: HOME_B.id } });
    fireEvent.click(button);
    await waitFor(() => {
      const post = calls.find((c) => c.url === '/api/shifts' && c.method === 'POST');
      expect(post && JSON.parse(post.body!)).toEqual({ homeId: HOME_B.id });
    });
  });

  it('ends the active shift', async () => {
    setup({ shift: SESSION, homes: [HOME_A] });
    renderCard();
    fireEvent.click(await screen.findByRole('button', { name: 'End shift' }));
    await waitFor(() =>
      expect(calls.some((c) => c.url === `/api/shifts/${SESSION.id}/end`)).toBe(true),
    );
    expect(
      await screen.findByRole('button', { name: 'Start shift at Riverside House' }),
    ).toBeDefined();
  });

  it('renders nothing for staff with no home and no shift', async () => {
    setup({ shift: null, homes: [] });
    const { container } = renderCard();
    await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(2));
    await new Promise((r) => setTimeout(r, 0));
    expect(container.textContent).toBe('');
  });
});
