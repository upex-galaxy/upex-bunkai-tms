'use client';

import type { AcceptanceCriterion, AtcLayer, UserStory } from '@lib/types';
import { AnchoringPanel } from '@components/atcs/AnchoringPanel';
import { AtcPreview } from '@components/atcs/AtcPreview';
import { AuthoringFormatHint } from '@components/atcs/AuthoringFormatHint';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { parseAssertionsYaml, parseStepsMarkdown } from '@lib/atc-parse';
import {
  canAddTag,
  hasMinimumSteps,
  MODULE_MESSAGE,
  PROVENANCE_MESSAGE,
  provenanceOk,
  STEPS_MESSAGE,
  TAG_CAP_MESSAGE,
  tagCapReached,
  TITLE_MESSAGE,
  titleValid,
} from '@lib/atcs/builder-guards';
import { cn } from '@lib/utils';
import { ChevronLeft, Plus } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

const StepEditor = dynamic(
  async () => import('@components/atcs/StepEditor').then(m => m.StepEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[280px] items-center justify-center rounded-3 border border-stroke-2 bg-surface-2 text-xs text-fg-3">
        Loading Monaco editor…
      </div>
    ),
  },
);

export interface ModuleOption {
  id: string
  path: string
  name: string
}

interface NewAtcEditorProps {
  projectSlug: string
  modules: ModuleOption[]
  stories: UserStory[]
  storyAcs: Record<string, AcceptanceCriterion[]>
  // Optional pre-anchoring, set when arriving from the explorer's "Create ATC"
  // shortcut (`/atcs/new?story=…&ac=…`). The module defaults to the story's own
  // module so the form lands ready to fill.
  initialStoryId?: string | null
  initialAcIds?: string[]
  initialModuleId?: string | null
}

interface ApiErrorBody {
  error?: {
    code?: string
    message?: string
    details?: { reason?: string, positions?: number[] }
  }
}

interface CreatedAtcBody {
  atc?: { id?: string }
}

const LAYERS: AtcLayer[] = ['UI', 'API', 'Unit'];

// Maps the BK-18 error envelope (code + details.reason) to a user-facing string.
// Mirrors the `friendlyError` convention used by the other create forms.
function friendlyError(body: ApiErrorBody): string {
  switch (body.error?.details?.reason) {
    case 'ac_outside_user_story':
      return 'One or more Acceptance Criteria do not belong to the selected User Story.';
    case 'module_outside_project_subtree':
      return 'The Module must be the User Story’s module or a descendant in the same project.';
    case 'steps_position_invalid':
      return 'Step numbering must start at 1 and strictly increase.';
    case 'slug_collision':
      return 'An ATC with this name already exists — try saving again.';
    case 'version_conflict':
      return 'The ATC was modified by another request. Reload and retry.';
    case 'not_a_member':
      return 'You do not have permission to create ATCs in this project.';
  }
  switch (body.error?.code) {
    case 'unauthorized':
      return 'Your session expired — sign in again.';
    case 'forbidden':
      return 'You do not have permission to create ATCs.';
    case 'not_found':
      return 'The User Story or Module was not found.';
    default:
      return body.error?.message ?? 'Could not create the ATC.';
  }
}

export function NewAtcEditor({
  projectSlug,
  modules,
  stories,
  storyAcs,
  initialStoryId = null,
  initialAcIds = [],
  initialModuleId = null,
}: NewAtcEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [layer, setLayer] = useState<AtcLayer>('UI');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [moduleId, setModuleId] = useState<string | null>(initialModuleId);
  const [storyId, setStoryId] = useState<string | null>(initialStoryId);
  const [acIds, setAcIds] = useState<string[]>(initialAcIds);
  const [stepsMd, setStepsMd] = useState('01. ');
  const [assertionsYaml, setAssertionsYaml] = useState('- ');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const parsedSteps = useMemo(() => parseStepsMarkdown(stepsMd), [stepsMd]);
  const stepCount = parsedSteps.length;

  const anchored = provenanceOk(storyId, acIds);
  const canSave
    = !!moduleId
      && anchored
      && titleValid(title)
      && hasMinimumSteps(stepCount)
      && !submitting;

  const selectedStory = useMemo(
    () => stories.find(s => s.id === storyId) ?? null,
    [stories, storyId],
  );
  const selectedAcs = useMemo(() => {
    const all = storyId ? storyAcs[storyId] ?? [] : [];
    return all.filter(ac => acIds.includes(ac.id));
  }, [storyId, storyAcs, acIds]);
  const moduleSegments = useMemo(() => {
    const m = modules.find(x => x.id === moduleId);
    return m ? m.path.split('/') : [];
  }, [modules, moduleId]);

  const addTag = () => {
    const normalized = tagInput.trim().toLowerCase();
    if (tagCapReached(tags)) {
      setError(TAG_CAP_MESSAGE);
      return;
    }
    if (!canAddTag(tags, normalized)) {
      setTagInput('');
      return;
    }
    setTags([...tags, normalized]);
    setTagInput('');
    if (error) { setError(null); }
  };

  const removeTag = (t: string) => setTags(tags.filter(x => x !== t));

  // Picking a story defaults the Module to that story's module when none is set
  // yet, so the common case (ATC lives in its story's module) needs no extra
  // click. The user can still override to a descendant module via the picker.
  const onSelectStory = (id: string) => {
    setStoryId(id);
    setAcIds([]);
    if (!moduleId) {
      const story = stories.find(s => s.id === id);
      if (story) { setModuleId(story.module_id); }
    }
    if (error) { setError(null); }
  };

  const validationError = (): string | null => {
    if (!moduleId) { return MODULE_MESSAGE; }
    if (!anchored) { return PROVENANCE_MESSAGE; }
    if (!titleValid(title)) { return TITLE_MESSAGE; }
    if (!hasMinimumSteps(stepCount)) { return STEPS_MESSAGE; }
    return null;
  };

  const handleSubmit = async () => {
    const invalid = validationError();
    if (invalid) {
      setError(invalid);
      return;
    }
    setSubmitting(true);
    setError(null);

    const steps = parsedSteps.map((s, i) => ({
      position: i + 1,
      content: s.content,
      input_data: s.input_data,
      expected: s.expected,
    }));
    const assertions = parseAssertionsYaml(assertionsYaml);

    try {
      const response = await fetch('/api/v1/atcs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          module_id: moduleId,
          user_story_id: storyId,
          title: title.trim(),
          layer,
          tags,
          steps,
          assertions,
          acceptance_criterion_ids: acIds,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
        setError(friendlyError(body));
        setSubmitting(false);
        return;
      }

      const body = (await response.json().catch(() => ({}))) as CreatedAtcBody;
      toast.success('ATC created');
      if (body.atc?.id) {
        router.push(`/projects/${projectSlug}/atcs/${body.atc.id}`);
      }
      else {
        router.push(`/projects/${projectSlug}`);
        router.refresh();
      }
    }
    catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-0" data-testid="new-atc-editor">
      {/* topbar */}
      <div className="flex h-10 flex-shrink-0 items-center justify-between border-b border-stroke-1 bg-surface-1 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href={`/projects/${projectSlug}`}
            className="inline-flex size-7 items-center justify-center rounded-2 border border-stroke-2 bg-surface-2 text-fg-2 hover:border-stroke-3 hover:bg-surface-3 hover:text-fg-0"
          >
            <ChevronLeft size={13} />
          </Link>
          <span className="text-sm text-fg-2">New ATC</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => router.push(`/projects/${projectSlug}`)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            data-testid="new-atc-submit"
            onClick={() => { void handleSubmit(); }}
            disabled={!canSave}
            title={
              canSave
                ? 'Create ATC'
                : validationError() ?? 'Create ATC'
            }
            className={cn(!canSave && 'cursor-not-allowed')}
          >
            <Plus size={11} />
            {submitting ? 'Creating…' : 'Create ATC'}
          </Button>
        </div>
      </div>

      {/* main grid: compose / anchoring */}
      <div className="grid flex-1 grid-cols-[1fr_360px] overflow-hidden">
        {/* compose column */}
        <div className="flex flex-col overflow-auto border-r border-stroke-1">
          <div className="flex flex-col gap-4 p-6">
            <header>
              <label className="block">
                <span className="mb-1 block font-mono text-xs font-semibold uppercase tracking-wider text-fg-2">
                  Title
                  <span className="ml-1 font-normal text-fg-3">required</span>
                </span>
                <Input
                  autoFocus
                  data-testid="new-atc-title"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (error) { setError(null); }
                  }}
                  placeholder="A single observable behaviour — start with a verb"
                  className="h-10 text-md font-semibold"
                />
              </label>
            </header>

            <div className="grid grid-cols-[1fr_auto] items-end gap-3">
              <div>
                <span className="mb-1 block font-mono text-xs font-semibold uppercase tracking-wider text-fg-2">
                  Module
                  <span className="ml-1 font-normal text-fg-3">required</span>
                </span>
                <select
                  data-testid="new-atc-module"
                  value={moduleId ?? ''}
                  onChange={(e) => {
                    setModuleId(e.target.value || null);
                    if (error) { setError(null); }
                  }}
                  className="h-8 w-full rounded-2 border border-stroke-2 bg-surface-2 px-2.5 font-mono text-sm text-fg-1 hover:border-stroke-3 focus:border-accent focus:outline-none"
                >
                  <option value="">Select a module…</option>
                  {modules.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.path}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span className="mb-1 block font-mono text-xs font-semibold uppercase tracking-wider text-fg-2">
                  Layer
                </span>
                <div className="inline-flex items-center gap-0.5 rounded-2 border border-stroke-2 bg-surface-2 p-0.5">
                  {LAYERS.map(l => (
                    <button
                      key={l}
                      type="button"
                      data-testid={`new-atc-layer-${l}`}
                      onClick={() => setLayer(l)}
                      className={cn(
                        'inline-flex h-7 items-center gap-1.5 rounded-1 px-2.5 text-xs transition-colors',
                        layer === l
                          ? 'bg-surface-4 text-fg-0'
                          : 'text-fg-2 hover:text-fg-0',
                      )}
                    >
                      <span
                        className="inline-block size-1.5 rounded-full"
                        style={{
                          background:
                            l === 'UI'
                              ? 'var(--layer-ui)'
                              : l === 'API'
                                ? 'var(--layer-api)'
                                : 'var(--layer-unit)',
                        }}
                      />
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <section>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="font-mono text-xs font-semibold uppercase tracking-wider text-fg-2">
                  Anchoring
                  <span className="ml-1 font-normal text-fg-3">required</span>
                </span>
                <span className={cn(
                  'font-mono text-xs',
                  anchored ? 'text-signal-pass' : 'text-accent',
                )}
                >
                  Moat:
                  {' '}
                  {anchored ? 'ENFORCED' : 'BLOCKED'}
                </span>
              </div>
              <div className="rounded-3 border border-stroke-2 bg-surface-2 p-3">
                <AnchoringPanel
                  embedded
                  stories={stories}
                  storyAcs={storyAcs}
                  selectedStoryId={storyId}
                  selectedAcIds={acIds}
                  onSelectStory={onSelectStory}
                  onToggleAc={(id) => {
                    setAcIds(prev =>
                      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
                    );
                    if (error) { setError(null); }
                  }}
                />
              </div>
            </section>

            <section>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="font-mono text-xs font-semibold uppercase tracking-wider text-fg-2">
                  Steps
                  <span className="ml-1 font-normal text-fg-3">required</span>
                </span>
                <span className="text-xs text-fg-3">
                  markdown · one step per numbered line
                </span>
              </div>
              <AuthoringFormatHint kind="steps" />
              <StepEditor
                language="markdown"
                value={stepsMd}
                onChange={(next) => {
                  setStepsMd(next);
                  if (error) { setError(null); }
                }}
                height={300}
              />
            </section>

            <section>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="font-mono text-xs font-semibold uppercase tracking-wider text-fg-2">
                  Assertions
                </span>
                <span className="text-xs text-fg-3">
                  YAML list · checked by every executor
                </span>
              </div>
              <AuthoringFormatHint kind="assertions" />
              <StepEditor
                language="yaml"
                value={assertionsYaml}
                onChange={setAssertionsYaml}
                height={180}
              />
            </section>

            <section>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="font-mono text-xs font-semibold uppercase tracking-wider text-fg-2">
                  Tags
                </span>
                <span className="text-xs text-fg-3">
                  press Enter to add · max 10
                </span>
              </div>
              <div
                data-testid="new-atc-tags"
                className="flex flex-wrap items-center gap-1.5 rounded-3 border border-stroke-2 bg-surface-2 p-2"
              >
                {tags.map(t => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-1 border border-stroke-1 bg-surface-3 px-1.5 py-0.5 font-mono text-xs text-fg-1"
                  >
                    {t}
                    <button
                      type="button"
                      onClick={() => removeTag(t)}
                      className="text-fg-3 hover:text-fg-0"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  data-testid="new-atc-tag-input"
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder={tags.length ? '' : 'regression, smoke, P1…'}
                  className="min-w-[120px] flex-1 bg-transparent font-mono text-xs text-fg-0 outline-none placeholder:text-fg-4"
                />
              </div>
            </section>

            {error && (
              <p className="text-xs text-signal-fail" data-testid="new-atc-error">
                {error}
              </p>
            )}
          </div>
        </div>

        {/* live preview column */}
        <AtcPreview
          id={null}
          status={null}
          layer={layer}
          breadcrumb={moduleSegments}
          title={title}
          story={selectedStory}
          acs={selectedAcs}
          stepsMd={stepsMd}
          assertionsYaml={assertionsYaml}
          tags={tags}
          draft
        />
      </div>
    </div>
  );
}
