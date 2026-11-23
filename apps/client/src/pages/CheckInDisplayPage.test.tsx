import type { CheckInDisplayCode } from '@care/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { mockApi } from '../lib/test-utils';
import CheckInDisplayPage, { DISPLAY_TOKEN_KEY } from './CheckInDisplayPage';

/**
 * Component tests for a home's check-in screen: with a stored display token it fetches and shows
 * the current code (sending the token header, not a user session) plus a QR; without one, or when
 * the server rejects the token (revoked), it explains the screen needs pairing.
 */

const CURRENT: CheckInDisplayCode = {
  homeId: '33333333-3333-4333-8333-333333333333',
  homeName: 'Riverside House',
  code: '482913',
  expiresAt: new Date(Date.now() + 45_000).toISOString(),
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CheckInDisplayPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  localStorage.removeItem(DISPLAY_TOKEN_KEY);
});

describe('CheckInDisplayPage', () => {
  it('shows the current code and QR for a paired display, authenticating with its token', async () => {
    localStorage.setItem(DISPLAY_TOKEN_KEY, 'display-token');
    let sentToken: string | undefined;
    mockApi(async (url, init) => {
      if (url === '/api/check-in-display/code') {
        sentToken = init.headers['x-display-token'];
        return json(CURRENT);
      }
      return new Response(null, { status: 404 });
    });
    renderPage();
    expect((await screen.findByLabelText('Check-in code')).textContent).toBe('482913');
    expect(screen.getByText(/Riverside House/)).toBeDefined();
    expect(sentToken).toBe('display-token');
    expect(await screen.findByAltText('QR code to start your shift')).toBeDefined();
  });

  it('asks for pairing when the device has no token', async () => {
    mockApi(async () => new Response(null, { status: 404 }));
    renderPage();
    expect(await screen.findByText("This screen isn't paired")).toBeDefined();
  });

  it('asks for pairing again when the token was revoked', async () => {
    localStorage.setItem(DISPLAY_TOKEN_KEY, 'revoked-token');
    mockApi(async (url) => {
      if (url === '/api/check-in-display/code') {
        return json({ error: 'This display is not paired — ask a manager to pair it again' }, 401);
      }
      // The 401 triggers the client's one silent refresh attempt; no user session here.
      return json({ error: 'No session' }, 401);
    });
    renderPage();
    expect((await screen.findByRole('alert')).textContent).toMatch(/not paired/);
  });
});
