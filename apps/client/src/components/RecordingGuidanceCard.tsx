import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toErrorMessage } from '../lib/errors';
import { fetchRecordingGuidance, updateRecordingGuidance } from '../lib/recording-guidance';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Textarea } from './ui/textarea';

/**
 * Manager-only editor for the recording guidance shown to staff above each comment field on
 * the recording screen (how to record an activity, which highlights to capture). Embedded on
 * the Reports page beside the compliance thresholds. Saving updates the app-wide setting; the
 * recording screen re-reads it on next load. Render this only for MANAGER — the server rejects
 * other roles.
 */
export default function RecordingGuidanceCard() {
  const queryClient = useQueryClient();
  const guidance = useQuery({ queryKey: ['recording-guidance'], queryFn: fetchRecordingGuidance });

  const [text, setText] = useState('');
  // Seed the editor from the server (source of truth) once loaded.
  useEffect(() => {
    if (guidance.data !== undefined) setText(guidance.data);
  }, [guidance.data]);

  const mutation = useMutation({
    mutationFn: (value: string) => updateRecordingGuidance(value),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recording-guidance'] }),
  });

  if (guidance.isLoading) {
    return (
      <p role="status" className="text-muted-foreground">
        Loading guidance…
      </p>
    );
  }
  if (guidance.isError) {
    return (
      <p role="alert" className="text-sm font-medium text-destructive">
        Could not load recording guidance.
      </p>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recording guidance for staff</CardTitle>
        <p className="text-sm text-muted-foreground">
          Shown to staff above each comment field on the recording screen. Explain how to record
          an activity and the highlights to capture. Leave blank to show nothing.
        </p>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(text);
          }}
          className="flex flex-col gap-4"
          aria-label="Recording guidance"
        >
          {mutation.isError && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {toErrorMessage(mutation.error)}
            </p>
          )}
          {mutation.isSuccess && (
            <p role="status" className="text-sm font-medium text-success">
              Guidance saved.
            </p>
          )}

          <Textarea
            aria-label="Recording guidance text"
            rows={5}
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Record what support was provided and how the person responded…"
            className="text-base"
          />

          <Button type="submit" disabled={mutation.isPending} className="self-start">
            {mutation.isPending ? 'Saving…' : 'Save guidance'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
