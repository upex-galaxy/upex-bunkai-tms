'use client';

import type { BulkEditChange, BulkEditField, BulkModuleOption, BulkTagOp } from '@lib/atcs/bulk-edit';
import type { AtcLayer, AtcPriority } from '@lib/types';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Select } from '@components/ui/select';
import {
  bulkSelectionProblem,
  bulkTagsProblem,
  parseBulkTagInput,
  pluralAtcs,
} from '@lib/atcs/bulk-edit';
import { ATC_LAYERS, ATC_PRIORITIES } from '@lib/atcs/validation';
import { Pencil, X } from 'lucide-react';
import { useState } from 'react';

// BK-507 — the bulk-edit bar (master-design-plan §5 D64, §4.26). It appears only
// while something is selected and never writes: "Review change" opens the
// confirmation, which previews and then applies. ONE field per action (ADR-0027).
// Built on the live filter toolbar's container and atoms, no new token.

interface AtcBulkEditBarProps {
  count: number
  // Selected ATCs the current filters hide (E6). Named here, and again in the
  // confirmation, because the change applies to the whole selection.
  hiddenCount: number
  modules: BulkModuleOption[]
  onClear: () => void
  onReview: (change: BulkEditChange, moduleLabel?: string) => void
}

const FIELD_LABEL: Record<BulkEditField, string> = {
  tags: 'Tags',
  module: 'Module',
  layer: 'Layer',
  priority: 'Priority',
};

const FIELD_ORDER: BulkEditField[] = ['tags', 'module', 'layer', 'priority'];

// The `<select>` value for "set the priority back to not specified".
const CLEAR_PRIORITY = '__clear__';

export function AtcBulkEditBar({ count, hiddenCount, modules, onClear, onReview }: AtcBulkEditBarProps) {
  const [field, setField] = useState<BulkEditField>('tags');
  const [tagOp, setTagOp] = useState<BulkTagOp>('add');
  const [tagText, setTagText] = useState('');
  const [moduleId, setModuleId] = useState('');
  const [layer, setLayer] = useState<AtcLayer | ''>('');
  const [priority, setPriority] = useState<AtcPriority | typeof CLEAR_PRIORITY | ''>('');

  const tags = parseBulkTagInput(tagText);
  // Only nag once the user has typed something.
  const tagsProblem = tagText.trim() === '' ? null : bulkTagsProblem(tags);
  const selectionProblem = bulkSelectionProblem(count);

  let change: BulkEditChange | null = null;
  if (field === 'tags' && tags.length > 0 && bulkTagsProblem(tags) === null) {
    change = { field: 'tags', op: tagOp, tags };
  }
  else if (field === 'module' && moduleId !== '') {
    change = { field: 'module', moduleId };
  }
  else if (field === 'layer' && layer !== '') {
    change = { field: 'layer', layer };
  }
  else if (field === 'priority' && priority !== '') {
    change = { field: 'priority', priority: priority === CLEAR_PRIORITY ? null : priority };
  }

  const review = () => {
    if (!change || selectionProblem) { return; }
    onReview(change, modules.find(m => m.id === moduleId)?.path);
  };

  return (
    <div className="border-b border-stroke-1 bg-surface-1 px-4 py-3">
      <div
        data-testid="atc-bulk-bar"
        role="region"
        aria-label="Bulk edit the selected ATCs"
        className="flex flex-wrap items-end gap-4 rounded-3 border border-accent bg-surface-2 p-3 shadow-card"
      >
        <div className="flex flex-col gap-1.5">
          <span className="text-2xs font-semibold uppercase tracking-[0.04em] text-fg-2">Selected</span>
          <span data-testid="atc-bulk-selected" className="flex h-8 items-center text-sm text-fg-0">
            {pluralAtcs(count)}
          </span>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-2xs font-semibold uppercase tracking-[0.04em] text-fg-2">Change</span>
          <Select
            data-testid="atc-bulk-field"
            value={field}
            onChange={e => setField(e.target.value as BulkEditField)}
            className="min-w-[140px]"
          >
            {FIELD_ORDER.map(f => (
              <option key={f} value={f}>{FIELD_LABEL[f]}</option>
            ))}
          </Select>
        </label>

        {field === 'tags' && (
          <>
            <label className="flex flex-col gap-1.5">
              <span className="text-2xs font-semibold uppercase tracking-[0.04em] text-fg-2">Action</span>
              <Select
                data-testid="atc-bulk-tag-op"
                value={tagOp}
                onChange={e => setTagOp(e.target.value as BulkTagOp)}
                className="min-w-[120px]"
              >
                <option value="add">Add tags</option>
                <option value="remove">Remove tags</option>
              </Select>
            </label>
            <label className="flex min-w-[220px] flex-1 flex-col gap-1.5">
              <span className="text-2xs font-semibold uppercase tracking-[0.04em] text-fg-2">Tags (comma separated)</span>
              <Input
                data-testid="atc-bulk-tags"
                value={tagText}
                onChange={e => setTagText(e.target.value)}
                placeholder="regression, smoke"
                aria-invalid={tagsProblem ? true : undefined}
                aria-describedby={tagsProblem ? 'atc-bulk-tags-problem' : undefined}
              />
            </label>
          </>
        )}

        {field === 'module' && (
          <label className="flex min-w-[260px] flex-1 flex-col gap-1.5">
            <span className="text-2xs font-semibold uppercase tracking-[0.04em] text-fg-2">Move to Module</span>
            <Select
              data-testid="atc-bulk-module"
              value={moduleId}
              onChange={e => setModuleId(e.target.value)}
            >
              <option value="">Choose a Module…</option>
              {modules.map(m => (
                <option key={m.id} value={m.id}>{m.path}</option>
              ))}
            </Select>
          </label>
        )}

        {field === 'layer' && (
          <label className="flex flex-col gap-1.5">
            <span className="text-2xs font-semibold uppercase tracking-[0.04em] text-fg-2">Set layer to</span>
            <Select
              data-testid="atc-bulk-layer"
              value={layer}
              onChange={e => setLayer(e.target.value as AtcLayer | '')}
              className="min-w-[140px]"
            >
              <option value="">Choose a layer…</option>
              {ATC_LAYERS.map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </Select>
          </label>
        )}

        {field === 'priority' && (
          <label className="flex flex-col gap-1.5">
            <span className="text-2xs font-semibold uppercase tracking-[0.04em] text-fg-2">Set priority to</span>
            <Select
              data-testid="atc-bulk-priority"
              value={priority}
              onChange={e => setPriority(e.target.value as AtcPriority | typeof CLEAR_PRIORITY | '')}
              className="min-w-[160px]"
            >
              <option value="">Choose a priority…</option>
              {ATC_PRIORITIES.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
              <option value={CLEAR_PRIORITY}>Not specified (clear)</option>
            </Select>
          </label>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            data-testid="atc-bulk-review"
            disabled={!change || selectionProblem !== null}
            onClick={review}
          >
            <Pencil size={12} aria-hidden />
            Review change
          </Button>
          <Button type="button" variant="ghost" size="sm" data-testid="atc-bulk-clear" onClick={onClear}>
            <X size={12} aria-hidden />
            Clear selection
          </Button>
        </div>

        {/* Polite live region, always mounted so a message is announced when it
            appears. Hidden-by-filter, tag input and ceiling problems share it. */}
        <div aria-live="polite" className="basis-full text-xs">
          {selectionProblem && (
            <p data-testid="atc-bulk-ceiling" className="m-0 text-signal-fail">{selectionProblem}</p>
          )}
          {tagsProblem && (
            <p id="atc-bulk-tags-problem" data-testid="atc-bulk-tags-problem" className="m-0 text-signal-fail">{tagsProblem}</p>
          )}
          {hiddenCount > 0 && (
            <p data-testid="atc-bulk-hidden" className="m-0 text-fg-2">
              {hiddenCount === 1
                ? '1 selected ATC is hidden by the current filters. The change applies to it too.'
                : `${hiddenCount} selected ATCs are hidden by the current filters. The change applies to them too.`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
