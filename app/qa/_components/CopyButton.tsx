'use client';

import { Button } from '@components/ui/button';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

/**
 * Tiny client leaf — the only interactive piece of a code block. Shiki runs on
 * the server; this just copies the raw (un-highlighted) source to the clipboard
 * with a 2s Copy→Check confirmation.
 */
export function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={copy}
      aria-label="Copy code"
      className="h-7 w-7 shrink-0 text-fg-2 hover:text-fg-0"
      data-testid="qa-copy-code-button"
    >
      {copied
        ? <Check className="h-3.5 w-3.5 text-signal-pass" />
        : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}
