import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { setAccessToken } from '../lib/api';
import UserFormPage from './UserFormPage';

/**
 * Create-form tests: a too-short password (shared schema min 8) must block the submit
 * before any network call, and a valid submit must POST to /api/auth/register and
 * navigate back to the users list.
 */

const created = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'New User',
  email: 'new@example.com',
  role: 'STAFF',
  active: true,
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
};

let postCount = 0;
let lastBody: Record<string, unknown> | null = null;

function mockApi() {
  postCount = 0;
  lastBody = null;
  globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input) === '/api/auth/register' && init?.method === 'POST') {
      postCount += 1;
      lastBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify(created), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(null, { status: 404 });
  }) as unknown as typeof fetch;
}

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/users/new']}>
        <Routes>
          <Route path="/users/new" element={<UserFormPage />} />
          <Route path="/users" element={<div>Users List</div>} />
        </Routes>
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

function fill(name: string, value: string) {
  fireEvent.change(screen.getByLabelText(name), { target: { value } });
}
function submitForm() {
  fireEvent.submit(screen.getByRole('form', { name: 'Add new user' }));
}

describe('UserFormPage (create)', () => {
  it('blocks submit and shows a validation error for a short password', async () => {
    renderForm();
    fill('Name', 'New User');
    fill('Email', 'new@example.com');
    fill('Password', 'short');
    submitForm();
    expect(await screen.findByRole('alert')).toBeDefined();
    expect(postCount).toBe(0);
  });

  it('POSTs the chosen role and navigates to the list on a valid submit', async () => {
    renderForm();
    fill('Name', 'New User');
    fill('Email', 'new@example.com');
    fill('Role', 'MANAGER');
    fill('Password', 'Password123!');
    submitForm();
    expect(await screen.findByText('Users List')).toBeDefined();
    await waitFor(() => expect(postCount).toBe(1));
    expect(lastBody?.role).toBe('MANAGER');
  });
});
