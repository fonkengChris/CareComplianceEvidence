import type { PolishRecordInput, PolishedRecord } from '@care/shared';
import { api } from './api';

/**
 * Typed helper over the shared axios instance for the AI "polish" endpoint. The server owns
 * the model call (and its key); the client just sends the comment (plus read-only context)
 * and gets back improved prose. Non-2xx responses reject with the server's message so the
 * calling mutation surfaces it.
 */
export async function polishComment(input: PolishRecordInput): Promise<string> {
  const { data } = await api.post<PolishedRecord>('/api/ai/polish', input);
  return data.comment;
}
