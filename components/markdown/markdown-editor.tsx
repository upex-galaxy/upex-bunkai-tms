'use client';

import type { SelectionState } from '@lib/markdown/format';
import { MarkdownRenderer } from '@components/markdown/markdown-renderer';
import { byteLength, insertLink, prefixLines, wrapSelection } from '@lib/markdown/format';
import { cn } from '@lib/utils';
import { Bold, Code, Eye, Heading2, Heading3, Italic, Link as LinkIcon, List, ListOrdered } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface MarkdownEditorProps {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  // Hard byte cap (UTF-8). Default 50 KB per the spec; warns at 90%.
  maxBytes?: number
  // Optional character cap (the module mount uses 500). Enforced natively by the
  // textarea so the user cannot type or paste past it.
  maxLength?: number
  rows?: number
  testId?: string
}

// 50 KB decimal (50,000 bytes) per the BK-16 AC5 contract — NOT KiB. Using
// 50 * 1024 let 50,001–51,200-byte payloads through (BK-99) and pushed the 90%
// warning threshold past where QA probes it (BK-100).
const DEFAULT_MAX_BYTES = 50_000;

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  maxBytes = DEFAULT_MAX_BYTES,
  maxLength,
  rows = 8,
  testId = 'markdown-editor',
}: MarkdownEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [pendingSel, setPendingSel] = useState<[number, number] | null>(null);
  // The link popover captures the selection at open time (clicking the toolbar
  // blurs the textarea, but the selection offsets persist on the element).
  const [link, setLink] = useState<{ start: number, end: number } | null>(null);
  const [linkUrl, setLinkUrl] = useState('https://');

  // Restore the caret/selection after a toolbar transform rewrites the value.
  useEffect(() => {
    if (pendingSel && ref.current) {
      ref.current.focus();
      ref.current.setSelectionRange(pendingSel[0], pendingSel[1]);
      setPendingSel(null);
    }
  }, [pendingSel, value]);

  const bytes = byteLength(value);
  const overCap = bytes > maxBytes;
  const nearCap = bytes > maxBytes * 0.9;

  const apply = (fn: (s: SelectionState) => SelectionState): void => {
    const el = ref.current;
    if (!el) { return; }
    const next = fn({ value, selectionStart: el.selectionStart, selectionEnd: el.selectionEnd });
    onChange(next.value);
    setPendingSel([next.selectionStart, next.selectionEnd]);
  };

  const onLink = (): void => {
    const el = ref.current;
    if (!el) { return; }
    setLink({ start: el.selectionStart, end: el.selectionEnd });
    setLinkUrl('https://');
  };

  const confirmLink = (): void => {
    if (link && linkUrl.trim().length > 0) {
      const next = insertLink({ value, selectionStart: link.start, selectionEnd: link.end }, linkUrl.trim());
      onChange(next.value);
      setPendingSel([next.selectionStart, next.selectionEnd]);
    }
    setLink(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (!(e.metaKey || e.ctrlKey)) { return; }
    const key = e.key.toLowerCase();
    if (key === 'b') { e.preventDefault(); apply(s => wrapSelection(s, '**', '**')); }
    else if (key === 'i') { e.preventDefault(); apply(s => wrapSelection(s, '*', '*')); }
    else if (key === 'k') {
      // BK-398 — Cmd/Ctrl+K is also the global Command Palette's chord
      // (`CommandPalette.tsx`, `window`-level listener). This editor owns
      // the chord locally for insert-link, so it must stop the keystroke
      // from bubbling to `window`, or a member linking text here would get
      // BOTH the link affordance and the palette on top of it (comment
      // 12407 (f) — "a member writing a bug repro who presses Cmd+K for a
      // link currently gets the link affordance AND the palette"). The
      // scoped exception is implemented here, by the owning component, per
      // the ruling — never as a hardcoded component list inside the palette.
      e.preventDefault();
      e.stopPropagation();
      onLink();
    }
  };

  const tools: { key: string, title: string, icon: React.ReactNode, run: () => void }[] = [
    { key: 'bold', title: 'Bold (Cmd/Ctrl+B)', icon: <Bold size={13} />, run: () => apply(s => wrapSelection(s, '**', '**')) },
    { key: 'italic', title: 'Italic (Cmd/Ctrl+I)', icon: <Italic size={13} />, run: () => apply(s => wrapSelection(s, '*', '*')) },
    { key: 'code', title: 'Inline code', icon: <Code size={13} />, run: () => apply(s => wrapSelection(s, '`', '`')) },
    { key: 'link', title: 'Link (Cmd/Ctrl+K)', icon: <LinkIcon size={13} />, run: onLink },
    { key: 'ul', title: 'Bulleted list', icon: <List size={13} />, run: () => apply(s => prefixLines(s, '- ')) },
    { key: 'ol', title: 'Numbered list', icon: <ListOrdered size={13} />, run: () => apply(s => prefixLines(s, i => `${i + 1}. `)) },
    { key: 'h2', title: 'Heading 2', icon: <Heading2 size={13} />, run: () => apply(s => prefixLines(s, '## ')) },
    { key: 'h3', title: 'Heading 3', icon: <Heading3 size={13} />, run: () => apply(s => prefixLines(s, '### ')) },
  ];

  return (
    <div data-testid={testId} className="rounded-2 border border-stroke-2 bg-surface-2">
      <div className="flex items-center gap-0.5 border-b border-stroke-2 px-1.5 py-1">
        {tools.map(t => (
          <button
            key={t.key}
            type="button"
            data-testid={`md-tool-${t.key}`}
            title={t.title}
            onClick={t.run}
            disabled={showPreview}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-1 text-fg-3',
              showPreview ? 'cursor-not-allowed opacity-40' : 'hover:bg-surface-3 hover:text-fg-1',
            )}
          >
            {t.icon}
          </button>
        ))}
        <button
          type="button"
          data-testid="md-tool-preview"
          title={showPreview ? 'Edit' : 'Preview'}
          onClick={() => setShowPreview(p => !p)}
          className={cn(
            'ml-auto flex h-6 items-center gap-1 rounded-1 px-1.5 text-xs',
            showPreview ? 'bg-surface-3 text-fg-1' : 'text-fg-3 hover:bg-surface-3 hover:text-fg-1',
          )}
        >
          <Eye size={13} />
          {showPreview ? 'Editing' : 'Preview'}
        </button>
      </div>

      {link && (
        <div className="flex items-center gap-1.5 border-b border-stroke-2 px-2 py-1.5">
          <input
            autoFocus
            data-testid="md-link-url"
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); confirmLink(); }
              if (e.key === 'Escape') { setLink(null); }
            }}
            placeholder="https://example.com"
            className="h-7 flex-1 rounded-1 border border-stroke-2 bg-surface-3 px-2 text-xs text-fg-1 focus-visible:border-accent focus-visible:outline-none"
          />
          <button
            type="button"
            data-testid="md-link-insert"
            onClick={confirmLink}
            className="h-7 rounded-1 bg-surface-3 px-2 text-xs text-fg-1 hover:bg-surface-1"
          >
            Insert
          </button>
          <button
            type="button"
            data-testid="md-link-cancel"
            onClick={() => setLink(null)}
            className="h-7 rounded-1 px-2 text-xs text-fg-3 hover:text-fg-1"
          >
            Cancel
          </button>
        </div>
      )}

      {showPreview
        ? (
            <div data-testid="markdown-preview" className="min-h-[6rem] px-2.5 py-2">
              {value.trim().length > 0
                ? <MarkdownRenderer content={value} />
                : <span className="text-xs text-fg-4">Nothing to preview yet.</span>}
            </div>
          )
        : (
            <textarea
              ref={ref}
              data-testid={`${testId}-textarea`}
              value={value}
              onChange={e => onChange(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              rows={rows}
              maxLength={maxLength}
              className="block w-full resize-y bg-transparent px-2.5 py-2 font-mono text-sm text-fg-1 placeholder:text-fg-4 focus-visible:outline-none"
            />
          )}

      <div className="flex items-center justify-between border-t border-stroke-2 px-2.5 py-1 text-xs">
        <span className="text-fg-4">Markdown supported</span>
        <span
          data-testid="markdown-size"
          className={cn('font-mono', overCap ? 'text-signal-fail' : nearCap ? 'text-signal-blocked' : 'text-fg-4')}
        >
          {maxLength
            ? `${value.length}/${maxLength}`
            : `${(bytes / 1000).toFixed(1)} KB`}
        </span>
      </div>

      {overCap && !maxLength && (
        <p className="px-2.5 pb-1.5 text-xs text-signal-fail" data-testid="markdown-size-error">
          The description exceeds the maximum size of
          {' '}
          {Math.round(maxBytes / 1000)}
          {' '}
          KB.
        </p>
      )}
    </div>
  );
}
