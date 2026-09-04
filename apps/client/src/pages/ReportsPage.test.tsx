import type { PeriodReport, Role } from '@care/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { setAccessToken } from '../lib/api';
import { mockApi as installApiMock } from '../lib/test-utils';
import ReportsPage from './ReportsPage';

/**
 * Reports/export page tests. The page drives /api/summary/period: each row is a self-contained
 * per-service-user period report, rendered as a card with the period metrics, the always-visible
 * staff notes, and an "Export PDF" action. Changing the period presets refetches with a new range.
 */

const settings = {
  id: 'settings-1',
  greenMin: 90,
  amberMin: 75,
  redOverPct: 110,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const adaReport: PeriodReport = {
  serviceUser: {
    id: 'su-1',
    name: 'Ada Lovelace',
    address: null,
    contractedHours: 10,
    homeId: null,
    active: true,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
  from: '2026-08-03',
  to: '2026-08-31',
  weekCount: 5,
  compliance: {
    deliveredMinutes: 2400,
    contractedMinutes: 3000,
    remainingMinutes: 600,
    deliveryPct: 80,
    status: 'UNDER_TARGET',
  },
  missedCount: 1,
  refusedCount: 0,
  reviewHintCount: 1,
  weeks: [
    {
      weekPlanId: 'plan-1',
      weekCommencing: '2026-08-03',
      compliance: {
        deliveredMinutes: 2400,
        contractedMinutes: 3000,
        remainingMinutes: 600,
        deliveryPct: 80,
        status: 'UNDER_TARGET',
      },
      missedCount: 1,
      refusedCount: 0,
      reviewHintCount: 1,
    },
  ],
  activityBreakdown: [],
  staffNotes: [
    {
      weekCommencing: '2026-08-03',
      day: 'MON',
      activityName: 'Shopping',
      description: null,
      timeSpent: 60,
      outcome: 'COMPLETED',
      comment: 'Went to the local market together.',
    },
  ],
  settings,
  generatedAt: '2026-09-04T09:30:00.000Z',
};

// A second service user with no plan in the range — should still be listed, but plainly.
const bobReport: PeriodReport = {
  ...adaReport,
  serviceUser: { ...adaReport.serviceUser, id: 'su-2', name: 'Bob Stone' },
  compliance: {
    deliveredMinutes: 0,
    contractedMinutes: 3000,
    remainingMinutes: 3000,
    deliveryPct: 0,
    status: 'ATTENTION',
  },
  missedCount: 0,
  refusedCount: 0,
  reviewHintCount: 0,
  weeks: [],
  activityBreakdown: [],
  staffNotes: [],
};

let lastUrl = '';

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
    if (url.startsWith('/api/summary/period')) {
      lastUrl = url;
      return json({
        from: '2026-08-03',
        to: '2026-08-31',
        weekCount: 5,
        settings,
        rows: [adaReport, bobReport],
      });
    }
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
  lastUrl = '';
  mockApi();
});
afterEach(() => {
  cleanup();
});

describe('ReportsPage', () => {
  it('shows a service user card with period metrics and an export action', async () => {
    renderPage();
    expect(await screen.findByText('Ada Lovelace')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Export PDF' })).toBeDefined();
    // Delivered 2400 min → 40.0h across the period.
    expect(screen.getByText('40.0h')).toBeDefined();
  });

  it('lists every active user, with a plain no-activity line for those without plans in range', async () => {
    renderPage();
    await screen.findByText('Ada Lovelace');
    expect(screen.getByText('Bob Stone')).toBeDefined();
    expect(screen.getByText('No plans recorded for this period.')).toBeDefined();
    // Only the user with activity (Ada) offers an export; Bob's empty card does not.
    expect(screen.getAllByRole('button', { name: 'Export PDF' })).toHaveLength(1);
  });

  it('shows the staff-recorded notes inline', async () => {
    renderPage();
    await screen.findByText('Ada Lovelace');
    expect(screen.getByText('Went to the local market together.')).toBeDefined();
    expect(screen.getByText(/Shopping/)).toBeDefined();
  });

  it('refetches with a new range when a period preset is chosen', async () => {
    renderPage();
    await screen.findByText('Ada Lovelace');
    fireEvent.click(screen.getByRole('button', { name: 'This year' }));
    // A "This year" range starts on 1 January, not the current week's Monday.
    await waitFor(() => expect(lastUrl).toContain('-01-01'));
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
