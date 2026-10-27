import type { ShiftSession } from '@care/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { mockApi } from '../lib/test-utils';
import ShiftsPage from './ShiftsPage';

/**
 * Component tests for the manager shift monitor: it lists everyone on shift across homes,
 * narrows to one home via the filter, and "End & sign out" asks for confirmation (with an
 * optional reason) before POSTing terminate. Cancelling sends nothing. The API is mocked.
 */

const HOME_A = '33333333-3333-4333-8333-333333333333';
const HOME_B = '44444444-4444-4444-8444-444444444444';

function home(id: string, name: string) {
  return {
    id,
    name,
    address: null,
    active: true,
    createdAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
  };
}

function session(id: string, staffName: string, homeId: string, homeName: string): ShiftSession {
  return {
    id,
    staffId: '11111111-1111-4111-8111-111111111111',
    homeId,
    homeName,
    staffName,
    startedAt: '2026-10-27T08:00:00.000Z',
    expiresAt: '2026-10-27T20:00:00.000Z',
    endedAt: null,
  };
}

const SAM = session('55555555-5555-4555-8555-555555555555', 'Sam Staff', HOME_A, 'Riverside House');
const JO = session('66666666-6666-4666-8666-666666666666', 'Jo Carer', HOME_B, 'Oak Lodge');

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

let requested: string[] = [];
let terminated: { url: string; body?: string }[] = [];

beforeEach(() => {
  requested = [];
  terminated = [];
  mockApi(async (url, init) => {
    requested.push(url);
    if (url === '/api/homes?active=true') {
      return json([home(HOME_A, 'Riverside House'), home(HOME_B, 'Oak Lodge')]);
    }
    if (url === '/api/shifts/active') return json([SAM, JO]);
    if (url === `/api/shifts/active?homeId=${HOME_B}`) return json([JO]);
    if (url.endsWith('/terminate') && init.method === 'POST') {
      terminated.push({ url, body: init.body });
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 404 });
  });
});
afterEach(() => cleanup());

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ShiftsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ShiftsPage', () => {
  it('lists everyone on shift across homes', async () => {
    renderPage();
    expect(await screen.findByText('Sam Staff')).toBeDefined();
    expect(screen.getByText('Jo Carer')).toBeDefined();
    expect(screen.getByRole('cell', { name: 'Oak Lodge' })).toBeDefined();
  });

  it('narrows the list to one home', async () => {
    renderPage();
    await screen.findByText('Sam Staff');
    await screen.findByRole('option', { name: 'Oak Lodge' });
    fireEvent.change(screen.getByLabelText('Home'), { target: { value: HOME_B } });
    await waitFor(() => expect(screen.queryByText('Sam Staff')).toBeNull());
    expect(screen.getByText('Jo Carer')).toBeDefined();
    expect(requested).toContain(`/api/shifts/active?homeId=${HOME_B}`);
  });

  it('ends a shift and signs the person out, with the reason, after confirming', async () => {
    renderPage();
    fireEvent.click(
      await screen.findByRole('button', { name: "End Sam Staff's shift and sign them out" }),
    );
    fireEvent.change(screen.getByLabelText(/Reason \(optional\)/), {
      target: { value: 'Not on the rota' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm sign-out' }));
    await waitFor(() => expect(terminated.length).toBe(1));
    expect(terminated[0]!.url).toBe(`/api/shifts/${SAM.id}/terminate`);
    expect(JSON.parse(terminated[0]!.body!)).toEqual({ reason: 'Not on the rota' });
  });

  it('sends nothing when the manager cancels', async () => {
    renderPage();
    fireEvent.click(
      await screen.findByRole('button', { name: "End Sam Staff's shift and sign them out" }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      await screen.findByRole('button', { name: "End Sam Staff's shift and sign them out" }),
    ).toBeDefined();
    expect(terminated).toEqual([]);
  });
});
