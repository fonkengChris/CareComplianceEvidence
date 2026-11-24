import {
  type CheckAnswer,
  type CheckAnswers,
  type CheckChoice,
  type CheckQuestion,
  blockLabel,
  emptyAnswers,
  isFlagged,
  validateAnswers,
} from '@care/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { toErrorMessage } from '../lib/errors';
import { fetchCheckTemplate, submitCheck } from '../lib/house-checks';
import { cn } from '../lib/utils';

/**
 * Mobile form for completing one house check at one home on one due date. Answers are checked
 * against the template with the shared `validateAnswers` before sending (the server re-checks).
 * Submitting signs the check as the logged-in user; the server stores it with a PDF copy.
 */
export default function CheckFormPage() {
  const { templateId = '', homeId = '', dueDate = '' } = useParams();
  const template = useQuery({
    queryKey: ['house-checks', 'templates', templateId],
    queryFn: () => fetchCheckTemplate(templateId),
  });

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-6">
      <Link
        to="/checks"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Back to checks
      </Link>
      {template.isLoading && (
        <p role="status" className="text-muted-foreground">
          Loading…
        </p>
      )}
      {template.isError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {toErrorMessage(template.error, 'Could not load this check.')}
        </p>
      )}
      {template.data && (
        // Keyed so a different template starts from a fresh blank answer set.
        <CheckForm
          key={template.data.id}
          template={template.data}
          homeId={homeId}
          dueDate={dueDate}
        />
      )}
    </section>
  );
}

function CheckForm({
  template,
  homeId,
  dueDate,
}: {
  template: NonNullable<Awaited<ReturnType<typeof fetchCheckTemplate>>>;
  homeId: string;
  dueDate: string;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<CheckAnswers>(() => emptyAnswers(template.definition));
  const [problems, setProblems] = useState<string[]>([]);

  const submit = useMutation({
    mutationFn: () => submitCheck({ templateId: template.id, homeId, dueDate, answers }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['house-checks'] });
      navigate('/checks');
    },
  });

  function setAnswer(sectionId: string, index: number, questionId: string, patch: CheckAnswer) {
    setAnswers((prev) => {
      const blocks = [...(prev[sectionId] ?? [])];
      const block = { ...blocks[index] };
      const merged = { ...block[questionId], ...patch };
      // Drop cleared fields so a blank answer really is blank.
      for (const k of Object.keys(merged) as (keyof CheckAnswer)[]) {
        if (merged[k] === undefined || merged[k] === '') delete merged[k];
      }
      block[questionId] = merged;
      blocks[index] = block;
      return { ...prev, [sectionId]: blocks };
    });
  }

  function addBlock(sectionId: string) {
    setAnswers((prev) => ({ ...prev, [sectionId]: [...(prev[sectionId] ?? []), {}] }));
  }

  function removeBlock(sectionId: string, index: number) {
    setAnswers((prev) => ({
      ...prev,
      [sectionId]: (prev[sectionId] ?? []).filter((_, i) => i !== index),
    }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const found = validateAnswers(template.definition, answers);
    setProblems(found);
    if (found.length > 0) return;
    if (!window.confirm(`Sign and submit this check as ${user?.name ?? 'you'}?`)) return;
    submit.mutate();
  }

  const dateLabel = new Date(`${dueDate}T00:00:00Z`).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{template.name}</h1>
        <p className="text-sm text-muted-foreground">
          {dateLabel}
          {template.dueByTime ? ` · due by ${template.dueByTime}` : ''}
        </p>
      </div>

      {template.definition.sections.map((section) => {
        const blocks = answers[section.id] ?? [];
        return (
          <div key={section.id} className="flex flex-col gap-4">
            {blocks.map((block, index) => (
              <Card key={index}>
                {(section.title || section.repeat) && (
                  <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                    <CardTitle className="text-base">{blockLabel(section, block, index)}</CardTitle>
                    {section.repeat && blocks.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Remove ${section.repeat.label} ${index + 1}`}
                        onClick={() => removeBlock(section.id, index)}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </CardHeader>
                )}
                <CardContent
                  className={cn(
                    'flex flex-col divide-y divide-border',
                    !section.title && !section.repeat && 'pt-2',
                  )}
                >
                  {section.questions.map((q) => (
                    <QuestionField
                      key={q.id}
                      id={`${section.id}-${index}-${q.id}`}
                      question={q}
                      answer={block[q.id]}
                      onChange={(patch) => setAnswer(section.id, index, q.id, patch)}
                    />
                  ))}
                </CardContent>
              </Card>
            ))}
            {section.repeat && (
              <Button type="button" variant="outline" onClick={() => addBlock(section.id)}>
                <Plus />
                Add {section.repeat.label.toLowerCase()}
              </Button>
            )}
          </div>
        );
      })}

      {problems.length > 0 && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
        >
          <p className="mb-1 font-medium text-destructive">
            Please finish these before submitting:
          </p>
          <ul className="list-disc pl-5 text-destructive">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {submit.isError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {toErrorMessage(submit.error, 'Could not submit the check.')}
        </p>
      )}

      <div className="sticky bottom-0 -mx-4 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        <Button type="submit" className="w-full" size="lg" disabled={submit.isPending}>
          {submit.isPending ? 'Submitting…' : `Sign & submit as ${user?.name ?? 'me'}`}
        </Button>
      </div>
    </form>
  );
}

const CHOICES: { value: CheckChoice; label: string }[] = [
  { value: 'YES', label: 'Yes' },
  { value: 'NO', label: 'No' },
  { value: 'NA', label: 'N/A' },
];

function parseNumber(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function QuestionField({
  id,
  question: q,
  answer,
  onChange,
}: {
  id: string;
  question: CheckQuestion;
  answer: CheckAnswer | undefined;
  onChange: (patch: CheckAnswer) => void;
}) {
  const flagged = isFlagged(q, answer);
  const [showNote, setShowNote] = useState(Boolean(answer?.note));
  const hasChoice = q.type === 'YES_NO' || q.type === 'YES_NO_NUMBER';
  const hasNumber = q.type === 'YES_NO_NUMBER' || q.type === 'COUNT' || q.type === 'NUMBER';

  return (
    <div className={cn('flex flex-col gap-2 py-3', flagged && 'rounded-md bg-destructive/5 px-2')}>
      <div>
        <label
          htmlFor={hasChoice ? undefined : id}
          id={`${id}-label`}
          className="text-sm font-medium"
        >
          {q.text}
          {q.optional && <span className="font-normal text-muted-foreground"> (optional)</span>}
        </label>
        {q.guidance && <p className="text-xs text-muted-foreground">{q.guidance}</p>}
      </div>

      {hasChoice && (
        <div role="group" aria-labelledby={`${id}-label`} className="flex gap-2">
          {CHOICES.filter((c) => c.value !== 'NA' || q.allowNA).map((c) => {
            const selected = answer?.choice === c.value;
            return (
              <Button
                key={c.value}
                type="button"
                variant={selected ? 'default' : 'outline'}
                className="flex-1"
                aria-pressed={selected}
                onClick={() => onChange({ choice: selected ? undefined : c.value })}
              >
                {c.label}
              </Button>
            );
          })}
        </div>
      )}

      {hasNumber && (
        <div className="flex items-center gap-2">
          <Input
            id={hasChoice ? `${id}-number` : id}
            aria-label={hasChoice ? `${q.text} — reading` : undefined}
            type="number"
            inputMode={q.type === 'COUNT' ? 'numeric' : 'decimal'}
            min={q.type === 'COUNT' ? 0 : undefined}
            step={q.type === 'COUNT' ? 1 : 'any'}
            className="w-32"
            value={answer?.number ?? ''}
            onChange={(e) => onChange({ number: parseNumber(e.target.value) })}
          />
          {q.unit && <span className="text-sm text-muted-foreground">{q.unit}</span>}
        </div>
      )}

      {q.type === 'TEXT' && (
        <Textarea
          id={id}
          rows={2}
          value={answer?.text ?? ''}
          onChange={(e) => onChange({ text: e.target.value })}
        />
      )}

      {flagged && (
        <p className="text-xs font-medium text-destructive">
          Report this to the management{q.noteRequiredOnFlag ? ' — add the details below.' : '.'}
        </p>
      )}

      {showNote || flagged ? (
        <Textarea
          aria-label={`Note — ${q.text}`}
          placeholder={q.noteRequiredOnFlag && flagged ? 'Details (required)' : 'Note (optional)'}
          rows={2}
          value={answer?.note ?? ''}
          onChange={(e) => onChange({ note: e.target.value })}
        />
      ) : (
        q.type !== 'TEXT' && (
          <button
            type="button"
            className="self-start text-xs text-primary underline-offset-4 hover:underline"
            onClick={() => setShowNote(true)}
          >
            Add note
          </button>
        )
      )}
    </div>
  );
}
