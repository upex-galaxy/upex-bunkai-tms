'use client';

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { MagicLinkForm } from './magic-link-form';

// Visible secondary fallback: a disclosure that reveals the existing magic-link
// form, keeping password the primary method while magic-link stays one click
// away (AC #9). Client component because it owns the open/closed toggle state.
export function MagicLinkDisclosure() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        data-testid="login-magic-link-toggle"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-2 border border-stroke-2 bg-surface-2 px-3 py-2 text-sm font-medium text-fg-1 transition-colors duration-token ease-token hover:border-stroke-3 hover:bg-surface-3"
      >
        Email me a link instead
        <ChevronDown
          size={14}
          className={`text-fg-3 transition-transform duration-token ease-token ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open ? <MagicLinkForm /> : null}
    </div>
  );
}
