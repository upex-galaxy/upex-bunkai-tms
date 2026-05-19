'use client';

import type { AcceptanceCriterion, UserStory } from '@lib/types';
import { cn } from '@lib/utils';
import { Check, FileText, ListChecks } from 'lucide-react';
import { useMemo, useState } from 'react';

interface AnchoringPanelProps {
  stories: UserStory[]
  storyAcs: Record<string, AcceptanceCriterion[]>
  selectedStoryId: string | null
  selectedAcIds: string[]
  onSelectStory: (id: string) => void
  onToggleAc: (id: string) => void
}

export function AnchoringPanel({
  stories,
  storyAcs,
  selectedStoryId,
  selectedAcIds,
  onSelectStory,
  onToggleAc,
}: AnchoringPanelProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) { return stories; }
    return stories.filter(
      s =>
        s.title.toLowerCase().includes(q)
        || (s.external_id?.toLowerCase().includes(q) ?? false),
    );
  }, [query, stories]);

  const acs = selectedStoryId ? storyAcs[selectedStoryId] ?? [] : [];

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-4">
      <Section
        title="Linked User Story"
        hint={selectedStoryId ? '1 selected · required' : 'required'}
        accent={!selectedStoryId}
      >
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search US- or paste a Jira ID…"
          className="mb-2 h-7 w-full rounded-2 border border-stroke-2 bg-surface-2 px-2 text-sm text-fg-1 placeholder:text-fg-4 hover:border-stroke-3 focus:border-accent focus:outline-none"
        />
        <div className="flex flex-col gap-1">
          {filtered.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelectStory(s.id)}
              className={cn(
                'flex items-start gap-2 rounded-2 border p-2 text-left text-sm transition-colors',
                selectedStoryId === s.id
                  ? 'border-accent/35 bg-accent-soft text-fg-0'
                  : 'border-stroke-1 bg-surface-2 text-fg-2 hover:border-stroke-3 hover:bg-surface-3',
              )}
            >
              <FileText size={12} className="mt-0.5 text-fg-3" />
              <div className="min-w-0 flex-1">
                <div className="font-mono text-xs font-semibold text-accent">
                  {s.external_id ?? s.id}
                </div>
                <div className="mt-0.5 text-sm leading-snug text-fg-1">
                  {s.title}
                </div>
              </div>
              {selectedStoryId === s.id && (
                <Check size={12} className="mt-0.5 text-accent" />
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="text-xs italic text-fg-4">No stories match.</div>
          )}
        </div>
      </Section>

      <Section
        title="Acceptance Criteria"
        hint={
          selectedStoryId
            ? `${selectedAcIds.length} of ${acs.length} selected · ≥ 1 required`
            : 'pick a User Story first'
        }
        accent={!!selectedStoryId && selectedAcIds.length === 0}
      >
        {!selectedStoryId && (
          <div className="text-xs italic text-fg-4">
            Select a User Story to see its Acceptance Criteria.
          </div>
        )}
        {selectedStoryId && acs.length === 0 && (
          <div className="text-xs italic text-fg-4">
            This story has no Acceptance Criteria yet.
          </div>
        )}
        {selectedStoryId && acs.length > 0 && (
          <div className="flex flex-col gap-1">
            {acs.map((ac) => {
              const checked = selectedAcIds.includes(ac.id);
              return (
                <button
                  key={ac.id}
                  type="button"
                  onClick={() => onToggleAc(ac.id)}
                  className={cn(
                    'flex items-start gap-2 rounded-2 border p-2 text-left text-sm transition-colors',
                    checked
                      ? 'border-accent/35 bg-accent-soft text-fg-0'
                      : 'border-stroke-1 bg-surface-2 text-fg-2 hover:border-stroke-3 hover:bg-surface-3',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 inline-flex size-3.5 flex-shrink-0 items-center justify-center rounded-1 border',
                      checked
                        ? 'border-accent bg-accent text-white'
                        : 'border-stroke-3',
                    )}
                  >
                    {checked && <Check size={9} />}
                  </span>
                  <ListChecks size={11} className="mt-0.5 text-fg-3" />
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs text-fg-3">{ac.id}</div>
                    <div className="text-sm leading-snug text-fg-1">
                      {ac.title}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  hint,
  accent,
  children,
}: {
  title: string
  hint: string
  accent?: boolean
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="font-mono text-xs font-semibold uppercase tracking-wider text-fg-2">
          {title}
        </span>
        <span
          className={cn(
            'text-xs',
            accent ? 'text-accent' : 'text-fg-3',
          )}
        >
          {hint}
        </span>
      </div>
      {children}
    </section>
  );
}
