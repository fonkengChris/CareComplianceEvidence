import type { RecordingGuidance, RecordingGuidanceUpdate } from '@care/shared';
import { api } from './api';

/**
 * Typed helpers over the shared axios instance for the recording-guidance API. GET is open to
 * any authenticated role (staff read it while recording); PUT is MANAGER-only — the server
 * enforces this, these just call it. Rejections drive React Query's error state.
 */

export async function fetchRecordingGuidance(): Promise<string> {
  const { data } = await api.get<RecordingGuidance>('/api/recording-guidance');
  return data.guidance;
}

export async function updateRecordingGuidance(guidance: string): Promise<string> {
  const body: RecordingGuidanceUpdate = { guidance };
  const { data } = await api.put<RecordingGuidance>('/api/recording-guidance', body);
  return data.guidance;
}
