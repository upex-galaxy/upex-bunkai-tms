'use client';

import type { StepAttachment } from '@lib/runs/evidence-view';
import { attachmentContentPath, formatByteSize } from '@lib/runs/evidence-view';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect } from 'react';

// BK-593 - full-size view of one evidence image. Plain overlay like the runner's Abort modal
// (no native <dialog>): Escape or a click on the backdrop closes it, the arrow keys move between
// the step's images. The image is the authorized content route (302 to a 60 second signed
// URL), so nothing here stores or shows a storage address.

interface EvidenceLightboxProps {
  attachments: StepAttachment[]
  openId: string
  onSelect: (id: string) => void
  onClose: () => void
}

export function EvidenceLightbox({ attachments, openId, onSelect, onClose }: EvidenceLightboxProps) {
  const index = attachments.findIndex(a => a.id === openId);
  const current = index >= 0 ? attachments[index] : null;
  const previous = index > 0 ? attachments[index - 1] : null;
  const next = index >= 0 && index < attachments.length - 1 ? attachments[index + 1] : null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onClose(); }
      else if (event.key === 'ArrowLeft' && previous) { onSelect(previous.id); }
      else if (event.key === 'ArrowRight' && next) { onSelect(next.id); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previous, next, onSelect, onClose]);

  if (!current) { return null; }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        data-testid="runner-evidence-lightbox"
        role="dialog"
        aria-modal="true"
        aria-label={`Evidence image ${current.filename}`}
        className="flex max-h-full w-full max-w-[960px] flex-col gap-2 rounded-3 border border-stroke-2 bg-surface-1 p-3"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-xs text-fg-1">{current.filename}</span>
          <span className="font-mono text-2xs text-fg-4">{formatByteSize(current.byte_size)}</span>
          <span className="font-mono text-2xs text-fg-4">
            {index + 1}
            {' / '}
            {attachments.length}
          </span>
          <button
            type="button"
            aria-label="Close"
            data-testid="runner-evidence-lightbox-close"
            onClick={onClose}
            className="inline-flex items-center rounded-1 border border-stroke-2 p-1 text-fg-2 hover:border-stroke-3 hover:text-fg-1"
          >
            <X size={12} />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center gap-2">
          <button
            type="button"
            aria-label="Previous image"
            disabled={!previous}
            onClick={() => previous && onSelect(previous.id)}
            className="inline-flex shrink-0 items-center rounded-1 border border-stroke-2 p-1 text-fg-2 hover:border-stroke-3 hover:text-fg-1 disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronLeft size={14} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element -- the source is an authorized redirect, not a static asset next/image can optimise */}
          <img
            key={current.id}
            src={attachmentContentPath(current)}
            alt={current.filename}
            data-testid="runner-evidence-lightbox-image"
            className="max-h-[75vh] min-w-0 max-w-full object-contain"
          />
          <button
            type="button"
            aria-label="Next image"
            disabled={!next}
            onClick={() => next && onSelect(next.id)}
            className="inline-flex shrink-0 items-center rounded-1 border border-stroke-2 p-1 text-fg-2 hover:border-stroke-3 hover:text-fg-1 disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
