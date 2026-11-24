import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { setAccessToken } from '../lib/api';
import { mockApi } from '../lib/test-utils';
import CheckTemplateEditorPage from './CheckTemplateEditorPage';

/**
 * Component tests for the manager's check editor: a weekly check needs a day, and a new check
 * with its questions, report flags and schedule is posted in the shared template shape.
 */

let posted: Record<string, unknown>[] = [];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  setAccessToken(null);
  posted = [];
  mockApi(async (url, init) => {
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
    if (url === '/api/house-checks/templates' && init.method === 'POST') {
      posted.push(JSON.parse(init.body!));
      return json({}, 201);
    }
    return new Response(null, { status: 404 });
  });
});
afterEach(cleanup);

function renderEditor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/checks/templates/new']}>
        <AuthProvider>
          <Routes>
            <Route path="/checks/templates/new" element={<CheckTemplateEditorPage />} />
            <Route path="/checks/templates" element={<p>Template list</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const submit = () =>
  fireEvent.submit(screen.getByRole('button', { name: 'Save check' }).closest('form')!);

describe('CheckTemplateEditorPage', () => {
  it('requires a day for a weekly check', async () => {
    renderEditor();
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Fridge' } });
    fireEvent.change(screen.getByLabelText('Question 1 wording'), {
      target: { value: 'Fridge clean?' },
    });
    fireEvent.change(screen.getByLabelText('Schedule'), { target: { value: 'WEEKLY' } });
    submit();
    expect(await screen.findByText('Pick at least one day for a weekly check')).toBeDefined();
    expect(posted).toEqual([]);
  });

  it('saves a new weekly check with a flagged question and a count', async () => {
    renderEditor();
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Fridge' } });
    fireEvent.change(screen.getByLabelText('Schedule'), { target: { value: 'WEEKLY' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fri' }));
    fireEvent.change(screen.getByLabelText('Question 1 wording'), {
      target: { value: 'Fridge clean?' },
    });
    fireEvent.change(screen.getByLabelText('Question 1 report to management when'), {
      target: { value: 'NO' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Add question/ }));
    fireEvent.change(screen.getByLabelText('Question 2 wording'), {
      target: { value: 'Items out of date' },
    });
    fireEvent.change(screen.getByLabelText('Question 2 answer type'), {
      target: { value: 'COUNT' },
    });
    submit();

    await waitFor(() => expect(posted).toHaveLength(1));
    const body = posted[0] as {
      name: string;
      scheduleKind: string;
      scheduleDays: string[];
      definition: { sections: { questions: Record<string, unknown>[] }[] };
    };
    expect(body.name).toBe('Fridge');
    expect(body.scheduleKind).toBe('WEEKLY');
    expect(body.scheduleDays).toEqual(['FRI']);
    const questions = body.definition.sections[0].questions;
    expect(questions).toHaveLength(2);
    expect(questions[0]).toMatchObject({ text: 'Fridge clean?', type: 'YES_NO', flagWhen: 'NO' });
    expect(questions[1]).toMatchObject({ text: 'Items out of date', type: 'COUNT' });
    expect(await screen.findByText('Template list')).toBeDefined();
  });
});
