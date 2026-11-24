import type {
  CheckOccurrence,
  CheckOccurrenceStatus,
  CheckOverview,
  CheckSubmission,
  CheckSubmissionInput,
  CheckTemplate,
  CheckTemplateInput,
  CheckWeekGrid,
} from '@care/shared';
import { api } from './api';

/**
 * Typed helpers over the shared axios instance for house checks. Staff fetch the checks due at
 * the home they are on shift at and submit them; managers maintain templates and review each
 * home's week. Statuses (due / late / missed) come from the server — never derived here.
 */

export async function fetchCheckTemplates(): Promise<CheckTemplate[]> {
  const { data } = await api.get<CheckTemplate[]>('/api/house-checks/templates');
  return data;
}

export async function fetchCheckTemplate(id: string): Promise<CheckTemplate> {
  const { data } = await api.get<CheckTemplate>(`/api/house-checks/templates/${id}`);
  return data;
}

export async function createCheckTemplate(input: CheckTemplateInput): Promise<CheckTemplate> {
  const { data } = await api.post<CheckTemplate>('/api/house-checks/templates', input);
  return data;
}

export async function updateCheckTemplate(
  id: string,
  input: CheckTemplateInput,
): Promise<CheckTemplate> {
  const { data } = await api.put<CheckTemplate>(`/api/house-checks/templates/${id}`, input);
  return data;
}

export async function setCheckTemplateActive(id: string, active: boolean): Promise<CheckTemplate> {
  const { data } = await api.patch<CheckTemplate>(`/api/house-checks/templates/${id}/active`, {
    active,
  });
  return data;
}

/** The checks that can be completed at a home right now. */
export async function fetchDueChecks(homeId: string): Promise<CheckOccurrence[]> {
  const { data } = await api.get<CheckOccurrence[]>(`/api/house-checks/homes/${homeId}/due`);
  return data;
}

export async function fetchCheckWeek(
  homeId: string,
  weekCommencing: string,
): Promise<CheckWeekGrid> {
  const { data } = await api.get<CheckWeekGrid>(
    `/api/house-checks/homes/${homeId}/week?weekCommencing=${weekCommencing}`,
  );
  return data;
}

/** Every active home's outstanding, missed and flagged checks (manager overview). */
export async function fetchCheckOverview(): Promise<CheckOverview> {
  const { data } = await api.get<CheckOverview>('/api/house-checks/overview');
  return data;
}

/** One signed submission with its answers (no PDF bytes). */
export async function fetchCheckSubmission(id: string): Promise<CheckSubmission> {
  const { data } = await api.get<CheckSubmission>(`/api/house-checks/submissions/${id}`);
  return data;
}

export async function submitCheck(input: CheckSubmissionInput): Promise<CheckSubmission> {
  const { data } = await api.post<CheckSubmission>('/api/house-checks/submissions', input);
  return data;
}

/**
 * Download a submission's signed PDF. Fetched as a blob through the API (the access token lives
 * in memory, so a plain link would be unauthenticated), then handed to the browser to save.
 */
export async function downloadCheckPdf(submissionId: string): Promise<void> {
  const res = await api.get<Blob>(`/api/house-checks/submissions/${submissionId}/pdf`, {
    responseType: 'blob',
  });
  const disposition = String(res.headers['content-disposition'] ?? '');
  const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `house-check-${submissionId}.pdf`;
  const url = URL.createObjectURL(res.data);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const CHECK_STATUS_LABELS: Record<CheckOccurrenceStatus, string> = {
  DONE: 'Done',
  LATE: 'Done late',
  DUE: 'Due',
  OVERDUE: 'Overdue',
  MISSED: 'Missed',
  UPCOMING: 'Upcoming',
};

export const CHECK_STATUS_VARIANTS: Record<
  CheckOccurrenceStatus,
  'success' | 'warning' | 'destructive' | 'secondary' | 'outline'
> = {
  DONE: 'success',
  LATE: 'warning',
  DUE: 'secondary',
  OVERDUE: 'warning',
  MISSED: 'destructive',
  UPCOMING: 'outline',
};

/** "Daily", "Weekly — Mon, Thu", plus " · by 12:00" when there's a due-by time. */
export function scheduleLabel(
  t: Pick<CheckTemplate, 'scheduleKind' | 'scheduleDays' | 'dueByTime'>,
) {
  const days = t.scheduleDays.map((d) => d.charAt(0) + d.slice(1).toLowerCase()).join(', ');
  const base = t.scheduleKind === 'DAILY' ? 'Daily' : `Weekly — ${days}`;
  return t.dueByTime ? `${base} · by ${t.dueByTime}` : base;
}

/** "Tue 24 Nov" from a YYYY-MM-DD date (UTC, so the day never shifts). */
export function checkDateLabel(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}
