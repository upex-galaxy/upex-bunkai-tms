'use client';

import type { ChatMember } from '@lib/chat/messages';
import { cn } from '@lib/utils';
import { useId } from 'react';

// BK-217 — a mention inside a message body (mockup: `.mention` / `.mention.self`
// in bk-210-team-chat/chat-panel-workspace.html). A pill that stands out from
// the text, with a stronger accent fill when the reader IS the mentioned
// member. Hover or keyboard focus shows a small member card (name, role,
// presence). A member who left the workspace renders as a muted "former member"
// pill that opens no card and never breaks the old message.

interface MentionPillProps {
  text: string
  member: ChatMember | undefined
  isSelf: boolean
  online: boolean
}

export function MentionPill({ text, member, isSelf, online }: MentionPillProps) {
  const cardId = useId();

  if (!member) {
    return (
      <span
        data-testid="chat_mention"
        data-former="true"
        title="Former member"
        className="whitespace-nowrap rounded-1 border border-dashed border-stroke-2 px-1 py-px font-mono text-xs font-medium text-fg-3"
      >
        {text}
        <span className="ml-1 font-sans text-[10px] italic">former member</span>
      </span>
    );
  }

  return (
    <span className="group/mention relative inline-block">
      <span
        data-testid="chat_mention"
        data-self={isSelf}
        tabIndex={0}
        aria-describedby={cardId}
        className={cn(
          'whitespace-nowrap rounded-1 border px-1 py-px font-mono text-xs font-medium outline-none focus-visible:ring-1 focus-visible:ring-accent',
          isSelf ? 'border-accent/35 bg-accent-soft text-accent-hi' : 'border-stroke-2 bg-surface-4 text-fg-0',
        )}
      >
        {text}
      </span>
      <span
        id={cardId}
        role="tooltip"
        data-testid="chat_mention_card"
        className="pointer-events-none absolute bottom-full left-0 z-20 mb-1 hidden min-w-40 flex-col gap-0.5 rounded-3 border border-stroke-3 bg-surface-3 px-3 py-2 text-left shadow-pop group-focus-within/mention:flex group-hover/mention:flex"
      >
        <span className="text-[13px] font-semibold text-fg-0">{member.display_name}</span>
        <span className="flex items-center gap-2 text-[11px] text-fg-3">
          <span className="font-mono uppercase">{member.role}</span>
          <span className="flex items-center gap-1">
            <span aria-hidden="true" className={cn('size-1.5 rounded-full', online ? 'bg-pass' : 'bg-fg-4')} />
            {online ? 'Online' : 'Offline'}
          </span>
        </span>
      </span>
    </span>
  );
}
