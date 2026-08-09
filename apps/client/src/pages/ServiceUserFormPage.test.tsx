import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { setAccessToken } from '../lib/api';
import { mockApi as installApiMock } from '../lib/test-utils';
import ServiceUserFormPage from './ServiceUserFormPage';

/**
 * Component tests for the create form: React Hook Form + zodResolver must block an
 * invalid submit before any network call, and a valid submit must POST and navigate to
 * the new record's detail page.
 */

const created = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Ada Lovelace',
  address: null,
  contractedHours: 12.5,
  active: true,
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
};

let postCount = 0;

function mockApi() {
  postCount = 0;
  installApiMock(async (url, init) => {
    if (url === '/api/service-users' && init.method === 'POST') {
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
      <MemoryRouter initialEntries={['/service-users/new']}>
        <Routes>
          <Route path="/service-users/new" element={<ServiceUserFormPage />} />
          <Route path="/service-users/:id" element={<div>Detail Page</div>} />
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

// happy-dom does not reliably perform implicit form submission on a submit-button
// click, so drive the form's submit event directly — this exercises the real
// handleSubmit/zodResolver path (in a browser, clicking Save submits normally).
function submitForm() {
  fireEvent.submit(screen.getByRole('form', { name: 'New service user' }));
}

describe('ServiceUserFormPage (create)', () => {
  it('blocks submit and shows a validation error when the name is empty', async () => {
    renderForm();
    submitForm();
    expect(await screen.findByRole('alert')).toBeDefined();
    expect(postCount).toBe(0);
  });

  it('rejects a negative contracted-hours value', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada Lovelace' } });
    fireEvent.change(screen.getByLabelText('Contracted hours'), { target: { value: '-1' } });
    submitForm();
    expect(await screen.findByRole('alert')).toBeDefined();
    expect(postCount).toBe(0);
  });

  it('POSTs and navigates to the detail page on a valid submit', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada Lovelace' } });
    fireEvent.change(screen.getByLabelText('Contracted hours'), { target: { value: '12.5' } });
    submitForm();
    expect(await screen.findByText('Detail Page')).toBeDefined();
    await waitFor(() => expect(postCount).toBe(1));
  });
});
