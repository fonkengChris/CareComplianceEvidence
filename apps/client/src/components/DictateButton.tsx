import { Loader2, Mic, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { transcribeAudio } from '../lib/ai';
import { toErrorMessage } from '../lib/errors';
import { Button } from './ui/button';

/**
 * Mic button that dictates speech into a text field. It records a short audio clip in the
 * browser (MediaRecorder), uploads the bytes to the server, and appends the transcribed text
 * to the field. Transcription is server-owned (same OpenAI key as "Polish"), so it works in
 * every browser — including iOS Safari — and does not depend on the browser's own speech
 * service. This pairs well with "Polish": speak a rough note, then clean it up.
 *
 * Where audio recording is unavailable (no MediaRecorder / getUserMedia, e.g. the test DOM),
 * it renders nothing, so callers can drop it in unconditionally.
 */

function isRecordingSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

type DictateButtonProps = {
  /** Current field text; transcribed speech is appended to it. */
  value: string;
  /** Called with the new field text once transcription returns. */
  onChange: (next: string) => void;
  /** Accessible description of the target field, e.g. "comment for Shopping". */
  label: string;
};

type Phase = 'idle' | 'recording' | 'transcribing';

export default function DictateButton({ value, onChange, label }: DictateButtonProps) {
  const supported = isRecordingSupported();
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  // Keep the latest value in a ref so the async transcription appends onto current text.
  const valueRef = useRef(value);
  valueRef.current = value;

  // Release the mic and cancel any in-flight recording if the card unmounts.
  useEffect(
    () => () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      for (const track of recorder?.stream.getTracks() ?? []) track.stop();
    },
    [],
  );

  if (!supported) return null;

  const start = async () => {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('Microphone permission denied — allow mic access and try again.');
      return;
    }

    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      for (const track of stream.getTracks()) track.stop();
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
      if (blob.size === 0) {
        setPhase('idle');
        return;
      }
      setPhase('transcribing');
      try {
        const text = await transcribeAudio(blob);
        if (text) {
          const base = valueRef.current.trimEnd();
          onChange(base ? `${base} ${text}` : text);
        }
      } catch (err) {
        setError(toErrorMessage(err));
      } finally {
        setPhase('idle');
      }
    };

    recorderRef.current = recorder;
    recorder.start();
    setPhase('recording');
  };

  const stop = () => {
    recorderRef.current?.stop();
  };

  const busy = phase === 'transcribing';

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant={phase === 'recording' ? 'destructive' : 'outline'}
        size="sm"
        onClick={phase === 'recording' ? stop : start}
        disabled={busy}
        aria-pressed={phase === 'recording'}
        aria-label={
          phase === 'recording' ? `Stop dictation for ${label}` : `Dictate ${label}`
        }
      >
        {phase === 'recording' ? (
          <Square className="size-4" />
        ) : busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Mic className="size-4" />
        )}
        {phase === 'recording' ? 'Stop' : busy ? 'Transcribing…' : 'Speak'}
      </Button>
      {error && (
        <span role="alert" className="text-xs font-medium text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
