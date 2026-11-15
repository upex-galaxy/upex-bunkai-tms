'use client';

import type { DraftEvidence, DraftImage } from '@lib/bugs/evidence-draft';
import type { Dispatch, SetStateAction } from 'react';
import { Button } from '@components/ui/button';
import { BUG_EVIDENCE_MAX, BUG_EVIDENCE_MESSAGES } from '@lib/bugs/constants';
import { isEvidenceFull, planSelection, usedSlots } from '@lib/bugs/evidence-draft';
import { precheckEvidenceFile, uploadEvidenceFile } from '@lib/runs/evidence-upload';
import { formatByteSize } from '@lib/runs/evidence-view';
import { isHttpUrl } from '@lib/utils/url';
import { Paperclip, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

// BK-594 - the Evidence field of the Report-bug drawer: pasted links and images from the
// tester's machine in ONE ordered list, on one budget of ten (and 50 MiB of images). Images
// are picked with the Attach control (the BK-593 runner treatment) or dropped onto the field;
// clipboard paste is out of scope for v1 (PO-2). Each image uploads and commits the moment it
// is picked (init -> PUT -> commit, ADR-0019), owned by the tester and counted against this
// drawer's draft until the filing claims it. A not-yet-filed image previews from the tester's
// own file: nothing unfiled is ever served by the server.

const ACCEPT = 'image/png,image/jpeg,image/webp';
// Bounds each commit attempt, so a commit that hangs after the bytes landed (BK-1450) ends as
// a retryable failure instead of an endless "Uploading".
const COMMIT_TIMEOUT_MS = 30_000;

interface BugEvidenceFieldProps {
  items: DraftEvidence[]
  setItems: Dispatch<SetStateAction<DraftEvidence[]>>
  // Null when the drawer has no Project to count uploads against: links only.
  projectId: string | null
  draftId: string
  disabled: boolean
  onChange: () => void
}

let keySeq = 0;
function nextKey(prefix: string): string {
  keySeq += 1;
  return `${prefix}-${keySeq}`;
}

export function discardDraftUpload(projectId: string, attachmentId: string): void {
  void fetch(`/api/v1/projects/${projectId}/bug-evidence/${attachmentId}`, { method: 'DELETE' }).catch(() => undefined);
}

export function BugEvidenceField({ items, setItems, projectId, draftId, disabled, onChange }: BugEvidenceFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previews = useRef(new Map<string, string>());
  const [draft, setDraft] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [notices, setNotices] = useState<Array<{ key: string, text: string }>>([]);
  const [dragging, setDragging] = useState(false);
  // Every write to the list goes through `update`, which keeps this mirror current
  // synchronously: the budget of a second quick selection is read from it, never from a
  // React updater (those run later, and twice under StrictMode).
  const itemsRef = useRef(items);
  const update = (next: (list: DraftEvidence[]) => DraftEvidence[]) => {
    itemsRef.current = next(itemsRef.current);
    setItems(itemsRef.current);
  };

  useEffect(() => {
    const map = previews.current;
    return () => {
      for (const url of map.values()) { URL.revokeObjectURL(url); }
      map.clear();
    };
  }, []);

  const full = isEvidenceFull(items);
  const canAttach = projectId !== null && !disabled;

  const patchImage = (key: string, patch: Partial<DraftImage>) => {
    update(list => list.map(item => (item.key === key && item.kind === 'image' ? { ...item, ...patch } : item)));
  };

  const addLink = () => {
    const trimmed = draft.trim();
    if (!trimmed) { return; }
    if (full) {
      setLinkError(BUG_EVIDENCE_MESSAGES.count);
      return;
    }
    if (!isHttpUrl(trimmed)) {
      setLinkError('Evidence link must be a valid URL.');
      return;
    }
    update(list => [...list, { kind: 'link', key: nextKey('link'), url: trimmed }]);
    setDraft('');
    setLinkError(null);
    onChange();
  };

  const removeItem = (item: DraftEvidence) => {
    update(list => list.filter(other => other.key !== item.key));
    const preview = previews.current.get(item.key);
    if (preview) {
      URL.revokeObjectURL(preview);
      previews.current.delete(item.key);
    }
    if (item.kind === 'image' && item.status === 'ready' && item.attachmentId && projectId) {
      discardDraftUpload(projectId, item.attachmentId);
    }
    onChange();
  };

  const handleFiles = async (fileList: FileList | File[] | null) => {
    if (!fileList || !projectId) { return; }
    const files = Array.from(fileList);
    if (inputRef.current) { inputRef.current.value = ''; }
    if (files.length === 0) { return; }

    // The content decides, before any request: a refused file never takes a slot (AC-04).
    const checked = await Promise.all(files.map(async file => ({ file, verdict: await precheckEvidenceFile(file) })));
    const refusals = checked.flatMap(c => (c.verdict.ok ? [] : [{ key: nextKey('notice'), text: `${c.file.name}: ${c.verdict.message}` }]));
    const valid = checked.flatMap(c => (c.verdict.ok ? [c.file] : []));

    // The budget is read from the latest list, so two quick selections cannot both take the
    // last slot (AC-13, AC-20). Accepted files reserve their slot at once, as `uploading`.
    const plan = planSelection(itemsRef.current, valid);
    const queued = plan.accepted.map(file => ({ file, key: nextKey('image') }));
    update(list => [
      ...list,
      ...queued.map(({ file, key }): DraftImage => ({ kind: 'image', key, name: file.name || 'image', size: file.size, status: 'uploading', attachmentId: null, error: null })),
    ]);
    const capRefusals = plan.refused.map(r => ({ key: nextKey('notice'), text: `${r.file.name}: ${r.message}` }));
    setNotices(list => [...list, ...refusals, ...capRefusals]);
    onChange();

    // One at a time, in selection order: each init re-checks the draft cap on the server.
    for (const { file, key } of queued) {
      try {
        previews.current.set(key, URL.createObjectURL(file));
      }
      catch {
        // no preview in this browser: the row still shows the name
      }
      const outcome = await uploadEvidenceFile<{ id: string }>({
        file,
        base: `/api/v1/projects/${projectId}/bug-evidence`,
        initFields: { draft_id: draftId },
        commitTimeoutMs: COMMIT_TIMEOUT_MS,
      });
      if (outcome.ok) {
        patchImage(key, { status: 'ready', attachmentId: outcome.attachment.id, error: null });
      }
      else {
        patchImage(key, { status: 'failed', error: outcome.message });
      }
    }
  };

  const used = usedSlots(items);

  return (
    <div
      data-testid="bug-evidence-field"
      onDragOver={(e) => {
        if (!canAttach || !e.dataTransfer.types.includes('Files')) { return; }
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (!canAttach) { return; }
        e.preventDefault();
        setDragging(false);
        void handleFiles(e.dataTransfer.files);
      }}
      className={`rounded-2 ${dragging ? 'outline-dashed outline-1 outline-offset-4 outline-accent' : ''}`}
    >
      <div className="mb-1.5 mt-3 flex items-center justify-between">
        <span className="text-xs text-fg-2">Evidence</span>
        <span data-testid="bug-evidence-counter" className="font-mono text-2xs text-fg-4">
          {used}
          {' / '}
          {BUG_EVIDENCE_MAX}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {items.map((item, index) => (
          item.kind === 'link'
            ? (
                <div key={item.key} className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate rounded-2 border border-stroke-2 bg-surface-2 px-2.5 py-1.5 text-xs text-fg-2">
                    {item.url}
                  </span>
                  <button
                    type="button"
                    data-testid={`bug-evidence-remove-${index}`}
                    onClick={() => removeItem(item)}
                    disabled={disabled}
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-1 border border-stroke-2 bg-surface-2 text-fg-3 hover:border-stroke-3 hover:text-fg-1"
                    aria-label="Remove evidence link"
                  >
                    <X size={11} />
                  </button>
                </div>
              )
            : (
                <div key={item.key} data-testid={`bug-evidence-image-${index}`} data-status={item.status} className="flex items-center gap-1.5">
                  <span
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded-2 border bg-surface-2 px-2.5 py-1 text-xs ${item.status === 'failed' ? 'border-signal-fail text-signal-fail' : 'border-stroke-2 text-fg-2'}`}
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-1 border border-stroke-2 bg-surface-1">
                      {previews.current.get(item.key)
                        ? (
                            // eslint-disable-next-line @next/next/no-img-element -- a local object URL of the tester's own file, never a server image
                            <img src={previews.current.get(item.key)} alt="" className="h-full w-full object-cover" />
                          )
                        : <Paperclip size={11} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate" title={item.name}>{item.name}</span>
                    <span className="shrink-0 font-mono text-2xs text-fg-4">
                      {item.status === 'uploading' ? 'Uploading…' : item.status === 'failed' ? 'Failed' : formatByteSize(item.size)}
                    </span>
                  </span>
                  <button
                    type="button"
                    data-testid={`bug-evidence-image-remove-${index}`}
                    onClick={() => removeItem(item)}
                    disabled={disabled || item.status === 'uploading'}
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-1 border border-stroke-2 bg-surface-2 text-fg-3 hover:border-stroke-3 hover:text-fg-1 disabled:pointer-events-none disabled:opacity-50"
                    aria-label={`Remove ${item.name}`}
                  >
                    <X size={11} />
                  </button>
                </div>
              )
        ))}
        {items.map(item => (item.kind === 'image' && item.status === 'failed' && item.error
          ? (
              <p key={`${item.key}-error`} role="alert" data-testid="bug-evidence-image-error" className="m-0 break-words text-2xs text-signal-fail">
                {item.name}
                :
                {' '}
                {item.error}
              </p>
            )
          : null))}

        {full
          ? (
              <p data-testid="bug-evidence-full" className="m-0 text-2xs text-fg-4">{BUG_EVIDENCE_MESSAGES.count}</p>
            )
          : (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  data-testid="bug-evidence-draft-input"
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    if (linkError) { setLinkError(null); }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addLink();
                    }
                  }}
                  disabled={disabled}
                  placeholder="https://…"
                  className="w-full min-w-0 flex-1 rounded-2 border border-stroke-2 bg-surface-2 px-2.5 py-1.5 text-xs text-fg-1 placeholder:text-fg-4 focus:border-accent focus:outline-none"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  data-testid="bug-evidence-add"
                  onClick={addLink}
                  disabled={disabled || !draft.trim()}
                  aria-label="Add evidence link"
                >
                  <Plus size={11} />
                </Button>
                {projectId !== null && (
                  <>
                    <button
                      type="button"
                      data-testid="bug-evidence-attach"
                      disabled={!canAttach}
                      onClick={() => inputRef.current?.click()}
                      title="Attach PNG, JPEG or WebP images, or drop them here"
                      className="inline-flex shrink-0 items-center gap-1 rounded-1 border border-stroke-2 bg-surface-1 px-2 py-1 text-2xs font-medium text-fg-2 transition-colors hover:border-stroke-3 hover:text-fg-1 disabled:pointer-events-none disabled:opacity-50"
                    >
                      <Paperclip size={11} />
                      Attach
                    </button>
                    <input
                      ref={inputRef}
                      type="file"
                      accept={ACCEPT}
                      multiple
                      hidden
                      data-testid="bug-evidence-attach-input"
                      onChange={(e) => { void handleFiles(e.target.files); }}
                    />
                  </>
                )}
              </div>
            )}

        {linkError && (
          <p data-testid="bug-evidence-link-error" className="m-0 text-2xs text-signal-fail">{linkError}</p>
        )}
        {notices.map(notice => (
          <span key={notice.key} role="alert" data-testid="bug-evidence-notice" className="flex items-start gap-2 text-2xs text-signal-fail">
            <span className="min-w-0 flex-1 break-words">{notice.text}</span>
            <button type="button" onClick={() => setNotices(list => list.filter(n => n.key !== notice.key))} className="shrink-0 underline hover:text-fg-1">
              Dismiss
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
