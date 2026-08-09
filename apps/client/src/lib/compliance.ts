import type { ComplianceSettings, ComplianceSettingsUpdate } from '@care/shared';
import { api } from './api';

/**
 * Typed helpers over the shared axios instance for the compliance-settings API (Phase 6). GET
 * is open to MANAGER/AUDITOR, PUT is MANAGER-only — the server enforces this; these just call
 * it. Mirrors the week-plans lib pattern (rejections drive React Query's error state).
 */

export async function fetchComplianceSettings(): Promise<ComplianceSettings> {
  const { data } = await api.get<ComplianceSettings>('/api/compliance-settings');
  return data;
}

export async function updateComplianceSettings(
  input: ComplianceSettingsUpdate,
): Promise<ComplianceSettings> {
  const { data } = await api.put<ComplianceSettings>('/api/compliance-settings', input);
  return data;
}
