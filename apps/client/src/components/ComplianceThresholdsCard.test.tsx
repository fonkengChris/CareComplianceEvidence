import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { setAccessToken } from '../lib/api';
import { mockApi as installApiMock } from '../lib/test-utils';
import ComplianceThresholdsCard from './ComplianceThresholdsCard';

/**
 * Manager thresholds-editor tests: the form seeds from GET, a valid change PUTs the full band,
 * and an out-of-order change (amber > green) is blocked client-side by the shared schema refine
 * before any network call. Same coverage as the old standalone page, now the embedded card.
 */

const settings = {
  id: '11111111-1111-4111-8111-111111111111',
  greenMin: 90,
  amberMin: 75,
  redOverPct: 110,
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
};

let putCount = 0;
let lastBody: Record<string, unknown> | null = null;

function mockApi() {
  putCount = 0;
  lastBody = null;
  installApiMock(async (url, init) => {
    const method = init.method;
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (url === '/api/compliance-settings' && method === 'GET') return json(settings);
    if (url === '/api/compliance-settings' && method === 'PUT') {
      putCount += 1;
      lastBody = JSON.parse(String(init.body)) as Record<string, unknown>;
      return json({ ...settings, ...lastBody });
    }
    return new Response(null, { status: 404 });
  });
}

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ComplianceThresholdsCard />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  setAccessToken(null);
  mockApi();
});
afterEach(() => cleanup());

describe('ComplianceThresholdsCard', () => {
  it('seeds the form from the loaded settings', async () => {
    renderCard();
    expect(await screen.findByDisplayValue('90')).toBeDefined();
    expect(screen.getByDisplayValue('75')).toBeDefined();
    expect(screen.getByDisplayValue('110')).toBeDefined();
  });

  it('PUTs the full band on a valid change', async () => {
    renderCard();
    fireEvent.change(await screen.findByLabelText('On Track minimum (green %)'), {
      target: { value: '85' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Compliance thresholds' }));
    await waitFor(() => expect(putCount).toBe(1));
    expect(lastBody).toEqual({ greenMin: 85, amberMin: 75, redOverPct: 110 });
  });

  it('blocks an out-of-order change (amber above green) before any PUT', async () => {
    renderCard();
    fireEvent.change(await screen.findByLabelText('Under Target minimum (amber %)'), {
      target: { value: '95' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Compliance thresholds' }));
    expect(await screen.findByRole('alert')).toBeDefined();
    expect(putCount).toBe(0);
  });
});
