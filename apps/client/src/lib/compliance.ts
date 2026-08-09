import type { ComplianceSettings, ComplianceSettingsUpdate } from '@care/shared';
import { apiFetch } from './api';

/**
 * Typed helpers over apiFetch for the compliance-settings API (Phase 6). GET is open to
 * MANAGER/AUDITOR, PUT is MANAGER-only — the server enforces this; these just call it.
 * Mirrors the week-plans lib pattern (thrown Errors drive React Query's error state).
 */

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function fetchComplianceSettings(): Promise<ComplianceSettings> {
  return unwrap<ComplianceSettings>(await apiFetch('/api/compliance-settings'));
}

export async function updateComplianceSettings(
  input: ComplianceSettingsUpdate,
): Promise<ComplianceSettings> {
  return unwrap<ComplianceSettings>(
    await apiFetch('/api/compliance-settings', { method: 'PUT', body: JSON.stringify(input) }),
  );
}
