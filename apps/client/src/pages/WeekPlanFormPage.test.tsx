import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { setAccessToken } from '../lib/api';
import { mockApi as installApiMock } from '../lib/test-utils';
import WeekPlanFormPage from './WeekPlanFormPage';

/**
 * Create-form component tests: an empty week-commencing date must block submission
 * before any network call, and a valid submit must POST to /api/week-plans and navigate
 * to the new plan's planner page. The service user comes from the route param.
 */

const serviceUserId = '22222222-2222-4222-8222-222222222222';
const created = {
  id: '11111111-1111-4111-8111-111111111111',
  serviceUserId,
  weekCommencing: '2026-08-17',
  notes: null,
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
};

let postCount = 0;

function mockApi() {
  postCount = 0;
  installApiMock(async (url, init) => {
    if (url === '/api/week-plans' && init.method === 'POST') {
      postCount += 1;
      return new Response(JSON.stringify(created), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(null, { status: 404 });
  });
}

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/service-users/${serviceUserId}/week-plans/new`]}>
        <Routes>
          <Route
            path="/service-users/:serviceUserId/week-plans/new"
            element={<WeekPlanFormPage />}
          />
          <Route path="/week-plans/:id" element={<div>Planner Page</div>} />
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

function submitForm() {
  fireEvent.submit(screen.getByRole('form', { name: 'New week plan' }));
}

describe('WeekPlanFormPage (create)', () => {
  it('blocks submit and shows a validation error when the week is empty', async () => {
    renderForm();
    submitForm();
    expect(await screen.findByRole('alert')).toBeDefined();
    expect(postCount).toBe(0);
  });

  it('POSTs and navigates to the planner on a valid submit', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('Week commencing'), {
      target: { value: '2026-08-17' },
    });
    submitForm();
    expect(await screen.findByText('Planner Page')).toBeDefined();
    await waitFor(() => expect(postCount).toBe(1));
  });
});
