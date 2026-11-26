'use client';

import { TestTagField } from '@components/tests/TestTagField';
import { Button } from '@components/ui/button';
import { Save, Tag } from 'lucide-react';
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

export function TestTagEditor({ testId, version, initialTags }: TestTagEditorProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
      <TestTagField tags={tags} onChange={setTags} error={error} onErrorChange={setError} />

      <div className="mt-2 flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          data-testid="test-tag-cancel"
          onClick={() => { setTags(initialTags); setError(null); setOpen(false); }}
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
