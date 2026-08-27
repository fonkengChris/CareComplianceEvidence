import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { setAccessToken } from '../lib/api';
import { mockApi as installApiMock } from '../lib/test-utils';
import WeekPlanTemplatePage from './WeekPlanTemplatePage';

/**
 * Template-editor component tests: the grid seeds from the fetched template, and saving
 * bulk-PUTs the current lines to /api/week-plan-templates/:serviceUserId/day-entries.
 */

const serviceUserId = '22222222-2222-4222-8222-222222222222';
const activityId = '44444444-4444-4444-8444-444444444444';

const template = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  serviceUserId,
  notes: null,
  dayEntries: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      templateId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      day: 'MON',
      lineNumber: 1,
      activityTypeId: activityId,
      description: 'Shopping trip',
      timeAllocated: 60,
      createdAt: '2026-08-08T00:00:00.000Z',
      updatedAt: '2026-08-08T00:00:00.000Z',
    },
  ],
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
};

let putBody: unknown;

function mockApi() {
  putBody = undefined;
  installApiMock(async (url, init) => {
    if (url === `/api/week-plan-templates/${serviceUserId}` && init.method === 'GET') {
      return new Response(JSON.stringify(template), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/activity-types' && init.method === 'GET') {
      return new Response(
        JSON.stringify([{ id: activityId, name: 'Community access', active: true }]),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    }
    if (url === `/api/week-plan-templates/${serviceUserId}/day-entries` && init.method === 'PUT') {
      putBody = init.body ? JSON.parse(init.body) : undefined;
      return new Response(JSON.stringify(template), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(null, { status: 404 });
  });
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/service-users/${serviceUserId}/template`]}>
        <Routes>
          <Route path="/service-users/:serviceUserId/template" element={<WeekPlanTemplatePage />} />
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

describe('WeekPlanTemplatePage', () => {
  it('seeds the grid from the fetched template', async () => {
    renderPage();
    expect(await screen.findByDisplayValue('Shopping trip')).toBeTruthy();
  });

  it('saves the current lines with a bulk PUT', async () => {
    renderPage();
    await screen.findByDisplayValue('Shopping trip');

    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));

    await waitFor(() => expect(putBody).toBeDefined());
    expect(putBody).toEqual({
      entries: [
        {
          day: 'MON',
          lineNumber: 1,
          activityTypeId: activityId,
          description: 'Shopping trip',
          timeAllocated: 60,
        },
      ],
    });
    expect(await screen.findByText('Template saved.')).toBeTruthy();
  });
});
