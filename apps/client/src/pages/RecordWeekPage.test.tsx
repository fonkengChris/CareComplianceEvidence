import type { Role } from '@care/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { setAccessToken } from '../lib/api';
import { mockApi as installApiMock } from '../lib/test-utils';
import RecordWeekPage from './RecordWeekPage';

/**
 * Staff recording component tests. The plan + activity list load from mocked endpoints;
 * the STAFF role comes from the mocked silent-refresh session. Covers: recording a line
 * (PATCH), the keyword review hint surfacing (never as a status), and adding an unplanned
 * activity (POST).
 */

const PLAN = '11111111-1111-4111-8111-111111111111';
const ENTRY = '33333333-3333-4333-8333-333333333333';
const ACTIVITY = '44444444-4444-4444-8444-444444444444';

const planWithEntries = {
  id: PLAN,
  serviceUserId: '22222222-2222-4222-8222-222222222222',
  weekCommencing: '2026-08-17',
  notes: null,
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
  dayEntries: [
    {
      id: ENTRY,
      weekPlanId: PLAN,
      day: 'MON',
      lineNumber: 1,
      activityTypeId: ACTIVITY,
      description: 'Shopping trip',
      comment: 'Client declined to go out',
      timeAllocated: 60,
      timeSpent: null,
      outcome: null,
      reviewHint: true,
      createdAt: '2026-08-08T00:00:00.000Z',
      updatedAt: '2026-08-08T00:00:00.000Z',
    },
  ],
  compliance: {
    deliveredMinutes: 0,
    contractedMinutes: 1200,
    remainingMinutes: 1200,
    deliveryPct: 0,
    status: 'ATTENTION',
  },
};

const activityTypes = [
  {
    id: ACTIVITY,
    name: 'Shopping',
    active: true,
    createdAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
  },
];

let patchCount = 0;
let postCount = 0;
let polishCount = 0;
let lastPatchBody: unknown = null;
let lastPolishBody: unknown = null;
let photoUploads = 0;
let photoDeletes: string[] = [];
let planPhotos: unknown[] = [];

const MY_PHOTO = '66666666-6666-4666-8666-666666666666';
const OTHER_PHOTO = '77777777-7777-4777-8777-777777777777';
const OTHER_USER = '88888888-8888-4888-8888-888888888888';
const ME = '99999999-9999-4999-8999-999999999999';

function photo(id: string, uploadedById: string) {
  return {
    id,
    dayEntryId: ENTRY,
    uploadedById,
    contentType: 'image/jpeg',
    sizeBytes: 3,
    createdAt: '2026-08-17T09:00:00.000Z',
  };
}

function makeUser(role: Role) {
  return {
    id: ME,
    name: 'Sam Staff',
    email: 'staff@example.com',
    role,
    active: true,
    createdAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
  };
}

function mockApi(role: Role) {
  patchCount = 0;
  postCount = 0;
  polishCount = 0;
  lastPatchBody = null;
  lastPolishBody = null;
  photoUploads = 0;
  photoDeletes = [];
  installApiMock(async (url, init) => {
    const method = init.method;
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

    if (url === '/api/auth/refresh') return json({ accessToken: 't', user: makeUser(role) });
    if (url === `/api/week-plans/${PLAN}` && method === 'GET') return json(planWithEntries);
    if (url === '/api/activity-types') return json(activityTypes);
    if (url === `/api/week-plans/${PLAN}/photos` && method === 'GET') return json(planPhotos);
    if (url === `/api/week-plans/${PLAN}/day-entries/${ENTRY}/photos` && method === 'POST') {
      photoUploads += 1;
      return json(photo(MY_PHOTO, ME), 201);
    }
    if (url.startsWith(`/api/week-plans/${PLAN}/photos/`) && method === 'DELETE') {
      photoDeletes.push(url.split('/').pop()!);
      return new Response(null, { status: 204 });
    }
    if (url.startsWith(`/api/week-plans/${PLAN}/photos/`) && method === 'GET') {
      return new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 200 });
    }
    if (url === '/api/recording-guidance') return json({ guidance: 'Capture the outcome and mood.' });
    if (url === `/api/week-plans/${PLAN}/day-entries/${ENTRY}/record` && method === 'PATCH') {
      patchCount += 1;
      lastPatchBody = init.body ? JSON.parse(String(init.body)) : null;
      return json(planWithEntries);
    }
    if (url === `/api/week-plans/${PLAN}/day-entries` && method === 'POST') {
      postCount += 1;
      return json(planWithEntries, 201);
    }
    if (url === '/api/ai/polish' && method === 'POST') {
      polishCount += 1;
      lastPolishBody = init.body ? JSON.parse(String(init.body)) : null;
      return json({ comment: 'The client declined to go out today.' });
    }
    return new Response(null, { status: 404 });
  });
}

function renderRecord() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/week-plans/${PLAN}/record`]}>
        <AuthProvider>
          <Routes>
            <Route path="/week-plans/:id/record" element={<RecordWeekPage />} />
            <Route path="/" element={<div>Dashboard</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// The view defaults to today's weekday; clicking "Previous" clamps at Monday, so six
// clicks deterministically land on the Monday planned line regardless of the real date.
async function goToMonday() {
  const prev = await screen.findByLabelText('Previous day');
  for (let i = 0; i < 6; i += 1) fireEvent.click(prev);
}

beforeEach(() => {
  setAccessToken(null);
  planPhotos = [];
});
afterEach(() => {
  cleanup();
});

describe('RecordWeekPage', () => {
  it('shows the planned activity with read-only allocated time', async () => {
    mockApi('STAFF');
    renderRecord();
    await goToMonday();
    expect(await screen.findByText('Shopping')).toBeDefined();
    expect(screen.getByText('Allocated: 60 min')).toBeDefined();
  });

  it('shows the backend-computed compliance status badge', async () => {
    mockApi('STAFF');
    renderRecord();
    expect(await screen.findByLabelText('Compliance status: Attention Required')).toBeDefined();
  });

  it('records time, outcome and comment via a PATCH', async () => {
    mockApi('STAFF');
    renderRecord();
    await goToMonday();
    fireEvent.change(await screen.findByLabelText('Time spent for Shopping'), {
      target: { value: '45' },
    });
    fireEvent.change(screen.getByLabelText('Outcome for Shopping'), {
      target: { value: 'COMPLETED' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patchCount).toBe(1));
    expect(lastPatchBody).toEqual({ timeSpent: 45, outcome: 'COMPLETED', comment: 'Client declined to go out' });
  });

  it('shows the manager-authored recording guidance above the comment field', async () => {
    mockApi('STAFF');
    renderRecord();
    await goToMonday();
    expect(await screen.findByLabelText('How to record')).toBeDefined();
    expect(screen.getByText('Capture the outcome and mood.')).toBeDefined();
  });

  it('surfaces the review hint without showing it as a status', async () => {
    mockApi('STAFF');
    renderRecord();
    await goToMonday();
    expect(await screen.findByLabelText('Review hint')).toBeDefined();
    // The hint is a nudge, not the outcome — the outcome control stays "not recorded".
    expect((screen.getByLabelText('Outcome for Shopping') as HTMLSelectElement).value).toBe('');
  });

  it('polishes the comment via the AI endpoint and swaps in the improved text', async () => {
    mockApi('STAFF');
    renderRecord();
    await goToMonday();
    const comment = (await screen.findByLabelText('Comment for Shopping')) as HTMLTextAreaElement;
    expect(comment.value).toBe('Client declined to go out');
    fireEvent.click(screen.getByRole('button', { name: 'Polish comment for Shopping' }));
    await waitFor(() => expect(polishCount).toBe(1));
    // The comment sent for polishing carries the activity name as read-only context.
    expect(lastPolishBody).toEqual({ comment: 'Client declined to go out', activity: 'Shopping' });
    await waitFor(() => expect(comment.value).toBe('The client declined to go out today.'));
  });

  it('disables Polish when the comment is empty', async () => {
    mockApi('STAFF');
    renderRecord();
    await goToMonday();
    const comment = await screen.findByLabelText('Comment for Shopping');
    fireEvent.change(comment, { target: { value: '' } });
    expect(
      (screen.getByRole('button', { name: 'Polish comment for Shopping' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('adds an unplanned activity via a POST', async () => {
    mockApi('STAFF');
    renderRecord();
    fireEvent.click(await screen.findByRole('button', { name: '+ Record Activity' }));
    fireEvent.change(await screen.findByLabelText('Activity'), { target: { value: ACTIVITY } });
    fireEvent.submit(screen.getByRole('form', { name: 'Record an unplanned activity' }));
    await waitFor(() => expect(postCount).toBe(1));
  });

  it('offers to take or upload a photo on each recorded activity', async () => {
    mockApi('STAFF');
    renderRecord();
    await goToMonday();
    expect(await screen.findByRole('button', { name: 'Take photo for Shopping' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Upload photo for Shopping' })).toBeDefined();
    // The camera input asks phones for the rear camera; desktops get a file picker.
    expect(screen.getByTestId(`camera-input-${ENTRY}`).getAttribute('capture')).toBe('environment');
  });

  it('uploads a picked photo straight away, against that activity', async () => {
    mockApi('STAFF');
    renderRecord();
    await goToMonday();
    const input = (await screen.findByTestId(`file-input-${ENTRY}`)) as HTMLInputElement;
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'p.jpg', { type: 'image/jpeg' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);
    await waitFor(() => expect(photoUploads).toBe(1));
    // Uploading is independent of Save — no recording PATCH is sent.
    expect(patchCount).toBe(0);
  });

  it('lets staff remove only the photos they added', async () => {
    planPhotos = [photo(MY_PHOTO, ME), photo(OTHER_PHOTO, OTHER_USER)];
    mockApi('STAFF');
    renderRecord();
    await goToMonday();
    expect(await screen.findByRole('button', { name: 'View Photo 1 for Shopping' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'View Photo 2 for Shopping' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Remove Photo 2 for Shopping' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Photo 1 for Shopping' }));
    await waitFor(() => expect(photoDeletes).toEqual([MY_PHOTO]));
  });

  it('lets a manager remove any photo', async () => {
    planPhotos = [photo(OTHER_PHOTO, OTHER_USER)];
    mockApi('MANAGER');
    renderRecord();
    await goToMonday();
    expect(await screen.findByRole('button', { name: 'Remove Photo 1 for Shopping' })).toBeDefined();
  });
});
