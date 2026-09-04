import type { PolishRecordInput, PolishedRecord, TranscribedRecord } from '@care/shared';
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

/**
 * Upload a recorded audio note and get back the transcribed text. The audio is sent as raw
 * bytes with its own mime type (the server transcribes it via OpenAI); non-2xx responses
 * reject with the server's message so the caller can surface it.
 */
export async function transcribeAudio(audio: Blob): Promise<string> {
  const { data } = await api.post<TranscribedRecord>('/api/ai/transcribe', audio, {
    headers: { 'Content-Type': audio.type || 'application/octet-stream' },
  });
  return data.text;
}
