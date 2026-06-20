'use client';

import { Button } from '@components/ui/button';
import { RESERVED_TEST_TAGS, TEST_TAG_MAX_LEN, TEST_TAGS_MAX_COUNT } from '@lib/tests/validation';
import { Save, Tag, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

// BK-33 — inline tag editor for the Test detail header. Reuses the AtcEditor
// pill idiom verbatim (frozen §2 tokens): reserved suite tags as quick-add
// chips + a free-text input (Enter to add, `×` to remove), inline validation
// (comma / length / count), and Save. Save sends PUT /api/v1/tests/{id}/tags
// with `X-If-Match: {version}` (optimistic lock, BK-96), then router.refresh()
// re-runs the server read so the header + the toolbar filter reflect the new
// set. A 409 conflict surfaces a toast and refreshes — never a silent overwrite.
//
// Mounted ONLY for members+ (canReorder gate in TestDetailView); the RPC's own
// write gate stays authoritative regardless of what the UI exposes.
//
// Casing rule (PO-flagged): reserved tags (smoke/sanity/regression) are
// lowercased client-side for the dedupe check, but custom tags PRESERVE the
// user's casing — the server is the enforcement of record either way.

interface TestTagEditorProps {
  testId: string
  version: number
  initialTags: string[]
}

const RESERVED = RESERVED_TEST_TAGS as readonly string[];

// Reserved tags are case-insensitive (lowercased); custom tags keep their
// casing. The "normalized" form is only used to detect duplicates so adding the
// same tag twice collapses to one (mirrors the server normalize helper).
function normalizeForCompare(tag: string): string {
  const t = tag.trim();
  return RESERVED.includes(t.toLowerCase()) ? t.toLowerCase() : t;
}

export function TestTagEditor({ testId, version, initialTags }: TestTagEditorProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const addTag = (raw: string) => {
    const value = raw.trim();
    if (!value) { return; }
    if (value.includes(',')) {
      setError('Tags must not contain commas.');
      return;
    }
    if (value.length > TEST_TAG_MAX_LEN) {
      setError(`Tags must be ${TEST_TAG_MAX_LEN} characters or fewer.`);
      return;
    }
    const norm = normalizeForCompare(value);
    if (tags.some(t => normalizeForCompare(t) === norm)) {
      // Already present (after reserved-lowercase) — adding twice is a no-op.
      setInput('');
      return;
    }
    if (tags.length >= TEST_TAGS_MAX_COUNT) {
      setError(`A Test can carry at most ${TEST_TAGS_MAX_COUNT} tags.`);
      return;
    }
    // Reserved tags store lowercased; custom tags keep the user's casing.
    setTags([...tags, RESERVED.includes(value.toLowerCase()) ? value.toLowerCase() : value]);
    setInput('');
    setError(null);
  };

  const removeTag = (t: string) => setTags(tags.filter(x => x !== t));

  const save = () => {
    startTransition(async () => {
      setError(null);
      try {
        const res = await fetch(`/api/v1/tests/${testId}/tags`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-If-Match': String(version) },
          body: JSON.stringify({ tags }),
        });
        if (res.status === 409) {
          toast.error('Someone else changed this Test. Reloading the latest tags.');
          setOpen(false);
          router.refresh();
          return;
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
          setError(body?.error?.message ?? 'Could not save tags.');
          return;
        }
        toast.success('Tags updated.');
        setOpen(false);
        router.refresh();
      }
      catch {
        setError('Network error — tags not saved.');
      }
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        data-testid="test-tag-editor-open"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-1 border border-dashed border-stroke-2 px-1.5 py-0.5 text-2xs text-fg-3 hover:border-stroke-3 hover:text-fg-1"
      >
        <Tag size={10} />
        Edit tags
      </button>
    );
  }

  return (
    <div
      data-testid="test-tag-editor"
      className="w-full max-w-[820px] rounded-3 border border-stroke-2 bg-surface-2 p-2"
    >
      {/* quick-add reserved suite tags */}
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-2xs uppercase tracking-wider text-fg-3">Suites:</span>
        {RESERVED.map(r => (
          <button
            key={r}
            type="button"
            data-testid={`test-tag-quickadd-${r}`}
            onClick={() => addTag(r)}
            disabled={tags.some(t => normalizeForCompare(t) === r)}
            className="inline-flex items-center rounded-1 border border-stroke-1 bg-surface-3 px-1.5 py-0.5 font-mono text-2xs text-fg-2 hover:border-stroke-3 hover:text-fg-0 disabled:opacity-40"
          >
            {r}
          </button>
        ))}
      </div>

      {/* current tags + free-text input (AtcEditor pill idiom) */}
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
          onChange={(e) => { setInput(e.target.value); setError(null); }}
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

      <div className="mt-2 flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          data-testid="test-tag-cancel"
          onClick={() => { setTags(initialTags); setInput(''); setError(null); setOpen(false); }}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          data-testid="test-tag-save"
          disabled={isPending}
          onClick={save}
        >
          <Save size={11} />
          {isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
