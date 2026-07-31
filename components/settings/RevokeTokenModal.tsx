'use client';

import { Button } from '@components/ui/button';
import { useModalDismiss } from '@lib/hooks/use-modal-dismiss';
import { AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

export interface RevokeTokenTarget {
  id: string
  name: string
  prefix: string
}

interface RevokeTokenModalProps {
  token: RevokeTokenTarget | null
  onClose: () => void
}

interface ApiErrorBody {
  error?: {
    message?: string
  }
}

// Settings > Tokens revoke confirmation (BK-88 Slice A — AC7, PO/UX Decision
// 2). Single-step `alertdialog`, copy verbatim from the mockup's
// `#revoke-overlay`. Hand-built overlay matching `RunnerView.tsx`'s existing
// modal convention (Decision 7), plus the shared `useModalDismiss` hook that
// convention doesn't have yet (Escape-to-close + return focus to the row's
// Revoke button).
export function RevokeTokenModal({ token, onClose }: RevokeTokenModalProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const open = token !== null;

  const requestClose = () => {
    if (!submitting) {
      onClose();
    }
  };

  useModalDismiss(open, requestClose);

  if (!token) {
    return null;
  }

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const response = await fetch(`/api/v1/tokens/${token.id}`, { method: 'DELETE' });

      if (response.status === 204) {
        toast.success('Token revoked');
        onClose();
        // Soft refresh (not a browser navigation/reload) re-runs the page's
        // server component so the row flips to revoked without a full page
        // reload -- AC7's "updates immediately" requirement.
        router.refresh();
        return;
      }

      const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
      // Server copy is rendered verbatim, matching StartRunButton's convention.
      toast.error(body.error?.message ?? 'Could not revoke the token.');
      onClose();
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error.');
      onClose();
    }
    finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={requestClose}
    >
      <div
        data-testid="revoke-token-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="revoke-token-title"
        aria-describedby="revoke-token-desc"
        className="w-full max-w-[440px] rounded-3 border border-stroke-2 bg-surface-1 p-5"
        onClick={e => e.stopPropagation()}
      >
        <div
          id="revoke-token-title"
          className="mb-3 flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-widest text-signal-fail"
        >
          <AlertTriangle size={13} />
          Revoke token
        </div>

        <p id="revoke-token-desc" className="m-0 text-sm text-fg-1">
          You are about to revoke
          {' '}
          <span className="font-mono text-fg-0">{token.name}</span>
          {' '}
          (
          <span className="font-mono text-fg-0">{token.prefix}</span>
          ). Any CLI or CI job using it will stop authenticating immediately. This cannot be undone — issue a new token instead.
        </p>

        <div className="mt-4 flex items-center gap-2">
          <Button
            type="button"
            variant="danger"
            size="sm"
            data-testid="revoke-token-confirm"
            onClick={() => { void handleConfirm(); }}
            disabled={submitting}
          >
            {submitting ? 'Revoking…' : `Revoke ${token.name}`}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="revoke-token-cancel"
            onClick={requestClose}
            disabled={submitting}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
