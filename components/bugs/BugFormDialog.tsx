'use client';

import type { BugSeverity } from '@lib/bugs/constants';
import type { DraftEvidence } from '@lib/bugs/evidence-draft';
import { revalidateAfterBugFiled } from '@app/(app)/bugs/actions';
import { BugEvidenceField, discardDraftUpload } from '@components/bugs/BugEvidenceField';
import { Button } from '@components/ui/button';
import { Select } from '@components/ui/select';
import {
  BUG_SEVERITY_LABEL,
  BUG_SEVERITY_VALUES,
  BUG_TITLE_MAX,
  BUG_TITLE_MIN,
} from '@lib/bugs/constants';
import {
  buildEvidencePayload,
  idempotencyKeyFor,
  readyAttachmentIds,
  SUBMIT_BLOCKER_MESSAGES,
  submitBlocker,
} from '@lib/bugs/evidence-draft';
import { BUG_TITLE_MESSAGE } from '@lib/bugs/validation';
import { isEditableTarget, resolveSeverityShortcut } from '@lib/runs/runner-keyboard';
import { Bug } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

// BK-40 — the "Report bug" / "New bug" dialog, matching RunnerView's existing
// Abort/Finish overlay family (Technical Decision 9): a plain fixed-inset
// overlay (no native <dialog>, which blocks the page), role="dialog",
// click-outside-to-close, autoFocus on the first field. Kept as a top-level
// component (unlike Abort/Finish, which are inlined in RunnerView.tsx)
// because both entry points share it verbatim (Technical Decision 11 — "one
// shared form component ... parameterized by an optional runContext prop"):
// Slice 2's run-linked "Report bug" (module server-derived, read-only) and
// Slice 3's standalone "New bug" (module explicitly picked, since there is no
// run to derive it from).

// BK-40 Slice 2 — run-linked: the module is server-derived from run_step_id
// (Technical Decision 7), never client-supplied; `moduleLabel` is display-only.
export interface BugFormDialogRunLinkedContext {
  mode: 'run-linked'
  runStepId: string
  moduleLabel: string
  // BK-594 — the run's Project: where image uploads are counted until the
  // filing claims them (the filing re-checks it against the run).
  projectId: string
}

// BK-40 Slice 3 — standalone: there is no run to derive context from, so the
// filer picks the module explicitly. `modules` is every active module in the
// current project (the same query/shape `runs/page.tsx` and `atcs/new/page.tsx`
// already use for their own Module pickers).
export interface BugFormDialogStandaloneContext {
  mode: 'standalone'
  projectId: string
  modules: { id: string, name: string }[]
}

export type BugFormDialogContext = BugFormDialogRunLinkedContext | BugFormDialogStandaloneContext;

export interface BugRecord {
  id: string
  [key: string]: unknown
}

interface BugCreateErrorBody {
  error?: { message?: string }
}

interface BugFormDialogProps {
  open: boolean
  onClose: () => void
  onCreated: (bug: BugRecord) => void
  context: BugFormDialogContext
  initialTitle: string
  initialSeverity: BugSeverity
  initialStepsToReproduce: string
  initialEvidenceUrls: string[]
}

export function BugFormDialog({
  open,
  onClose,
  onCreated,
  context,
  initialTitle,
  initialSeverity,
  initialStepsToReproduce,
  initialEvidenceUrls,
}: BugFormDialogProps) {
  const [title, setTitle] = useState(initialTitle);
  const [severity, setSeverity] = useState<BugSeverity>(initialSeverity);
  const [description, setDescription] = useState('');
  const [stepsToReproduce, setStepsToReproduce] = useState(initialStepsToReproduce);
  // BK-594 — links and images in one ordered list (lib/bugs/evidence-draft.ts).
  // The BK-500-filtered step evidence seeds it as links, exactly as before.
  const [evidence, setEvidence] = useState<DraftEvidence[]>(() => initialEvidenceUrls.map((url, i) => ({ kind: 'link', key: `seed-${i}`, url })));
  // One draft per open drawer: the server counts this drawer's uploads on it.
  const [draftId] = useState(() => crypto.randomUUID());
  // Standalone mode only — which module was picked. Unused (and never
  // validated) in run-linked mode, where the module is server-derived.
  const [moduleId, setModuleId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // One Idempotency-Key per payload (BK-667, ADR-0002; BK-594 AC-18): a retry
  // of the SAME filing after a timeout, a network error or a 5xx reuses the
  // key, so the server replays the first defect instead of filing a second
  // one. A changed payload (a corrected retry) gets a new key.
  const lastAttempt = useRef<{ key: string, payload: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const projectId = context.projectId;
  const severityKeysLive = open && context.mode === 'run-linked' && !submitting;

  useEffect(() => {
    if (!severityKeysLive) { return; }
    const onKey = (event: KeyboardEvent) => {
      const index = resolveSeverityShortcut(event);
      if (index === null || isEditableTarget(event.target)) { return; }
      event.preventDefault();
      setSeverity(BUG_SEVERITY_VALUES[index]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [severityKeysLive]);

  if (!open) {
    return null;
  }

  const blocker = submitBlocker(evidence);

  const close = () => {
    if (submitting) { return; }
    // Uploads never filed are discarded now (best effort; the sweep removes any
    // it misses after 3 hours). Not once a filing was attempted: it may still be
    // completing server-side after a client timeout, and a discard winning the
    // row lock would make it fail.
    if (lastAttempt.current === null) {
      for (const id of readyAttachmentIds(evidence)) {
        discardDraftUpload(projectId, id);
      }
    }
    onClose();
  };

  const handleSubmit = async () => {
    if (submitting) { return; }

    // Client-side guards, mirroring handleAbort's short-reason check —
    // immediate feedback ahead of the round trip. The RPC (via
    // BugCreateBodySchema) stays the enforcement point of record.
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < BUG_TITLE_MIN || trimmedTitle.length > BUG_TITLE_MAX) {
      setError(BUG_TITLE_MESSAGE);
      return;
    }
    if (context.mode === 'standalone' && !moduleId) {
      setError('Select a module.');
      return;
    }
    // BK-594 (AC-07, P3) — never file against evidence that has not landed.
    if (blocker) {
      setError(SUBMIT_BLOCKER_MESSAGES[blocker]);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const payload = buildEvidencePayload(evidence);
      const sharedFields = {
        title: trimmedTitle,
        severity,
        description: description.trim() || undefined,
        steps_to_reproduce: stepsToReproduce.trim() || undefined,
        evidence_urls: payload.evidence_urls,
        // Links-only filings send exactly the body they always did (AC-08).
        ...(payload.evidence_attachment_ids.length > 0
          ? { evidence_attachment_ids: payload.evidence_attachment_ids, evidence_order: payload.evidence_order }
          : {}),
      };
      const requestBody = context.mode === 'run-linked'
        ? { run_step_id: context.runStepId, ...sharedFields }
        : { project_id: context.projectId, module_id: moduleId, ...sharedFields };

      const serialized = JSON.stringify(requestBody);
      const attempt = idempotencyKeyFor(lastAttempt.current, serialized, () => crypto.randomUUID());
      lastAttempt.current = attempt;
      const response = await fetch('/api/v1/bugs', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': attempt.key },
        body: serialized,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as BugCreateErrorBody;
        // Server copy rendered verbatim, same convention as handleAbort/
        // handleFinish/handleMarkSubmit.
        setError(body.error?.message ?? 'Could not file this bug.');
        setSubmitting(false);
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { bug?: BugRecord };
      await revalidateAfterBugFiled().catch(() => {});
      setSubmitting(false);
      if (body.bug) {
        onCreated(body.bug);
      }
      onClose();
    }
    catch (err) {
      // Everything typed and every upload stays in the drawer; pressing File
      // again retries the same filing with the same key.
      setError(err instanceof Error ? `${err.message} Nothing was lost: press File bug to retry.` : 'Network error. Nothing was lost: press File bug to retry.');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={close}
    >
      <div
        data-testid="bug-form-modal"
        role="dialog"
        aria-modal="true"
        aria-label={context.mode === 'run-linked' ? 'Report bug' : 'New bug'}
        className="w-full max-w-[480px] rounded-3 border border-stroke-2 bg-surface-1 p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-widest text-fg-1">
          <Bug size={13} />
          {context.mode === 'run-linked' ? 'Report bug' : 'New bug'}
        </div>

        <label htmlFor="bug-title-input" className="mb-1.5 block text-xs text-fg-2">
          Title
        </label>
        <input
          id="bug-title-input"
          data-testid="bug-title-input"
          type="text"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (error) { setError(null); }
          }}
          maxLength={BUG_TITLE_MAX}
          autoFocus
          disabled={submitting}
          className="w-full rounded-2 border border-stroke-2 bg-surface-2 px-2.5 py-2 text-sm text-fg-1 placeholder:text-fg-4 focus:border-accent focus:outline-none"
        />

        <span className="mb-1.5 mt-3 block text-xs text-fg-2">Severity</span>
        <div role="group" aria-label="Severity" className="flex items-center gap-1.5">
          {BUG_SEVERITY_VALUES.map(value => (
            <button
              key={value}
              type="button"
              data-testid={`bug-severity-${value}`}
              aria-pressed={severity === value}
              disabled={submitting}
              onClick={() => setSeverity(value)}
              className={`flex flex-1 items-center justify-center rounded-2 border px-2 py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${
                severity === value
                  ? 'border-accent bg-accent-soft text-fg-0'
                  : 'border-stroke-2 bg-surface-2 text-fg-2 hover:border-stroke-3 hover:text-fg-1'
              }`}
            >
              {value}
              {' · '}
              {BUG_SEVERITY_LABEL[value]}
              {context.mode === 'run-linked' && <span className="kbd ml-1.5">{BUG_SEVERITY_VALUES.indexOf(value) + 1}</span>}
            </button>
          ))}
        </div>

        <label htmlFor="bug-module-input" className="mb-1.5 mt-3 block text-xs text-fg-2">
          Module
        </label>
        {context.mode === 'run-linked'
          ? (
              // Read-only — server-derived from run_step_id (Technical
              // Decision 7), never client-supplied. Shown for the filer's own
              // confidence only; the value is display-only and is never part
              // of the request body.
              <input
                id="bug-module-input"
                data-testid="bug-module-input"
                type="text"
                value={context.moduleLabel}
                readOnly
                disabled
                className="w-full rounded-2 border border-stroke-2 bg-surface-2 px-2.5 py-2 text-sm text-fg-3"
              />
            )
          : (
              // Standalone — no run to derive a module from, so the filer
              // picks one explicitly. Sent as `module_id` in the request body.
              <Select
                id="bug-module-input"
                data-testid="bug-module-input"
                value={moduleId}
                onChange={(e) => {
                  setModuleId(e.target.value);
                  if (error) { setError(null); }
                }}
                disabled={submitting}
                className="w-full"
              >
                <option value="">Select a module…</option>
                {context.modules.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </Select>
            )}

        <label htmlFor="bug-description-input" className="mb-1.5 mt-3 block text-xs text-fg-2">
          Description (optional)
        </label>
        <textarea
          id="bug-description-input"
          data-testid="bug-description-input"
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={2}
          disabled={submitting}
          placeholder="What went wrong?"
          className="w-full resize-none rounded-2 border border-stroke-2 bg-surface-2 px-2.5 py-2 text-sm text-fg-1 placeholder:text-fg-4 focus:border-accent focus:outline-none"
        />

        <label htmlFor="bug-steps-input" className="mb-1.5 mt-3 block text-xs text-fg-2">
          Steps to reproduce
        </label>
        <textarea
          id="bug-steps-input"
          data-testid="bug-steps-input"
          value={stepsToReproduce}
          onChange={e => setStepsToReproduce(e.target.value)}
          rows={3}
          disabled={submitting}
          className="w-full resize-none rounded-2 border border-stroke-2 bg-surface-2 px-2.5 py-2 text-sm text-fg-1 placeholder:text-fg-4 focus:border-accent focus:outline-none"
        />

        <BugEvidenceField
          items={evidence}
          setItems={setEvidence}
          projectId={projectId}
          draftId={draftId}
          disabled={submitting}
          onChange={() => { if (error) { setError(null); } }}
        />

        {error && (
          <p data-testid="bug-form-error" className="m-0 mt-2.5 text-xs text-signal-fail">
            {error}
          </p>
        )}

        <div className="mt-4 flex items-center gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            data-testid="bug-form-submit"
            onClick={() => { void handleSubmit(); }}
            disabled={submitting || blocker === 'uploading'}
          >
            <Bug size={11} />
            {submitting ? 'Filing…' : blocker === 'uploading' ? 'Waiting for uploads…' : 'File bug'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="bug-form-cancel"
            onClick={close}
            disabled={submitting}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
