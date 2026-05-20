'use client';

import type { AcceptanceCriterion, Atc, AtcAssertion, AtcLayer, AtcStep, Module, UserStory } from '@lib/types';
import { AnchoringPanel } from '@components/atcs/AnchoringPanel';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { assertionsToYaml, stepsToMarkdown } from '@lib/atc-parse';
import { cn } from '@lib/utils';
import { ChevronLeft, Save } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
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

export interface AtcSaveInput {
  atcId: string
  projectSlug: string
  title: string
  layer: string
  tags: string[]
  userStoryId: string
  stepsMarkdown: string
  assertionsYaml: string
  acIds: string[]
}

export type AtcSaveResult
  = | { ok: true }
    | { ok: false, error: string };

interface AtcEditorProps {
  atc: Atc
  module: Module | null
  modulePath: string
  initialSteps: AtcStep[]
  initialAssertions: AtcAssertion[]
  initialAcIds: string[]
  stories: UserStory[]
  storyAcs: Record<string, AcceptanceCriterion[]>
  projectSlug: string
  onSave: (input: AtcSaveInput) => Promise<AtcSaveResult>
}

const LAYERS: AtcLayer[] = ['UI', 'API', 'Unit'];

export function AtcEditor({
  atc,
  module,
  modulePath,
  initialSteps,
  initialAssertions,
  initialAcIds,
  stories,
  storyAcs,
  projectSlug,
  onSave,
}: AtcEditorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState(atc.title);
  const [layer, setLayer] = useState<AtcLayer>(atc.layer);
  const [tags, setTags] = useState<string[]>(atc.tags);
  const [tagInput, setTagInput] = useState('');
  const [storyId, setStoryId] = useState<string | null>(atc.user_story_id);
  const [acIds, setAcIds] = useState<string[]>(initialAcIds);

  const [stepsMd, setStepsMd] = useState(() => stepsToMarkdown(initialSteps));
  const [assertionsYaml, setAssertionsYaml] = useState(() => assertionsToYaml(initialAssertions));

  const isAnchored = !!storyId && acIds.length >= 1;
  const canSave = isAnchored && title.trim().length > 0 && !isPending;

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (!t || tags.includes(t)) { return; }
    setTags([...tags, t]);
    setTagInput('');
  };

  const removeTag = (t: string) => setTags(tags.filter(x => x !== t));

  const handleSave = () => {
    if (!canSave || !storyId) { return; }
    startTransition(async () => {
      const result = await onSave({
        atcId: atc.id,
        projectSlug,
        title: title.trim(),
        layer,
        tags,
        userStoryId: storyId,
        stepsMarkdown: stepsMd,
        assertionsYaml,
        acIds,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success('ATC saved');
      router.refresh();
    });
  };

  const breadcrumbItems = useMemo(
    () => [...modulePath.split('/'), atc.id],
    [modulePath, atc.id],
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface-0">
      {/* topbar */}
      <div className="flex h-10 flex-shrink-0 items-center justify-between border-b border-stroke-1 bg-surface-1 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href={`/projects/${projectSlug}`}
            className="inline-flex size-7 items-center justify-center rounded-2 border border-stroke-2 bg-surface-2 text-fg-2 hover:border-stroke-3 hover:bg-surface-3 hover:text-fg-0"
          >
            <ChevronLeft size={13} />
          </Link>
          <span className="font-mono text-xs text-fg-3">{atc.id}</span>
          <span className="dot" data-status={atc.status} />
          <span className="text-sm text-fg-2">
            {module ? `editing in ${module.name}` : 'editing'}
          </span>
          <span className="ml-2 text-xs text-fg-3">
            ·
            {' '}
            {breadcrumbItems.join(' / ')}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost">Cancel</Button>
          <Button
            size="sm"
            variant="primary"
            onClick={handleSave}
            disabled={!canSave}
            title={
              !canSave
                ? !storyId
                    ? 'Pick a User Story to enable Save'
                    : acIds.length === 0
                      ? 'Bind at least one Acceptance Criterion to enable Save'
                      : 'Add a title to enable Save'
                : 'Save ATC (⌘S)'
            }
            className={cn(
              !canSave && 'cursor-not-allowed',
            )}
          >
            <Save size={11} />
            {isPending ? 'Saving…' : 'Save ATC'}
            <span className="kbd">⌘</span>
            <span className="kbd">S</span>
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
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="A single observable behaviour — start with a verb"
                  className="h-10 text-md font-semibold"
                />
              </label>
            </header>

            <div className="grid grid-cols-[1fr_auto] items-end gap-3">
              <div>
                <span className="mb-1 block font-mono text-xs font-semibold uppercase tracking-wider text-fg-2">
                  Module
                </span>
                <div className="inline-flex h-8 items-center gap-2 rounded-2 border border-stroke-2 bg-surface-2 px-2.5 font-mono text-sm text-fg-1">
                  {modulePath}
                </div>
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
                  Steps
                </span>
                <span className="text-xs text-fg-3">
                  markdown · one step per numbered line
                </span>
              </div>
              <StepEditor
                language="markdown"
                value={stepsMd}
                onChange={setStepsMd}
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
                <span className="text-xs text-fg-3">press Enter to add</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 rounded-3 border border-stroke-2 bg-surface-2 p-2">
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
          </div>
        </div>

        {/* anchoring column */}
        <aside className="flex flex-col overflow-hidden bg-surface-1">
          <div className="flex h-9 flex-shrink-0 items-center justify-between border-b border-stroke-1 px-3">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-fg-0">
              Anchoring
            </span>
            <span className={cn(
              'text-xs',
              isAnchored ? 'text-signal-pass' : 'text-accent',
            )}
            >
              {isAnchored ? 'valid' : 'missing'}
            </span>
          </div>
          <AnchoringPanel
            stories={stories}
            storyAcs={storyAcs}
            selectedStoryId={storyId}
            selectedAcIds={acIds}
            onSelectStory={(id) => {
              setStoryId(id);
              // Reset AC selection when story changes
              setAcIds([]);
            }}
            onToggleAc={(id) => {
              setAcIds(prev =>
                prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
              );
            }}
          />
          <div className="flex flex-shrink-0 items-center justify-between border-t border-stroke-1 bg-surface-0 px-3 py-2 text-xs">
            <span className="text-fg-3">
              Moat:
              {' '}
              <span className={cn(
                'font-mono',
                isAnchored ? 'text-signal-pass' : 'text-accent',
              )}
              >
                {isAnchored ? 'ENFORCED' : 'BLOCKED'}
              </span>
            </span>
            <span className="text-fg-4">schema · atc.v1</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
