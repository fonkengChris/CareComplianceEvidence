import type { Role } from '@care/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { setAccessToken } from '../lib/api';
import { mockApi as installApiMock } from '../lib/test-utils';
import ReportsPage from './ReportsPage';

/**
 * Reports/export page tests. Reuses the mocked /api/summary to drive the week's rows: a planned
 * row surfaces an "Export PDF" action + "View plan" link, a planless row is filtered out, and the
 * week picker drives a new fetch.
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
        notes: 'Steady week.',
        compliance: {
          deliveredMinutes: 600,
          contractedMinutes: 600,
          remainingMinutes: 0,
          deliveryPct: 100,
          status: 'ON_TRACK',
        },
        missedCount: 0,
        refusedCount: 0,
        reviewHintCount: 0,
        activityBreakdown: [],
        dailyMinutes: { MON: 120, TUE: 0, WED: 90, THU: 0, FRI: 0, SAT: 0, SUN: 0 },
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
        notes: null,
        compliance: null,
        missedCount: 0,
        refusedCount: 0,
        reviewHintCount: 0,
        activityBreakdown: [],
        dailyMinutes: { MON: 0, TUE: 0, WED: 0, THU: 0, FRI: 0, SAT: 0, SUN: 0 },
      },
    ],
  };
}

function mockApi(role: Role = 'MANAGER') {
  installApiMock(async (url) => {
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
    if (url === '/api/compliance-settings') return json(settings);
    if (url === '/api/recording-guidance') return json({ guidance: 'Capture the outcome.' });
    return new Response(null, { status: 404 });
  });
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuthProvider>
          <ReportsPage />
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

describe('ReportsPage', () => {
  it('lists a planned service user with an export action and a plan link', async () => {
    renderPage();
    expect(await screen.findByText('Ada Lovelace')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Export PDF' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'View plan' })).toBeDefined();
  });

  it('shows the per-day (Mon–Sun) delivered hours in the summary table', async () => {
    renderPage();
    await screen.findByText('Ada Lovelace');
    expect(screen.getByRole('columnheader', { name: 'Mon' })).toBeDefined();
    expect(screen.getByRole('columnheader', { name: 'Sun' })).toBeDefined();
    // Monday 120 min → 2.0h, Wednesday 90 min → 1.5h; delivered total 600 min → 10.0h.
    expect(screen.getByText('2.0h')).toBeDefined();
    expect(screen.getByText('1.5h')).toBeDefined();
    expect(screen.getAllByText('10.0h').length).toBeGreaterThan(0);
  });

  it('omits service users without a plan for the week', async () => {
    renderPage();
    await screen.findByText('Ada Lovelace');
    expect(screen.queryByText('Bob Stone')).toBeNull();
  });

  it('moves to another week with the picker', async () => {
    renderPage();
    const label = await screen.findByText(/^Week of /);
    const initial = label.textContent;
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    await waitFor(() => expect(screen.getByText(/^Week of /).textContent).not.toBe(initial));
  });

  it('shows the compliance thresholds editor to a manager', async () => {
    renderPage();
    expect(await screen.findByRole('form', { name: 'Compliance thresholds' })).toBeDefined();
  });

  it('hides the compliance thresholds editor from an auditor', async () => {
    mockApi('AUDITOR');
    renderPage();
    await screen.findByText('Ada Lovelace');
    expect(screen.queryByRole('form', { name: 'Compliance thresholds' })).toBeNull();
  });
});
