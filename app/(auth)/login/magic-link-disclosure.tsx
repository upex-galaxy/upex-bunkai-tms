'use client';

import { Button } from '@components/ui/button';
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
      <Button
        type="button"
        size="lg"
        data-testid="login-magic-link-toggle"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        className="w-full justify-center"
      >
        Email me a link instead
        <ChevronDown
          size={14}
          className={`text-fg-3 transition-transform duration-token ease-token ${open ? 'rotate-180' : ''}`}
        />
      </Button>
      {open ? <MagicLinkForm /> : null}
    </div>
  );
}
