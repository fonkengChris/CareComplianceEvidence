import {
  CHECK_QUESTION_TYPES,
  type CheckQuestion,
  type CheckQuestionType,
  type CheckSection,
  type CheckTemplate,
  type CheckTemplateInput,
  WEEKDAYS,
  checkTemplateInputSchema,
} from '@care/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ChevronLeft, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select } from '../components/ui/select';
import { toErrorMessage } from '../lib/errors';
import { createCheckTemplate, fetchCheckTemplate, updateCheckTemplate } from '../lib/house-checks';

/**
 * Manager editor for one house-check template: name, schedule (daily, or weekly on chosen
 * days, with an optional due-by time) and its sections/questions. Saving bumps the template's
 * version; completed checks keep the version they were signed against.
 */
export default function CheckTemplateEditorPage() {
  const { id } = useParams();
  const existing = useQuery({
    queryKey: ['house-checks', 'templates', id],
    queryFn: () => fetchCheckTemplate(id!),
    enabled: Boolean(id),
  });

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-6">
      <Link
        to="/checks/templates"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Back to manage checks
      </Link>
      {existing.isLoading && (
        <p role="status" className="text-muted-foreground">
          Loading…
        </p>
      )}
      {existing.isError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {toErrorMessage(existing.error, 'Could not load this check.')}
        </p>
      )}
      {(!id || existing.data) && <Editor key={id ?? 'new'} template={existing.data} />}
    </section>
  );
}

const TYPE_LABELS: Record<CheckQuestionType, string> = {
  YES_NO: 'Yes / No',
  YES_NO_NUMBER: 'Yes / No + reading',
  COUNT: 'Count',
  NUMBER: 'Number',
  TEXT: 'Text',
};

const newId = () => crypto.randomUUID().slice(0, 8);
const blankQuestion = (): CheckQuestion => ({ id: newId(), text: '', type: 'YES_NO' });
const blankSection = (): CheckSection => ({ id: newId(), questions: [blankQuestion()] });

function move<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function Editor({ template }: { template?: CheckTemplate }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<CheckTemplateInput>(() =>
    template
      ? {
          name: template.name,
          scheduleKind: template.scheduleKind,
          scheduleDays: template.scheduleDays,
          dueByTime: template.dueByTime,
          definition: template.definition,
        }
      : {
          name: '',
          scheduleKind: 'DAILY',
          scheduleDays: [],
          dueByTime: null,
          definition: { sections: [blankSection()] },
        },
  );
  const [formError, setFormError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (input: CheckTemplateInput) =>
      template ? updateCheckTemplate(template.id, input) : createCheckTemplate(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['house-checks'] });
      navigate('/checks/templates');
    },
  });

  const sections = draft.definition.sections;
  const setSections = (next: CheckSection[]) =>
    setDraft((d) => ({ ...d, definition: { sections: next } }));
  const updateSection = (i: number, patch: Partial<CheckSection>) =>
    setSections(sections.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const updateQuestion = (si: number, qi: number, patch: Partial<CheckQuestion>) =>
    updateSection(si, {
      questions: sections[si].questions.map((q, j) => (j === qi ? { ...q, ...patch } : q)),
    });

  function toggleDay(day: (typeof WEEKDAYS)[number]) {
    setDraft((d) => ({
      ...d,
      scheduleDays: d.scheduleDays.includes(day)
        ? d.scheduleDays.filter((x) => x !== day)
        : WEEKDAYS.filter((x) => x === day || d.scheduleDays.includes(x)),
    }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // A repeat block is labelled by its first text question (e.g. the room number) — re-pick it
    // in case that question was deleted or changed type.
    const definition = {
      sections: sections.map((s) =>
        s.repeat
          ? {
              ...s,
              repeat: {
                ...s.repeat,
                keyQuestionId: s.questions.find((q) => q.type === 'TEXT')?.id,
              },
            }
          : s,
      ),
    };
    const parsed = checkTemplateInputSchema.safeParse({ ...draft, definition });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue?.path.includes('questions') ? 'Every question needs wording. ' : '';
      setFormError(`${where}${issue?.message ?? 'Check the form.'}`);
      return;
    }
    setFormError(null);
    save.mutate(parsed.data);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <h1 className="text-2xl font-semibold tracking-tight">
        {template ? `Edit ${template.name}` : 'New check'}
      </h1>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="check-name">Name</Label>
            <Input
              id="check-name"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="flex w-full flex-col gap-1.5 sm:w-48">
              <Label htmlFor="check-schedule">Schedule</Label>
              <Select
                id="check-schedule"
                value={draft.scheduleKind}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    scheduleKind: e.target.value as CheckTemplateInput['scheduleKind'],
                  }))
                }
              >
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
              </Select>
            </div>
            <div className="flex w-full flex-col gap-1.5 sm:w-40">
              <Label htmlFor="check-due-by">Due by (optional)</Label>
              <Input
                id="check-due-by"
                type="time"
                value={draft.dueByTime ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, dueByTime: e.target.value || null }))}
              />
            </div>
          </div>
          {draft.scheduleKind === 'WEEKLY' && (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-sm font-medium">Days</legend>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((day) => {
                  const on = draft.scheduleDays.includes(day);
                  return (
                    <Button
                      key={day}
                      type="button"
                      size="sm"
                      variant={on ? 'default' : 'outline'}
                      aria-pressed={on}
                      onClick={() => toggleDay(day)}
                    >
                      {day.charAt(0) + day.slice(1).toLowerCase()}
                    </Button>
                  );
                })}
              </div>
            </fieldset>
          )}
        </CardContent>
      </Card>

      {sections.map((section, si) => (
        <Card key={section.id}>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base">Section {si + 1}</CardTitle>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Move section ${si + 1} up`}
                onClick={() => setSections(move(sections, si, si - 1))}
              >
                <ArrowUp />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Move section ${si + 1} down`}
                onClick={() => setSections(move(sections, si, si + 1))}
              >
                <ArrowDown />
              </Button>
              {sections.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete section ${si + 1}`}
                  onClick={() => setSections(sections.filter((_, j) => j !== si))}
                >
                  <Trash2 />
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`section-title-${section.id}`}>Heading (optional)</Label>
              <Input
                id={`section-title-${section.id}`}
                value={section.title ?? ''}
                onChange={(e) => updateSection(si, { title: e.target.value || undefined })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(section.repeat)}
                onChange={(e) =>
                  updateSection(si, {
                    repeat: e.target.checked
                      ? {
                          label: 'Room',
                          defaultCount: 1,
                          keyQuestionId: section.questions.find((q) => q.type === 'TEXT')?.id,
                        }
                      : undefined,
                  })
                }
              />
              Repeat this section for each item checked (e.g. one per room)
            </label>
            {section.repeat && (
              <div className="flex flex-wrap gap-4">
                <div className="flex w-full flex-col gap-1.5 sm:w-40">
                  <Label htmlFor={`repeat-label-${section.id}`}>Item name</Label>
                  <Input
                    id={`repeat-label-${section.id}`}
                    value={section.repeat.label}
                    onChange={(e) =>
                      updateSection(si, { repeat: { ...section.repeat!, label: e.target.value } })
                    }
                  />
                </div>
                <div className="flex w-full flex-col gap-1.5 sm:w-32">
                  <Label htmlFor={`repeat-count-${section.id}`}>Start with</Label>
                  <Input
                    id={`repeat-count-${section.id}`}
                    type="number"
                    min={1}
                    max={50}
                    value={section.repeat.defaultCount}
                    onChange={(e) =>
                      updateSection(si, {
                        repeat: {
                          ...section.repeat!,
                          defaultCount: Math.max(1, Math.min(50, Number(e.target.value) || 1)),
                        },
                      })
                    }
                  />
                </div>
              </div>
            )}

            <ol className="flex flex-col gap-3">
              {section.questions.map((q, qi) => (
                <li key={q.id} className="flex flex-col gap-2 rounded-md border border-border p-3">
                  <div className="flex items-start gap-2">
                    <Input
                      aria-label={`Question ${qi + 1} wording`}
                      placeholder="Question"
                      value={q.text}
                      onChange={(e) => updateQuestion(si, qi, { text: e.target.value })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Move question ${qi + 1} up`}
                      onClick={() =>
                        updateSection(si, { questions: move(section.questions, qi, qi - 1) })
                      }
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Move question ${qi + 1} down`}
                      onClick={() =>
                        updateSection(si, { questions: move(section.questions, qi, qi + 1) })
                      }
                    >
                      <ArrowDown />
                    </Button>
                    {section.questions.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete question ${qi + 1}`}
                        onClick={() =>
                          updateSection(si, {
                            questions: section.questions.filter((_, j) => j !== qi),
                          })
                        }
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Select
                      aria-label={`Question ${qi + 1} answer type`}
                      className="w-48"
                      value={q.type}
                      onChange={(e) =>
                        updateQuestion(si, qi, { type: e.target.value as CheckQuestionType })
                      }
                    >
                      {CHECK_QUESTION_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {TYPE_LABELS[t]}
                        </option>
                      ))}
                    </Select>
                    {(q.type === 'YES_NO' || q.type === 'YES_NO_NUMBER') && (
                      <Select
                        aria-label={`Question ${qi + 1} report to management when`}
                        className="w-56"
                        value={q.flagWhen ?? ''}
                        onChange={(e) =>
                          updateQuestion(si, qi, {
                            flagWhen: (e.target.value || undefined) as CheckQuestion['flagWhen'],
                          })
                        }
                      >
                        <option value="">No report flag</option>
                        <option value="YES">Report to management if Yes</option>
                        <option value="NO">Report to management if No</option>
                      </Select>
                    )}
                    {q.type !== 'TEXT' && q.type !== 'YES_NO' && (
                      <Input
                        aria-label={`Question ${qi + 1} unit`}
                        placeholder="Unit (e.g. °C)"
                        className="w-28"
                        value={q.unit ?? ''}
                        onChange={(e) =>
                          updateQuestion(si, qi, { unit: e.target.value || undefined })
                        }
                      />
                    )}
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm">
                    {(q.type === 'YES_NO' || q.type === 'YES_NO_NUMBER') && (
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={Boolean(q.allowNA)}
                          onChange={(e) =>
                            updateQuestion(si, qi, { allowNA: e.target.checked || undefined })
                          }
                        />
                        Allow N/A
                      </label>
                    )}
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={Boolean(q.optional)}
                        onChange={(e) =>
                          updateQuestion(si, qi, { optional: e.target.checked || undefined })
                        }
                      />
                      Optional
                    </label>
                    {q.flagWhen && (
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={Boolean(q.noteRequiredOnFlag)}
                          onChange={(e) =>
                            updateQuestion(si, qi, {
                              noteRequiredOnFlag: e.target.checked || undefined,
                            })
                          }
                        />
                        Require details when flagged
                      </label>
                    )}
                  </div>
                  <Input
                    aria-label={`Question ${qi + 1} guidance`}
                    placeholder="Guidance for staff (optional)"
                    value={q.guidance ?? ''}
                    onChange={(e) =>
                      updateQuestion(si, qi, { guidance: e.target.value || undefined })
                    }
                  />
                </li>
              ))}
            </ol>
            <Button
              type="button"
              variant="outline"
              className="self-start"
              onClick={() =>
                updateSection(si, { questions: [...section.questions, blankQuestion()] })
              }
            >
              <Plus />
              Add question
            </Button>
          </CardContent>
        </Card>
      ))}

      <Button
        type="button"
        variant="outline"
        className="self-start"
        onClick={() => setSections([...sections, blankSection()])}
      >
        <Plus />
        Add section
      </Button>

      {(formError || save.isError) && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {formError ?? toErrorMessage(save.error, 'Could not save the check.')}
        </p>
      )}
      <div className="flex gap-3">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save check'}
        </Button>
        <Link
          to="/checks/templates"
          className="inline-flex h-9 items-center rounded-md px-4 text-sm font-medium hover:bg-accent"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
