import type { CheckTemplate } from '@care/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { setAccessToken } from '../lib/api';
import { mockApi } from '../lib/test-utils';
import CheckFormPage from './CheckFormPage';

/**
 * Component tests for the check form: blank answers are caught before sending, flagged answers
 * ask for details, repeat blocks can be added, and a complete form posts the answers.
 */

const HOME = '33333333-3333-4333-8333-333333333333';
const TEMPLATE = '55555555-5555-4555-8555-555555555555';

const template: CheckTemplate = {
  id: TEMPLATE,
  name: 'Room Checks',
  scheduleKind: 'WEEKLY',
  scheduleDays: ['MON'],
  dueByTime: null,
  definition: {
    sections: [
      {
        id: 'rooms',
        repeat: { label: 'Room', defaultCount: 1, keyQuestionId: 'room' },
        questions: [
          { id: 'room', text: 'Room number', type: 'TEXT' },
          {
            id: 'damage',
            text: 'Any damage?',
            type: 'YES_NO',
            flagWhen: 'YES',
            noteRequiredOnFlag: true,
          },
        ],
      },
      {
        id: 'water',
        title: 'Water',
        questions: [{ id: 'hot', text: 'Hot water over 50?', type: 'YES_NO_NUMBER', unit: '°C' }],
      },
    ],
  },
  version: 1,
  active: true,
  createdAt: '2026-11-24T00:00:00.000Z',
  updatedAt: '2026-11-24T00:00:00.000Z',
};

let posted: unknown[] = [];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  setAccessToken(null);
  posted = [];
  window.confirm = () => true;
  mockApi(async (url, init) => {
    if (url === '/api/auth/refresh') {
      return json({
        accessToken: 't',
        user: {
          id: 'me',
          name: 'Jane Smith',
          email: 'jane@example.com',
          role: 'STAFF',
          active: true,
          createdAt: '2026-08-08T00:00:00.000Z',
          updatedAt: '2026-08-08T00:00:00.000Z',
        },
      });
    }
    if (url === `/api/house-checks/templates/${TEMPLATE}`) return json(template);
    if (url === '/api/house-checks/submissions' && init.method === 'POST') {
      posted.push(JSON.parse(init.body!));
      return json({}, 201);
    }
    return new Response(null, { status: 404 });
  });
});
afterEach(() => {
  cleanup();
  window.confirm = originalConfirm;
});
const originalConfirm = window.confirm;

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/checks/${TEMPLATE}/${HOME}/2026-11-23`]}>
        <AuthProvider>
          <Routes>
            <Route path="/checks/:templateId/:homeId/:dueDate" element={<CheckFormPage />} />
            <Route path="/checks" element={<p>Checks list</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const submitForm = () =>
  fireEvent.submit(screen.getByRole('button', { name: /Sign & submit/ }).closest('form')!);

describe('CheckFormPage', () => {
  it('lists missing answers instead of submitting a blank form', async () => {
    renderForm();
    await screen.findByText('Room 1');
    submitForm();
    expect(await screen.findByText(/Please finish these/)).toBeDefined();
    expect(screen.getByText('Room 1: "Room number" is required')).toBeDefined();
    expect(posted).toEqual([]);
  });

  it('asks for details when an answer must be reported', async () => {
    renderForm();
    await screen.findByText('Room 1');
    fireEvent.click(screen.getAllByRole('button', { name: 'Yes' })[0]);
    expect(await screen.findByText(/Report this to the management/)).toBeDefined();
    expect(screen.getByPlaceholderText('Details (required)')).toBeDefined();
  });

  it('adds a room and submits every block signed as the user', async () => {
    renderForm();
    await screen.findByText('Room 1');
    fireEvent.click(screen.getByRole('button', { name: /Add room/ }));
    await screen.findByText('Room 2');

    const roomFields = screen.getAllByLabelText('Room number');
    fireEvent.change(roomFields[0], { target: { value: '1' } });
    fireEvent.change(roomFields[1], { target: { value: '2' } });
    for (const no of screen.getAllByRole('button', { name: 'No' }).slice(0, 2)) {
      fireEvent.click(no);
    }
    // The water question's "Yes" is the last Yes button on the page.
    const yes = screen.getAllByRole('button', { name: 'Yes' });
    fireEvent.click(yes[yes.length - 1]);
    fireEvent.change(screen.getByLabelText('Hot water over 50? — reading'), {
      target: { value: '55' },
    });

    expect(screen.getByRole('button', { name: 'Sign & submit as Jane Smith' })).toBeDefined();
    submitForm();
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual({
      templateId: TEMPLATE,
      homeId: HOME,
      dueDate: '2026-11-23',
      answers: {
        rooms: [
          { room: { text: '1' }, damage: { choice: 'NO' } },
          { room: { text: '2' }, damage: { choice: 'NO' } },
        ],
        water: [{ hot: { choice: 'YES', number: 55 } }],
      },
    });
    expect(await screen.findByText('Checks list')).toBeDefined();
  });
});
