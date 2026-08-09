import type { Role } from '@care/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { setAccessToken } from '../lib/api';
import ManagerSummaryPage from './ManagerSummaryPage';

/**
 * Summary component tests. The weekly summary loads from a mocked /api/summary (matched
 * regardless of the ?weekCommencing query, since the default week is computed at render).
 * Covers: a row with its backend-computed badge, a planless row, expanding to the per-service-
 * user breakdown, and the week picker triggering a new week.
 */

const settings = {
  id: 'settings-1',
  greenMin: 90,
  amberMin: 75,
  redOverPct: 110,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

function makeSummary() {
  return {
    weekCommencing: '2026-08-03',
    settings,
    rows: [
      {
        serviceUser: {
          id: 'su-1',
          name: 'Ada Lovelace',
          address: null,
          contractedHours: 10,
          active: true,
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
        weekPlanId: 'plan-1',
        compliance: {
          deliveredMinutes: 600,
          contractedMinutes: 600,
          remainingMinutes: 0,
          deliveryPct: 100,
          status: 'ON_TRACK',
        },
        missedCount: 0,
        refusedCount: 0,
        reviewHintCount: 1,
        activityBreakdown: [
          { activityTypeId: 'act-1', activityName: 'Shopping', entryCount: 2, deliveredMinutes: 600 },
        ],
      },
      {
        serviceUser: {
          id: 'su-2',
          name: 'Bob Stone',
          address: null,
          contractedHours: 8,
          active: true,
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
        weekPlanId: null,
        compliance: null,
        missedCount: 0,
        refusedCount: 0,
        reviewHintCount: 0,
        activityBreakdown: [],
      },
    ],
  };
}

function mockApi(role: Role = 'MANAGER') {
  globalThis.fetch = mock(async (input: string | URL | Request) => {
    const url = String(input);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    if (url === '/api/auth/refresh') {
      return json({
        accessToken: 't',
        user: {
          id: 'me',
          name: 'Test User',
          email: 'test@example.com',
          role,
          active: true,
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
      });
    }
    if (url.startsWith('/api/summary')) return json(makeSummary());
    return new Response(null, { status: 404 });
  }) as unknown as typeof fetch;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuthProvider>
          <ManagerSummaryPage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  setAccessToken(null);
  mockApi();
});
afterEach(() => {
  cleanup();
});

describe('ManagerSummaryPage', () => {
  it('renders a service user row with its backend-computed status badge', async () => {
    renderPage();
    // Name sits inside the expand toggle (with a ▸ prefix), so match loosely.
    expect(await screen.findByRole('button', { name: /Ada Lovelace/ })).toBeDefined();
    expect(screen.getByLabelText('Compliance status: On Track')).toBeDefined();
    expect(screen.getByText('100%')).toBeDefined(); // deliveryPct straight from the mock
    expect(screen.getByText('⚑ 1 to review')).toBeDefined();
  });

  it('shows a "No plan" row with a create link for a service user without a plan', async () => {
    renderPage();
    expect(await screen.findByText(/No plan/)).toBeDefined();
    expect(screen.getByRole('link', { name: 'Create plan' })).toBeDefined();
  });

  it('expands a row to reveal the per-service-user activity breakdown', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Ada Lovelace/ }));
    expect(await screen.findByText('Activity breakdown')).toBeDefined();
    expect(screen.getByText('Shopping')).toBeDefined();
    expect(screen.getByRole('link', { name: 'View plan' })).toBeDefined();
  });

  it('hides the "Create plan" link from an auditor but still lets them view plans', async () => {
    mockApi('AUDITOR');
    renderPage();
    expect(await screen.findByText(/No plan/)).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Create plan' })).toBeNull();
    // Read-only drill-in remains: expanding a planned row still offers "View plan".
    fireEvent.click(await screen.findByRole('button', { name: /Ada Lovelace/ }));
    expect(await screen.findByRole('link', { name: 'View plan' })).toBeDefined();
  });

  it('moves to another week with the picker', async () => {
    renderPage();
    const label = await screen.findByText(/^Week of /);
    const initial = label.textContent;
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    await waitFor(() =>
      expect(screen.getByText(/^Week of /).textContent).not.toBe(initial),
    );
  });
});
