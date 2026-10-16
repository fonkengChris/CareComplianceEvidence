import type { AccessRequest } from '@care/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { setAccessToken } from '../lib/api';
import { mockApi } from '../lib/test-utils';
import AccessRequestsPage from './AccessRequestsPage';

/**
 * Manager review of auditor access requests: pending rows offer Approve/Reject, approved rows
 * offer Revoke, and each action posts to the matching decision endpoint.
 */

const base: AccessRequest = {
  id: 'req-1',
  auditorId: 'aud-1',
  auditorName: 'Avery Auditor',
  serviceUserId: 'su-1',
  serviceUserName: 'Ada Lovelace',
  status: 'PENDING',
  reason: 'Quarterly audit',
  requestedAt: '2026-08-01T00:00:00.000Z',
  decidedById: null,
  decidedByName: null,
  decidedAt: null,
};

const rows: AccessRequest[] = [
  base,
  {
    ...base,
    id: 'req-2',
    serviceUserId: 'su-2',
    serviceUserName: 'Bob Stone',
    status: 'APPROVED',
    decidedById: 'mgr',
    decidedByName: 'Morgan Manager',
    decidedAt: '2026-08-02T00:00:00.000Z',
  },
];

let posted: string[] = [];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AccessRequestsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  setAccessToken('t');
  posted = [];
  mockApi(async (url, init) => {
    if (url === '/api/auditor-access' && init.method === 'GET') return json(rows);
    if (init.method === 'POST' && url.startsWith('/api/auditor-access/')) {
      posted.push(url);
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 404 });
  });
});
afterEach(() => {
  cleanup();
});

describe('AccessRequestsPage', () => {
  it('lists pending and approved requests with their reason', async () => {
    renderPage();
    expect(await screen.findAllByText('Quarterly audit', { selector: 'td' })).toHaveLength(2);
    expect(
      screen.getByRole('button', { name: 'Approve Avery Auditor for Ada Lovelace' }),
    ).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Revoke Avery Auditor for Bob Stone' }),
    ).toBeDefined();
    expect(screen.getByText('No decided requests yet.')).toBeDefined();
  });

  it('approves, rejects and revokes via the decision endpoints', async () => {
    renderPage();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Approve Avery Auditor for Ada Lovelace' }),
    );
    await waitFor(() => expect(posted).toContain('/api/auditor-access/req-1/approve'));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reject Avery Auditor for Ada Lovelace' }),
    );
    await waitFor(() => expect(posted).toContain('/api/auditor-access/req-1/reject'));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Revoke Avery Auditor for Bob Stone' }),
    );
    await waitFor(() => expect(posted).toContain('/api/auditor-access/req-2/revoke'));
  });
});
