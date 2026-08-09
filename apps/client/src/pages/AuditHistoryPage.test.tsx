import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { setAccessToken } from '../lib/api';
import AuditHistoryPage from './AuditHistoryPage';

/**
 * Audit history component tests. The feed loads from a mocked /api/audit-logs. Covers a
 * field-level change row (from → to) and the empty state. The page is read-only, so there is
 * nothing to submit — only display assertions.
 */

function makeLogs() {
  return [
    {
      id: '11111111-1111-4111-8111-111111111111',
      userId: '99999999-9999-4999-8999-999999999999',
      action: 'RECORD',
      entityType: 'DAY_ENTRY',
      entityId: '55555555-5555-4555-8555-555555555555',
      field: 'timeSpent',
      fromValue: '30',
      toValue: '45',
      createdAt: '2026-08-09T09:00:00.000Z',
      actorName: 'Manny Manager',
      entityLabel: 'Ada Lovelace — MON',
    },
  ];
}

function mockApi(body: unknown) {
  globalThis.fetch = mock(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.startsWith('/api/audit-logs')) {
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(null, { status: 404 });
  }) as unknown as typeof fetch;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuditHistoryPage />
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

describe('AuditHistoryPage', () => {
  it('renders a change row with actor, record and from → to', async () => {
    mockApi(makeLogs());
    renderPage();
    expect(await screen.findByText('Manny Manager')).toBeDefined();
    expect(screen.getByText('Ada Lovelace — MON')).toBeDefined();
    expect(screen.getByText('recorded Time spent')).toBeDefined();
    expect(screen.getByText('30 → 45')).toBeDefined();
  });

  it('shows an empty state when there are no changes', async () => {
    mockApi([]);
    renderPage();
    expect(await screen.findByText('No changes recorded yet.')).toBeDefined();
  });
});
