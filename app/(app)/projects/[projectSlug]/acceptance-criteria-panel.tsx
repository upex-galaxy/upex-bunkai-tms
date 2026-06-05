'use client';

import type { AcceptanceCriterion, UserStoryStatus } from '@lib/types';
import { MarkdownEditor } from '@components/markdown/markdown-editor';
import { MarkdownRenderer } from '@components/markdown/markdown-renderer';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { byteLength } from '@lib/markdown/format';
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

interface ApiErrorBody {
  error?: {
    code?: string
    message?: string
    details?: { reason?: string }
  }
}

interface AcceptanceCriteriaPanelProps {
  storyId: string
  storyTitle: string
  initialStatus: UserStoryStatus
  onCancel?: () => void
}

const MAX_BYTES = 50 * 1024;

function friendlyError(body: ApiErrorBody): string {
  switch (body.error?.details?.reason) {
    case 'title_required':
      return 'Title is required.';
    case 'title_too_short':
      return 'Title must be at least 3 characters.';
    case 'title_too_long':
      return 'Title must be at most 200 characters.';
    case 'description_too_long':
      return 'Detail must be at most 50 KB.';
    case 'ac_required_for_ready_to_test':
      return 'Add at least one acceptance criterion before marking the story ready to test.';
    case 'not_a_member':
      return 'You do not have permission in this project.';
    case 'already_archived':
      return 'That criterion was already removed.';
  }
  switch (body.error?.code) {
    case 'not_found':
      return 'This no longer exists.';
    case 'unauthorized':
      return 'Your session expired — sign in again.';
    default:
      return body.error?.message ?? 'Something went wrong.';
  }
}

// Live management panel for a story's acceptance criteria (BK-15). Owns its own
// list state — it fetches on open and re-fetches after every mutation — so a
// sequence of add / reorder / edit / remove actions stays consistent while the
// modal is open; `router.refresh()` keeps the background tree in sync. Ordering
// (insert / move / archive re-number with no gaps) and the ready-to-test gate
// are enforced server-side; this UI only drives them.
export function AcceptanceCriteriaPanel({ storyId, storyTitle, initialStatus, onCancel }: AcceptanceCriteriaPanelProps) {
  const router = useRouter();
  const [criteria, setCriteria] = useState<AcceptanceCriterion[]>([]);
  const [status, setStatus] = useState<UserStoryStatus>(initialStatus);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gateMessage, setGateMessage] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState('');
  const [newDetail, setNewDetail] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDetail, setEditDetail] = useState('');

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/user-stories/${storyId}/acceptance-criteria`);
    if (res.ok) {
      const body = (await res.json()) as { acceptance_criteria: AcceptanceCriterion[] };
      setCriteria(body.acceptance_criteria);
    }
    setLoading(false);
  }, [storyId]);

  useEffect(() => { void load(); }, [load]);

  const newOverCap = byteLength(newDetail) > MAX_BYTES;
  const canAdd = newTitle.trim().length > 0 && !newOverCap && !busy;
  const editOverCap = byteLength(editDetail) > MAX_BYTES;
  const canSaveEdit = editTitle.trim().length > 0 && !editOverCap && !busy;

  async function addCriterion() {
    if (!canAdd) { return; }
    setBusy(true);
    setError(null);
    // Adding the first criterion resolves the ready-to-test gate, so clear any
    // stale gate message left over from a prior blocked toggle attempt.
    setGateMessage(null);
    const detail = newDetail.trim();
    const res = await fetch(`/api/v1/user-stories/${storyId}/acceptance-criteria`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: newTitle.trim(), description: detail.length > 0 ? detail : null }),
    });
    if (!res.ok) {
      setError(friendlyError((await res.json().catch(() => ({}))) as ApiErrorBody));
      setBusy(false);
      return;
    }
    setNewTitle('');
    setNewDetail('');
    await load();
    router.refresh();
    setBusy(false);
    toast.success('Criterion added');
  }

  async function moveCriterion(ac: AcceptanceCriterion, delta: number) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/v1/acceptance-criteria/${ac.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ position: ac.position + delta }),
    });
    if (!res.ok) {
      setError(friendlyError((await res.json().catch(() => ({}))) as ApiErrorBody));
      setBusy(false);
      return;
    }
    await load();
    router.refresh();
    setBusy(false);
  }

  async function removeCriterion(ac: AcceptanceCriterion) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/v1/acceptance-criteria/${ac.id}`, { method: 'DELETE' });
    if (!res.ok) {
      setError(friendlyError((await res.json().catch(() => ({}))) as ApiErrorBody));
      setBusy(false);
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { user_story_reverted?: boolean };
    if (body.user_story_reverted) {
      setStatus('draft');
      toast.message('Story moved back to draft — it has no criteria left.');
    }
    if (editingId === ac.id) { setEditingId(null); }
    await load();
    router.refresh();
    setBusy(false);
    toast.success('Criterion removed');
  }

  function startEdit(ac: AcceptanceCriterion) {
    setEditingId(ac.id);
    setEditTitle(ac.title);
    setEditDetail(ac.description ?? '');
    setError(null);
  }

  async function saveEdit() {
    if (!canSaveEdit || editingId === null) { return; }
    setBusy(true);
    setError(null);
    const detail = editDetail.trim();
    const res = await fetch(`/api/v1/acceptance-criteria/${editingId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: editTitle.trim(), description: detail.length > 0 ? detail : null }),
    });
    if (!res.ok) {
      setError(friendlyError((await res.json().catch(() => ({}))) as ApiErrorBody));
      setBusy(false);
      return;
    }
    setEditingId(null);
    await load();
    router.refresh();
    setBusy(false);
    toast.success('Criterion updated');
  }

  async function toggleStatus() {
    setBusy(true);
    setError(null);
    setGateMessage(null);
    const next: UserStoryStatus = status === 'ready_to_test' ? 'draft' : 'ready_to_test';
    const res = await fetch(`/api/v1/user-stories/${storyId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
      if (body.error?.details?.reason === 'ac_required_for_ready_to_test') {
        setGateMessage(friendlyError(body));
      }
      else {
        setError(friendlyError(body));
      }
      setBusy(false);
      return;
    }
    setStatus(next);
    router.refresh();
    setBusy(false);
    toast.success(next === 'ready_to_test' ? 'Marked ready to test' : 'Moved back to draft');
  }

  const isReady = status === 'ready_to_test';

  return (
    <div
      data-testid="acceptance-criteria-panel"
      className="flex max-h-[80vh] w-full flex-col rounded-3 border border-stroke-2 bg-surface-1 p-5"
    >
      <div className="mb-1 font-mono text-xs font-semibold uppercase tracking-widest text-accent">
        Acceptance criteria
      </div>
      <p className="mb-4 truncate text-sm text-fg-2" title={storyTitle}>{storyTitle}</p>

      {/* Ready-to-test gate */}
      <div className="mb-4 flex items-center gap-3 rounded-2 border border-stroke-1 bg-surface-2 px-3 py-2">
        <span
          data-testid="ac-status-badge"
          data-status={status}
          className={
            isReady
              ? 'rounded-1 bg-accent-soft px-2 py-0.5 font-mono text-xs font-semibold text-accent'
              : 'rounded-1 bg-surface-3 px-2 py-0.5 font-mono text-xs font-semibold text-fg-3'
          }
        >
          {isReady ? 'Ready to test' : 'Draft'}
        </span>
        <Button
          type="button"
          data-testid="ac-status-toggle"
          variant={isReady ? 'ghost' : 'primary'}
          size="sm"
          onClick={() => { void toggleStatus(); }}
          disabled={busy}
        >
          {isReady ? 'Back to draft' : 'Mark ready to test'}
        </Button>
      </div>
      {gateMessage && (
        <p className="mb-3 text-xs text-signal-blocked" data-testid="ac-gate-message">
          {gateMessage}
        </p>
      )}

      {/* Criteria list */}
      <div className="mb-4 min-h-0 flex-1 overflow-auto">
        {loading
          ? <p className="text-xs text-fg-4">Loading…</p>
          : criteria.length === 0
            ? <p className="text-xs text-fg-4" data-testid="ac-empty">No acceptance criteria yet. Add the first one below.</p>
            : (
                <ol className="flex flex-col gap-1.5">
                  {criteria.map((ac, index) => (
                    <li key={ac.id} data-testid={`ac-row-${ac.id}`} className="rounded-2 border border-stroke-1 bg-surface-2">
                      {editingId === ac.id
                        ? (
                            <div className="p-3">
                              <Input
                                autoFocus
                                data-testid="ac-edit-title"
                                value={editTitle}
                                onChange={(e) => { setEditTitle(e.target.value); if (error) { setError(null); } }}
                                className="mb-2 h-9 text-sm"
                                placeholder="Criterion title"
                              />
                              <MarkdownEditor
                                value={editDetail}
                                onChange={setEditDetail}
                                maxBytes={MAX_BYTES}
                                placeholder="Optional Markdown detail."
                                rows={4}
                                testId="ac-edit-detail"
                              />
                              <div className="mt-2 flex items-center gap-2">
                                <Button type="button" data-testid="ac-edit-save" variant="primary" size="sm" onClick={() => { void saveEdit(); }} disabled={!canSaveEdit}>
                                  <Check size={13} />
                                  Save
                                </Button>
                                <Button type="button" data-testid="ac-edit-cancel" variant="ghost" size="sm" onClick={() => setEditingId(null)} disabled={busy}>
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          )
                        : (
                            <div className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <span className="w-5 flex-shrink-0 text-right font-mono text-xs text-fg-4">{index + 1}</span>
                                <span className="min-w-0 flex-1 truncate text-sm text-fg-1" title={ac.title}>{ac.title}</span>
                                <div className="flex flex-shrink-0 items-center gap-0.5">
                                  <button
                                    type="button"
                                    data-testid={`ac-up-${ac.id}`}
                                    onClick={() => { void moveCriterion(ac, -1); }}
                                    disabled={busy || index === 0}
                                    title="Move up"
                                    className="flex h-6 w-6 items-center justify-center rounded-1 text-fg-3 hover:bg-surface-3 hover:text-fg-1 disabled:cursor-not-allowed disabled:opacity-30"
                                  >
                                    <ArrowUp size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    data-testid={`ac-down-${ac.id}`}
                                    onClick={() => { void moveCriterion(ac, 1); }}
                                    disabled={busy || index === criteria.length - 1}
                                    title="Move down"
                                    className="flex h-6 w-6 items-center justify-center rounded-1 text-fg-3 hover:bg-surface-3 hover:text-fg-1 disabled:cursor-not-allowed disabled:opacity-30"
                                  >
                                    <ArrowDown size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    data-testid={`ac-edit-${ac.id}`}
                                    onClick={() => startEdit(ac)}
                                    disabled={busy}
                                    title="Edit criterion"
                                    className="flex h-6 w-6 items-center justify-center rounded-1 text-fg-3 hover:bg-surface-3 hover:text-fg-1 disabled:opacity-30"
                                  >
                                    <Pencil size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    data-testid={`ac-remove-${ac.id}`}
                                    onClick={() => { void removeCriterion(ac); }}
                                    disabled={busy}
                                    title="Remove criterion"
                                    className="flex h-6 w-6 items-center justify-center rounded-1 text-fg-3 hover:bg-surface-3 hover:text-signal-fail disabled:opacity-30"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                              {ac.description != null && ac.description.trim().length > 0 && (
                                <div className="mt-1.5 pl-7">
                                  <MarkdownRenderer content={ac.description} className="text-xs text-fg-3" />
                                </div>
                              )}
                            </div>
                          )}
                    </li>
                  ))}
                </ol>
              )}
      </div>

      {/* Add form */}
      <div className="border-t border-stroke-1 pt-4">
        <span className="mb-1.5 block text-xs font-medium text-fg-2">Add a criterion</span>
        <Input
          data-testid="ac-new-title"
          value={newTitle}
          onChange={(e) => { setNewTitle(e.target.value); if (error) { setError(null); } }}
          placeholder="Full refund within 30 days"
          className="mb-2 h-9 text-sm"
        />
        <MarkdownEditor
          value={newDetail}
          onChange={setNewDetail}
          maxBytes={MAX_BYTES}
          placeholder="Optional Markdown detail."
          rows={4}
          testId="ac-new-detail"
        />
        <div className="mt-2 flex items-center gap-2">
          <Button type="button" data-testid="ac-add" variant="primary" size="sm" onClick={() => { void addCriterion(); }} disabled={!canAdd}>
            <Plus size={13} />
            {busy ? 'Working…' : 'Add criterion'}
          </Button>
          {onCancel && (
            <Button type="button" data-testid="ac-panel-close" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
              <X size={13} />
              Close
            </Button>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-3 text-xs text-signal-fail" data-testid="ac-error">{error}</p>
      )}
    </div>
  );
}
