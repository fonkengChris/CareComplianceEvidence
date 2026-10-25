import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { setAccessToken } from '../lib/api';
import { mockApi as installApiMock } from '../lib/test-utils';
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
let grantBody: Record<string, unknown> | null = null;
let grantUrl = '';

const serviceUsers = [
  { id: 'su-1', name: 'Ada Lovelace', active: true },
  { id: 'su-2', name: 'Bob Stone', active: true },
  { id: 'su-3', name: 'Cara Gone', active: false },
].map((su) => ({
  ...su,
  contractedHours: 10,
  homeId: null,
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
}));

function mockApi() {
  postCount = 0;
  lastBody = null;
  grantBody = null;
  grantUrl = '';
  installApiMock(async (url, init) => {
    if (url === '/api/service-users') {
      return new Response(JSON.stringify(serviceUsers), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.startsWith('/api/auditor-access/auditors/') && init.method === 'PUT') {
      grantUrl = url;
      grantBody = JSON.parse(String(init.body)) as Record<string, unknown>;
      return new Response(null, { status: 204 });
    }
    if (url === '/api/auth/register' && init.method === 'POST') {
      postCount += 1;
      lastBody = JSON.parse(String(init.body)) as Record<string, unknown>;
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

  it('shows no service-user picker for non-auditor roles', async () => {
    renderForm();
    fill('Role', 'STAFF');
    expect(screen.queryByLabelText('Service users to audit')).toBeNull();
  });

  it('requires an auditor to be given at least one service user', async () => {
    renderForm();
    fill('Name', 'Avery Auditor');
    fill('Email', 'avery@example.com');
    fill('Role', 'AUDITOR');
    fill('Password', 'Password123!');
    await screen.findByLabelText('Service users to audit');
    submitForm();
    expect(
      await screen.findByText('Select at least one service user for this auditor.'),
    ).toBeDefined();
    expect(postCount).toBe(0);
  });

  it('creates an auditor and saves the chosen service users to audit', async () => {
    renderForm();
    fill('Name', 'Avery Auditor');
    fill('Email', 'avery@example.com');
    fill('Role', 'AUDITOR');
    fill('Password', 'Password123!');
    fireEvent.click(await screen.findByLabelText('Service users to audit'));
    // Inactive service users are not offered for a new selection.
    expect(screen.queryByRole('checkbox', { name: /Cara Gone/ })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: /Bob Stone/ }));
    submitForm();
    expect(await screen.findByText('Users List')).toBeDefined();
    expect(lastBody?.role).toBe('AUDITOR');
    expect(grantUrl).toBe(`/api/auditor-access/auditors/${created.id}`);
    expect(grantBody).toEqual({ serviceUserIds: ['su-2'] });
  });
});

describe('UserFormPage (edit an auditor)', () => {
  const auditor = { ...created, name: 'Avery Auditor', role: 'AUDITOR' };
  let calls: string[] = [];

  function mockEdit() {
    calls = [];
    grantBody = null;
    installApiMock(async (url, init) => {
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      if (url === `/api/users/${auditor.id}` && init.method === 'GET') return json(auditor);
      if (url === '/api/service-users') return json(serviceUsers);
      if (url === `/api/auditor-access/auditors/${auditor.id}` && init.method === 'GET') {
        return json({ serviceUserIds: ['su-1', 'su-3'] });
      }
      calls.push(`${init.method} ${url}`);
      if (init.method === 'PUT' && url.startsWith('/api/auditor-access/')) {
        grantBody = JSON.parse(String(init.body)) as Record<string, unknown>;
        return new Response(null, { status: 204 });
      }
      if (init.method === 'PUT') return json(auditor);
      return new Response(null, { status: 404 });
    });
  }

  function renderEdit() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/users/${auditor.id}/edit`]}>
          <Routes>
            <Route path="/users/:id/edit" element={<UserFormPage />} />
            <Route path="/users" element={<div>Users List</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  beforeEach(() => mockEdit());

  it("preselects the auditor's current service users, keeping an inactive one", async () => {
    renderEdit();
    fireEvent.click(await screen.findByLabelText('Service users to audit'));
    expect(
      (screen.getByRole('checkbox', { name: /Ada Lovelace/ }) as HTMLInputElement).checked,
    ).toBe(true);
    expect((screen.getByRole('checkbox', { name: /Cara Gone/ }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect((screen.getByRole('checkbox', { name: /Bob Stone/ }) as HTMLInputElement).checked).toBe(
      false,
    );
  });

  it('clears audit access before switching the account to another role', async () => {
    renderEdit();
    await screen.findByLabelText('Service users to audit');
    fill('Role', 'STAFF');
    fireEvent.submit(screen.getByRole('form', { name: 'Edit user' }));
    expect(await screen.findByText('Users List')).toBeDefined();
    expect(calls).toEqual([
      `PUT /api/auditor-access/auditors/${auditor.id}`,
      `PUT /api/users/${auditor.id}`,
    ]);
    expect(grantBody).toEqual({ serviceUserIds: [] });
  });
});
