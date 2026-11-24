import type { CheckSubmission } from '@care/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { setAccessToken } from '../lib/api';
import { mockApi } from '../lib/test-utils';
import CheckSubmissionPage from './CheckSubmissionPage';

/**
 * Component test for the on-screen view of a signed check: answers from the snapshotted form,
 * repeat blocks labelled, flagged answers marked for reporting, and the signer shown.
 */

const ID = '77777777-7777-4777-8777-777777777777';

const submission: CheckSubmission = {
  id: ID,
  templateId: '55555555-5555-4555-8555-555555555555',
  templateName: 'Room Checks',
  templateVersion: 3,
  homeId: '33333333-3333-4333-8333-333333333333',
  homeName: 'Riverside House',
  dueDate: '2026-11-23',
  definition: {
    sections: [
      {
        id: 'rooms',
        repeat: { label: 'Room', defaultCount: 1, keyQuestionId: 'room' },
        questions: [
          { id: 'room', text: 'Room number', type: 'TEXT' },
          { id: 'damage', text: 'Any damage?', type: 'YES_NO', flagWhen: 'YES' },
        ],
      },
      {
        id: 'water',
        title: 'Water',
        questions: [{ id: 'hot', text: 'Hot water over 50?', type: 'YES_NO_NUMBER', unit: '°C' }],
      },
    ],
  },
  answers: {
    rooms: [
      { room: { text: '4' }, damage: { choice: 'YES', note: 'Wardrobe door off' } },
      { room: { text: '5' }, damage: { choice: 'NO' } },
    ],
    water: [{ hot: { choice: 'YES', number: 55 } }],
  },
  issueCount: 1,
  late: true,
  submittedById: '88888888-8888-4888-8888-888888888888',
  submittedByName: 'Jane Smith',
  submittedAt: '2026-11-24T09:15:00.000Z',
};

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

beforeEach(() => {
  setAccessToken(null);
  mockApi(async (url) => {
    if (url === '/api/auth/refresh') {
      return json({
        accessToken: 't',
        user: {
          id: 'me',
          name: 'Morgan Manager',
          email: 'm@example.com',
          role: 'MANAGER',
          active: true,
          createdAt: '2026-08-08T00:00:00.000Z',
          updatedAt: '2026-08-08T00:00:00.000Z',
        },
      });
    }
    if (url === `/api/house-checks/submissions/${ID}`) return json(submission);
    return new Response(null, { status: 404 });
  });
});
afterEach(cleanup);

describe('CheckSubmissionPage', () => {
  it('shows every answer with flagged ones marked and the signer', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/checks/submissions/${ID}`]}>
          <AuthProvider>
            <Routes>
              <Route path="/checks/submissions/:id" element={<CheckSubmissionPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Room Checks' })).toBeDefined();
    expect(screen.getByText('Room 1 — 4')).toBeDefined();
    expect(screen.getByText('Room 2 — 5')).toBeDefined();
    expect(screen.getByText('Wardrobe door off')).toBeDefined();
    expect(screen.getAllByText('Report to management')).toHaveLength(1);
    expect(screen.getByText('Yes — 55 °C')).toBeDefined();
    expect(screen.getByText('Jane Smith')).toBeDefined();
    expect(screen.getByText('Late')).toBeDefined();
    expect(screen.getByText('1 to report to management')).toBeDefined();
    expect(screen.getByRole('button', { name: /Download PDF/ })).toBeDefined();
  });
});
