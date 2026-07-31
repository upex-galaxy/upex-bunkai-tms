'use client';

import { useEffect, useRef } from 'react';

// Shared Escape-to-close + return-focus-to-trigger behavior for hand-built
// modals (BK-88 Technical Decision 7). `RunnerView.tsx`'s existing overlay
// convention (fixed inset-0 + role="dialog"/"alertdialog" + click-outside)
// only closes via explicit clicks -- this hook is the deliberate, narrow
// addition on top of that baseline, warranted here because `RevokeTokenModal`
// (and Slice B's `IssueTokenModal`, which reveals a security-sensitive
// secret) should not be dismissible by accident without an explicit choice.
// Mirrors the mockup's `openOverlay`/`closeOverlay` focus handling.
export function useModalDismiss(open: boolean, onClose: () => void): void {
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement | null;
      return;
    }
    triggerRef.current?.focus();
    triggerRef.current = null;
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);
}
