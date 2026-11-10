'use client';

import type { ChatMention, MentionQuery } from '@lib/chat/mentions';
import type { ChatMember } from '@lib/chat/messages';
import { addPickedMention, detectMentionQuery, filterMentionCandidates, insertMention } from '@lib/chat/mentions';
import { initialsOf } from '@lib/chat/messages';
import { cn } from '@lib/utils';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

// BK-217 — composer textarea with @-mention autocomplete (mockup:
// bk-210-team-chat/chat-panel-workspace.html, `.mention-pop` / `.m-item`).
// Typing "@" opens a compact popover above the field listing ACTIVE workspace
// members (viewers included: write access governs sending, not being
// referenced), filtered as the member keeps typing; Up/Down + Enter (or Tab)
// pick, Esc dismisses. The text keeps a readable "@Name"; the picked member ids
// travel next to the body (`picked`), the same component serves the composer
// and the inline edit box. Autocomplete data is the roster the panel already
// loaded, so a member who left never appears.

interface MentionTextareaProps {
  value: string
  onValueChange: (value: string) => void
  picked: readonly ChatMention[]
  onPickedChange: (picked: ChatMention[]) => void
  members: readonly ChatMember[]
  selfUserId: string
  // Passed straight to the textarea. Called for every key the popover did not
  // consume (so Enter sends, Escape cancels an edit, as before).
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>
  disabled?: boolean
  rows?: number
  autoFocus?: boolean
  placeholder?: string
  ariaLabel: string
  className?: string
  testId: string
}

export function MentionTextarea({
  value,
  onValueChange,
  picked,
  onPickedChange,
  members,
  selfUserId,
  onKeyDown,
  textareaRef,
  disabled,
  rows,
  autoFocus,
  placeholder,
  ariaLabel,
  className,
  testId,
}: MentionTextareaProps) {
  const innerRef = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? innerRef;
  const listId = useId();
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  // "@" index of a query the member dismissed with Esc: stays closed until the
  // caret leaves that mention.
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  const query: MentionQuery | null = useMemo(() => detectMentionQuery(value, caret), [value, caret]);
  const candidates = useMemo(
    () => (query ? filterMentionCandidates(members, query.query) : []),
    [members, query],
  );
  const open = query !== null && dismissedAt !== query.start && candidates.length > 0 && !disabled;

  useEffect(() => { setActive(0); }, [query?.query, query?.start]);
  useEffect(() => {
    if (query === null) { setDismissedAt(null); }
  }, [query]);

  const syncCaret = (el: HTMLTextAreaElement) => {
    setCaret(el.selectionStart ?? el.value.length);
  };

  const pick = (member: ChatMember) => {
    if (!query) { return; }
    const el = ref.current;
    const next = insertMention(value, query, el?.selectionStart ?? caret, member);
    onValueChange(next.value);
    onPickedChange(addPickedMention(picked, { user_id: member.user_id, name: member.display_name }));
    setCaret(next.caret);
    // The picked mention is complete: keep the popover shut until the caret
    // leaves it (its text, "Elena Vargas ", would otherwise still match).
    setDismissedAt(query.start);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(next.caret, next.caret);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (open && !e.nativeEvent.isComposing) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % candidates.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i - 1 + candidates.length) % candidates.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(candidates[active] ?? candidates[0]); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setDismissedAt(query?.start ?? null); return; }
    }
    onKeyDown?.(e);
  };

  return (
    <div className="relative">
      {open && (
        <div
          data-testid="chat_mention_popover"
          className="absolute inset-x-0 bottom-full z-30 mb-1 overflow-hidden rounded-3 border border-stroke-3 bg-surface-3 p-1 shadow-pop"
        >
          <div id={listId} role="listbox" aria-label="Mention a teammate">
            {candidates.map((m, i) => (
              <button
                key={m.user_id}
                id={`${listId}-${i}`}
                type="button"
                role="option"
                aria-selected={i === active}
                data-testid="chat_mention_option"
                tabIndex={-1}
                // Keep the textarea focused: a mousedown would blur it first.
                onMouseDown={e => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(m)}
                className={cn('grid w-full grid-cols-[20px_1fr_auto] items-center gap-3 rounded-2 px-3 py-2 text-left', i === active ? 'bg-surface-5' : 'hover:bg-surface-4')}
              >
                <span aria-hidden="true" className="flex size-5 items-center justify-center rounded-2 border border-stroke-2 bg-surface-3 text-[9px] font-semibold text-fg-1">
                  {initialsOf(m.display_name)}
                </span>
                <span className="truncate text-[13px] font-medium text-fg-0">
                  {m.display_name}
                  {m.user_id === selfUserId && <span className="ml-1 font-normal text-fg-3">(you)</span>}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-fg-3">{m.role}</span>
              </button>
            ))}
          </div>
          <div className="border-t border-stroke-1 px-3 pb-1 pt-1.5 text-[11px] text-fg-3">↑↓ navigate · Enter pick · Esc dismiss</div>
        </div>
      )}
      <textarea
        ref={ref}
        data-testid={testId}
        value={value}
        rows={rows}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          onValueChange(e.target.value);
          syncCaret(e.target);
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={e => syncCaret(e.currentTarget)}
        onClick={e => syncCaret(e.currentTarget)}
        onSelect={e => syncCaret(e.currentTarget)}
        className={className}
      />
    </div>
  );
}
