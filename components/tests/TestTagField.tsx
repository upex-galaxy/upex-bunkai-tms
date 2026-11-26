'use client';

import { addTestTag, normalizeTestTagForCompare } from '@lib/tests/tag-input';
import { RESERVED_TEST_TAGS } from '@lib/tests/validation';
import { X } from 'lucide-react';
import { useState } from 'react';

const RESERVED = RESERVED_TEST_TAGS as readonly string[];

interface TestTagFieldProps {
  tags: string[]
  onChange: (tags: string[]) => void
  error: string | null
  onErrorChange: (error: string | null) => void
}

export function TestTagField({ tags, onChange, error, onErrorChange }: TestTagFieldProps) {
  const [input, setInput] = useState('');

  const addTag = (raw: string) => {
    const result = addTestTag(tags, raw);
    if (result.kind === 'empty') { return; }
    if (result.kind === 'refused') {
      onErrorChange(result.error);
      return;
    }
    setInput('');
    if (result.kind === 'added') {
      onChange(result.tags);
      onErrorChange(null);
    }
  };

  const removeTag = (t: string) => onChange(tags.filter(x => x !== t));

  return (
    <>
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-2xs uppercase tracking-wider text-fg-3">Suites:</span>
        {RESERVED.map(r => (
          <button
            key={r}
            type="button"
            data-testid={`test-tag-quickadd-${r}`}
            onClick={() => addTag(r)}
            disabled={tags.some(t => normalizeTestTagForCompare(t) === r)}
            className="inline-flex items-center rounded-1 border border-stroke-1 bg-surface-3 px-1.5 py-0.5 font-mono text-2xs text-fg-2 hover:border-stroke-3 hover:text-fg-0 disabled:opacity-40"
          >
            {r}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 rounded-3 border border-stroke-2 bg-surface-1 p-2">
        {tags.map(t => (
          <span
            key={t}
            data-testid={`test-tag-pill-${t}`}
            className="inline-flex items-center gap-1 rounded-1 border border-stroke-1 bg-surface-3 px-1.5 py-0.5 font-mono text-xs text-fg-1"
          >
            {t}
            <button
              type="button"
              data-testid={`test-tag-remove-${t}`}
              onClick={() => removeTag(t)}
              className="text-fg-3 hover:text-fg-0"
              aria-label={`Remove tag ${t}`}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          value={input}
          data-testid="test-tag-input"
          aria-label="Add a tag"
          onChange={(e) => { setInput(e.target.value); onErrorChange(null); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTag(input);
            }
          }}
          placeholder={tags.length ? '' : 'regression, P1, mobile…'}
          className="min-w-[120px] flex-1 bg-transparent font-mono text-xs text-fg-0 outline-none placeholder:text-fg-4"
        />
      </div>

      {error && (
        <p data-testid="test-tag-error" className="mt-1.5 text-2xs text-signal-fail">{error}</p>
      )}
    </>
  );
}
