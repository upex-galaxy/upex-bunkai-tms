'use client';

import type { RefObject } from 'react';
import { useEffect, useRef } from 'react';

// Shared Escape-to-close + return-focus-to-trigger + Tab focus-trap behavior
// for hand-built modals (BK-88 Technical Decision 7). `RunnerView.tsx`'s
// existing overlay convention (fixed inset-0 + role="dialog"/"alertdialog" +
// click-outside) only closes via explicit clicks -- this hook is the
// deliberate, narrow addition on top of that baseline, warranted here because
// `RevokeTokenModal` (and Slice B's `IssueTokenModal`, which reveals a
// security-sensitive secret) should not be dismissible by accident without an
// explicit choice, and a keyboard user must not be able to Tab past the
// overlay into the page content behind it.
// Mirrors the mockup's `openOverlay`/`closeOverlay`/`trapFocus` handling
// (settings-tokens.html).
export function useModalDismiss(open: boolean, onClose: () => void, containerRef: RefObject<HTMLElement | null>): void {
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
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }
      const container = containerRef.current;
      if (!container) {
        return;
      }
      // Mirrors the mockup's `trapFocus()`: same focusable-element query and
      // the same `offsetParent !== null` visibility filter (excludes
      // display:none / detached elements), wrapping Tab/Shift+Tab between
      // the first and last focusable element inside the modal.
      const focusable = container.querySelectorAll<HTMLElement>(
        'input:not([hidden]), select, button:not(:disabled)',
      );
      const visible = Array.from(focusable).filter(el => el.offsetParent !== null);
      if (visible.length === 0) {
        return;
      }
      const first = visible[0];
      const last = visible[visible.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
      else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose, containerRef]);
}
