import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { setAccessToken } from '../lib/api';
import { storeDisplayToken } from '../lib/shifts';
import { mockApi } from '../lib/test-utils';
import LoginPage from './LoginPage';

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Sam Staff',
  email: 'sam@example.com',
  role: 'STAFF',
  active: true,
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
};

/** Mocks the mount-time refresh (always unauthenticated) and the login POST. */
function mockAuth(loginOk: boolean) {
  mockApi(async (url) => {
    if (url === '/api/auth/refresh') return new Response(null, { status: 401 });
    if (url === '/api/auth/login') {
      return loginOk
        ? new Response(JSON.stringify({ accessToken: 't', user }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        : new Response(null, { status: 401 });
    }
    return new Response(null, { status: 404 });
  });
}

function renderLogin(entry = '/login') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>Dashboard Home</div>} />
          <Route path="/check-in-display" element={<div>Check-in display</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

function submitCredentials() {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'sam@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Password123!' } });
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
}

beforeEach(() => {
  setAccessToken(null);
});
afterEach(() => {
  cleanup();
  storeDisplayToken(null);
});

describe('LoginPage', () => {
  it('navigates to the dashboard on successful login', async () => {
    mockAuth(true);
    renderLogin();
    submitCredentials();
    expect(await screen.findByText('Dashboard Home')).toBeDefined();
  });

  it('shows an error message on failed login', async () => {
    mockAuth(false);
    renderLogin();
    submitCredentials();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Invalid email or password');
  });

  it('shows the check-in code instead on a work device', async () => {
    storeDisplayToken('display-token');
    mockAuth(true);
    renderLogin();
    expect(await screen.findByText('Check-in display')).toBeDefined();
  });

  it('lets a manager sign in on a work device with ?manage', async () => {
    storeDisplayToken('display-token');
    mockAuth(true);
    renderLogin('/login?manage');
    submitCredentials();
    expect(await screen.findByText('Dashboard Home')).toBeDefined();
  });
});
