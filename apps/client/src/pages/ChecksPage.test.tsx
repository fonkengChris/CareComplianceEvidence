import type { CheckOccurrence, CheckOverview, CheckWeekGrid, Role } from '@care/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { setAccessToken } from '../lib/api';
import { mockApi } from '../lib/test-utils';
import ChecksPage from './ChecksPage';

/**
 * Component tests for the Checks page: staff see the open checks at their shift home (or a
 * prompt to start a shift); managers see the week grid with statuses and PDF downloads.
 */

const HOME = '33333333-3333-4333-8333-333333333333';
const TEMPLATE = '55555555-5555-4555-8555-555555555555';

const due: CheckOccurrence[] = [
  {
    templateId: TEMPLATE,
    templateName: 'Daily Checks',
    dueDate: '2026-11-24',
    dueByTime: '12:00',
    status: 'OVERDUE',
    submissionId: null,
    submittedByName: null,
    submittedAt: null,
    issueCount: null,
  },
  {
    templateId: '66666666-6666-4666-8666-666666666666',
    templateName: 'Sharps Box Check',
    dueDate: '2026-11-24',
    dueByTime: null,
    status: 'DONE',
    submissionId: '77777777-7777-4777-8777-777777777777',
    submittedByName: 'Jane Smith',
    submittedAt: '2026-11-24T09:00:00.000Z',
    issueCount: 0,
  },
];

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

function mockRoutes(role: Role, { onShift = true }: { onShift?: boolean } = {}) {
  mockApi(async (url) => {
    if (url === '/api/auth/refresh') {
      return json({
        accessToken: 't',
        user: {
          id: 'me',
          name: 'Test User',
          email: 'test@example.com',
          role,
          active: true,
          createdAt: '2026-08-08T00:00:00.000Z',
          updatedAt: '2026-08-08T00:00:00.000Z',
        },
      });
    }
    if (url === '/api/shifts/me') {
      return json(
        onShift
          ? {
              id: '88888888-8888-4888-8888-888888888888',
              staffId: 'me',
              homeId: HOME,
              homeName: 'Riverside House',
              staffName: 'Test User',
              startedAt: '2026-11-24T08:00:00.000Z',
              expiresAt: '2026-11-24T20:00:00.000Z',
              endedAt: null,
            }
          : null,
      );
    }
    if (url === `/api/house-checks/homes/${HOME}/due`) return json(due);
    if (url === '/api/house-checks/overview') {
      const overview: CheckOverview = {
        since: '2026-11-17',
        homes: [
          {
            homeId: HOME,
            homeName: 'Riverside House',
            open: [due[0]],
            missed: [
              { ...due[1], templateName: 'Room Checks', dueDate: '2026-11-17', status: 'MISSED' },
            ],
            flagged: [{ ...due[1], issueCount: 3 }],
          },
          {
            homeId: '99999999-9999-4999-8999-999999999999',
            homeName: 'Hill House',
            open: [],
            missed: [],
            flagged: [],
          },
        ],
      };
      return json(overview);
    }
    if (url.startsWith('/api/homes')) {
      return json([
        {
          id: HOME,
          name: 'Riverside House',
          address: null,
          active: true,
          createdAt: '2026-08-08T00:00:00.000Z',
          updatedAt: '2026-08-08T00:00:00.000Z',
        },
      ]);
    }
    if (url.startsWith(`/api/house-checks/homes/${HOME}/week`)) {
      const weekCommencing = new URL(url, 'http://x').searchParams.get('weekCommencing')!;
      const grid: CheckWeekGrid = {
        homeId: HOME,
        weekCommencing,
        rows: [
          {
            templateId: TEMPLATE,
            templateName: 'Daily Checks',
            occurrences: [
              { ...due[0], dueDate: weekCommencing, status: 'MISSED' },
              {
                ...due[1],
                templateId: TEMPLATE,
                templateName: 'Daily Checks',
                dueDate: weekCommencing.replace(/\d\d$/, (d) =>
                  String(Number(d) + 1).padStart(2, '0'),
                ),
                status: 'LATE',
                issueCount: 2,
              },
            ],
          },
        ],
      };
      return json(grid);
    }
    return new Response(null, { status: 404 });
  });
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuthProvider>
          <ChecksPage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => setAccessToken(null));
afterEach(cleanup);

describe('ChecksPage (staff)', () => {
  it('lists the checks open at the shift home with a Start link for unfinished ones', async () => {
    mockRoutes('STAFF');
    renderPage();
    expect(await screen.findByText('Daily Checks')).toBeDefined();
    expect(screen.getByText('Overdue')).toBeDefined();
    expect(screen.getByText(/Completed by Jane Smith/)).toBeDefined();
    const start = screen.getByRole('link', { name: 'Start' });
    expect(start.getAttribute('href')).toBe(`/checks/${TEMPLATE}/${HOME}/2026-11-24`);
    expect(screen.getAllByRole('link', { name: 'Start' })).toHaveLength(1);
  });

  it('asks staff off shift to start one', async () => {
    mockRoutes('STAFF', { onShift: false });
    renderPage();
    expect(await screen.findByText(/Start a shift at your home/)).toBeDefined();
  });
});

describe('ChecksPage (manager)', () => {
  it('shows the week grid with statuses, issues and a PDF download', async () => {
    mockRoutes('MANAGER');
    renderPage();
    expect(await screen.findByText('Done late')).toBeDefined();
    // Once as the grid badge, once as the overview's column header.
    expect(screen.getAllByText('Missed')).toHaveLength(2);
    expect(screen.getByText('2 to report')).toBeDefined();
    expect(screen.getByRole('button', { name: /Download PDF/ })).toBeDefined();
    const view = screen.getByRole('link', { name: /^View —/ });
    expect(view.getAttribute('href')).toBe(`/checks/submissions/${due[1].submissionId}`);
    expect(screen.getByRole('link', { name: /Manage checks/ })).toBeDefined();
  });

  it('shows the all-homes overview: still to do, missed and issues to report', async () => {
    mockRoutes('MANAGER');
    renderPage();
    expect(await screen.findByText('All homes')).toBeDefined();
    expect(await screen.findByText(/Room Checks · Tue,? 17 Nov/)).toBeDefined();
    const flagged = screen.getByRole('link', { name: /Sharps Box Check · .* 3 to report/ });
    expect(flagged.getAttribute('href')).toBe(`/checks/submissions/${due[1].submissionId}`);
    expect(screen.getByText('All up to date')).toBeDefined();
  });
});
