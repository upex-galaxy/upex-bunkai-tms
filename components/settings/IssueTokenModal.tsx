'use client';

import type { Capability } from '@lib/api/capabilities';
import type { WorkspaceOption } from '@lib/tokens/view-state';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Label } from '@components/ui/label';
import { ALLOWED_PAT_SCOPES } from '@lib/api/pat';
import { useModalDismiss } from '@lib/hooks/use-modal-dismiss';
import { copySecret } from '@lib/tokens/copy-to-clipboard';
import { formatExpiryChoiceDate } from '@lib/tokens/format';
import { canSubmitIssueForm } from '@lib/tokens/issue-form';
import { AlertTriangle, KeyRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

export interface IssueTokenModalProps {
  open: boolean
  onClose: () => void
  workspaces: WorkspaceOption[]
}

interface IssuedToken {
  token: string
  warning: string
}

interface IssueSuccessBody {
  id: string
  token: string
  name: string | null
  scopes: string[]
  workspace_id: string | null
  expires_at: string | null
  created_at: string
  warning: string
}

interface ApiErrorBody {
  error?: {
    message?: string
  }
}

const SCOPE_DESCRIPTIONS: Record<Capability, string> = {
  'atc:read': 'Read test cases, modules and their history.',
  'atc:write': 'Create and edit test cases and modules.',
  'run:execute': 'Trigger runs and report step results.',
  'workspace:admin': 'Manage workspace settings and members.',
};

const EXPIRY_CHOICES = [30, 90, 365] as const;
const DEFAULT_EXPIRY_CHOICE = '90';

// Settings > Tokens issuance flow (BK-88 Slice B — AC1-AC4, Technical
// Decisions 3/4/6/7). Two-step hand-built dialog, matching
// `RevokeTokenModal`'s overlay convention + the shared `useModalDismiss` hook.
//
// Step 1 (form): validated client-side via `canSubmitIssueForm`; the actual
// 422/403 validation and role-gate already exist server-side (BK-126,
// BK-135/ADR-0005) -- this component only surfaces `error.message` verbatim
// on a non-2xx response.
//
// Step 2 (secret reveal): the raw secret and the server's own `warning` copy
// live ONLY in this component's local state (Decision 6) -- never logged,
// never put in a URL, and wiped by `handleDone`'s reset before the parent's
// `router.refresh()` runs.
export function IssueTokenModal({ open, onClose, workspaces }: IssueTokenModalProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const copyResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<Capability[]>([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [expiryChoice, setExpiryChoice] = useState(DEFAULT_EXPIRY_CHOICE);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [issued, setIssued] = useState<IssuedToken | null>(null);

  const clearCopyResetTimeout = () => {
    if (copyResetTimeoutRef.current) {
      clearTimeout(copyResetTimeoutRef.current);
      copyResetTimeoutRef.current = null;
    }
  };

  // Unmount-only cleanup so a pending "Copied" -> "Copy" revert never fires
  // `setCopied` after this component is gone (React dev-mode warning).
  useEffect(() => clearCopyResetTimeout, []);

  const resetForm = () => {
    clearCopyResetTimeout();
    setName('');
    setScopes([]);
    setWorkspaceId('');
    setExpiryChoice(DEFAULT_EXPIRY_CHOICE);
    setCopied(false);
    setIssued(null);
  };

  const requestClose = () => {
    if (submitting) {
      return;
    }
    resetForm();
    onClose();
  };

  useModalDismiss(open, requestClose, containerRef);

  if (!open) {
    return null;
  }

  const toggleScope = (scope: Capability) => {
    setScopes(prev => (prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]));
  };

  const handleCreate = async () => {
    if (!canSubmitIssueForm({ name, scopes }) || submitting) {
      return;
    }
    setSubmitting(true);

    try {
      const body: { name: string, scopes: Capability[], workspace_id?: string, expires_in_days?: number } = {
        // Mirrors the mockup's `issue-create` handler (settings-tokens.html)
        // -- the input stays raw as the user types it; only the submitted
        // value is normalized to the machine-name convention shown in the
        // hint below the field.
        name: name.trim().toLowerCase().replace(/\s+/g, '-'),
        scopes,
      };
      if (workspaceId) {
        body.workspace_id = workspaceId;
      }
      if (expiryChoice !== 'never') {
        body.expires_in_days = Number(expiryChoice);
      }

      const response = await fetch('/api/v1/tokens', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.status !== 201) {
        const errBody = (await response.json().catch(() => ({}))) as ApiErrorBody;
        // Server copy is rendered verbatim -- this is how AC2/AC3/AC4 surface
        // to the user (the 422/403 logic itself already exists server-side).
        toast.error(errBody.error?.message ?? 'Could not create the token.');
        setSubmitting(false);
        return;
      }

      const created = (await response.json()) as IssueSuccessBody;
      // Only the token string + the server's own warning copy are kept in
      // local state for the Step 2 reveal (Decision 6) -- nothing else from
      // the response is persisted.
      setIssued({ token: created.token, warning: created.warning });
      setSubmitting(false);
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error.');
      setSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!issued) {
      return;
    }
    await copySecret(issued.token);
    clearCopyResetTimeout();
    setCopied(true);
    // Mirrors the mockup's `wireCopy()` (settings-tokens.html) reverting the
    // button back to its original label after 2s.
    copyResetTimeoutRef.current = setTimeout(() => {
      copyResetTimeoutRef.current = null;
      setCopied(false);
    }, 2000);
  };

  const handleDone = () => {
    // Reset FIRST so the secret never lingers in this component's state (or
    // the DOM it renders) once the parent re-renders after `router.refresh()`.
    resetForm();
    onClose();
    router.refresh();
  };

  const canSubmit = canSubmitIssueForm({ name, scopes });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={requestClose}
    >
      <div
        ref={containerRef}
        data-testid="issue-token-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="issue-token-title"
        className="w-full max-w-[480px] rounded-3 border border-stroke-2 bg-surface-1 p-5"
        onClick={e => e.stopPropagation()}
      >
        {!issued
          ? (
              <>
                <div id="issue-token-title" className="mb-4 flex items-center gap-2 text-sm font-semibold text-fg-0">
                  <KeyRound size={14} className="text-fg-3" />
                  New personal access token
                </div>

                <div className="mb-3 flex flex-col gap-1">
                  <Label htmlFor="issue-token-name">Token name</Label>
                  <Input
                    id="issue-token-name"
                    data-testid="issue-token-name"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="ci-deploy"
                    maxLength={40}
                    value={name}
                    onChange={e => setName(e.target.value)}
                    disabled={submitting}
                  />
                  <p className="text-xs text-fg-3">Lowercase and hyphens. Names the machine that will use it.</p>
                </div>

                <fieldset className="mb-3 flex flex-col gap-2 border-0 p-0">
                  <legend className="mb-1 text-2xs font-medium uppercase tracking-wider text-fg-2">
                    Scopes — at least one
                  </legend>
                  {ALLOWED_PAT_SCOPES.map(scope => (
                    <label key={scope} className="flex items-start gap-2 text-sm text-fg-1">
                      <input
                        type="checkbox"
                        data-testid={`issue-token-scope-${scope}`}
                        checked={scopes.includes(scope)}
                        onChange={() => toggleScope(scope)}
                        disabled={submitting}
                        className="mt-0.5"
                      />
                      <span className="flex flex-col">
                        <span className="font-mono text-xs text-fg-0">{scope}</span>
                        <span className="text-xs text-fg-3">{SCOPE_DESCRIPTIONS[scope]}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>

                <div className="mb-3 flex flex-col gap-1">
                  <Label htmlFor="issue-token-workspace">Workspace — optional</Label>
                  <select
                    id="issue-token-workspace"
                    value={workspaceId}
                    onChange={e => setWorkspaceId(e.target.value)}
                    disabled={submitting}
                    className="h-8 rounded-2 border border-stroke-2 bg-surface-2 px-2.5 text-sm text-fg-1 hover:border-stroke-3 focus:border-accent focus:outline-none"
                  >
                    <option value="">All workspaces</option>
                    {workspaces.map(ws => (
                      <option key={ws.id} value={ws.id}>
                        {ws.slug}
                        {' · '}
                        {ws.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-4 flex flex-col gap-1">
                  <Label htmlFor="issue-token-expiry">Expiry — optional</Label>
                  <select
                    id="issue-token-expiry"
                    value={expiryChoice}
                    onChange={e => setExpiryChoice(e.target.value)}
                    disabled={submitting}
                    className="h-8 rounded-2 border border-stroke-2 bg-surface-2 px-2.5 text-sm text-fg-1 hover:border-stroke-3 focus:border-accent focus:outline-none"
                  >
                    {EXPIRY_CHOICES.map(days => (
                      <option key={days} value={days}>
                        {days === 365 ? '1 year' : `${days} days`}
                        {' · '}
                        {formatExpiryChoiceDate(days, new Date())}
                      </option>
                    ))}
                    <option value="never">No expiry</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    data-testid="issue-token-create"
                    onClick={() => { void handleCreate(); }}
                    disabled={!canSubmit || submitting}
                  >
                    {submitting ? 'Creating…' : 'Create token'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={requestClose}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                </div>
              </>
            )
          : (
              <>
                <div id="issue-token-title" className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg-0">
                  <KeyRound size={14} className="text-signal-pass" />
                  Token created
                </div>

                <div
                  role="alert"
                  className="mb-4 flex items-start gap-2 rounded-2 border border-signal-blocked bg-signal-blocked-bg p-3 text-sm text-fg-1"
                >
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-signal-blocked" />
                  <span>{issued.warning}</span>
                </div>

                <div className="mb-2 flex items-center gap-2">
                  <div
                    data-testid="issue-token-secret"
                    className="min-w-0 flex-1 select-all break-all rounded-2 border border-stroke-2 bg-surface-3 px-2.5 py-2 font-mono text-xs text-fg-0"
                  >
                    {issued.token}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    data-testid="issue-token-copy"
                    aria-label="Copy token secret to clipboard"
                    onClick={() => { void handleCopy(); }}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>

                <p aria-live="polite" className="mb-4 text-xs text-fg-3">
                  {copied ? 'Copied to clipboard.' : 'Copy it to your CI vault or password manager before closing.'}
                </p>

                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  data-testid="issue-token-done"
                  onClick={handleDone}
                >
                  Done — I stored it
                </Button>
              </>
            )}
      </div>
    </div>
  );
}
