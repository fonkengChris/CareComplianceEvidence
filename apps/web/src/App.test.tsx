import { afterEach, expect, mock, test } from 'bun:test';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import App from './App';

afterEach(() => {
  cleanup();
});

test('fetches and displays the API health status', async () => {
  globalThis.fetch = mock(
    async () =>
      new Response(JSON.stringify({ status: 'ok', db: 'up' }), {
        headers: { 'content-type': 'application/json' },
      }),
  ) as unknown as typeof fetch;

  render(<App />);

  await waitFor(() => {
    expect(screen.getByRole('status').textContent).toContain('API status: ok');
  });
  expect(screen.getByRole('status').textContent).toContain('DB: up');
});
