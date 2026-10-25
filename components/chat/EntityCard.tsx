'use client';

import type { EntityCard as EntityCardData, EntityType } from '@lib/chat/entity-refs';
import { ENTITY_TYPE_LABEL, entityCode } from '@lib/chat/entity-refs';
import { ArrowUpRight, FileCheck2, FlaskConical, Lock, SquareTerminal, XCircle } from 'lucide-react';
import Link from 'next/link';

// BK-218 — rich entity card under a chat message (mockup:
// bk-210-team-chat/chat-entity-rich-link.html frames A-E). Resolved cards are a
// single link; restricted / unavailable placeholders share the footprint but are
// inert (dashed, muted, no destination, no leaked metadata).

const TYPE_ICON: Record<EntityType, typeof FileCheck2> = { atc: FileCheck2, test: FlaskConical, run: SquareTerminal };

export function EntityTypeIcon({ type, size = 14, className }: { type: EntityType, size?: number, className?: string }) {
  const Icon = TYPE_ICON[type];
  return <Icon size={size} className={className} aria-hidden="true" />;
}

export function IdChip({ children, inert }: { children: string, inert?: boolean }) {
  return (
    <span className={inert
      ? 'rounded-1 border border-dashed border-stroke-2 px-1 py-px font-mono text-[10px] text-fg-3'
      : 'rounded-1 border border-stroke-2 bg-surface-3 px-1 py-px font-mono text-[10px] text-fg-1'}
    >
      {children}
    </span>
  );
}

const CARD_BASE = 'mt-1.5 block w-full max-w-[316px] rounded-3 border px-3 py-2.5 text-left';

export function EntityCard({ card }: { card: EntityCardData }) {
  if (card.state === 'restricted') {
    return (
      <div
        role="note"
        data-testid="chat_entity_card"
        data-state="restricted"
        aria-label="Restricted reference: you don't have access to this project"
        className={`${CARD_BASE} border-dashed border-stroke-2 bg-signal-skipped-bg`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Lock size={14} className="shrink-0 text-fg-3" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-[13px] italic text-fg-2">Restricted reference</span>
          <span className="status-chip" data-status="skipped">
            <Lock size={10} aria-hidden="true" />
            No access
          </span>
        </span>
        <span className="mt-1 block pl-[22px] text-xs text-fg-3">You don&apos;t have permission to view this project</span>
      </div>
    );
  }

  if (card.state === 'unavailable') {
    const code = entityCode(card.type, card.id);
    const label = ENTITY_TYPE_LABEL[card.type].toLowerCase();
    return (
      <div
        role="note"
        data-testid="chat_entity_card"
        data-state="unavailable"
        aria-label={`${code} is no longer available`}
        className={`${CARD_BASE} border-dashed border-stroke-2 bg-signal-skipped-bg`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <XCircle size={14} className="shrink-0 text-fg-3" aria-hidden="true" />
          <IdChip inert>{code}</IdChip>
          <span className="min-w-0 flex-1 truncate text-[13px] italic text-fg-2">No longer available</span>
        </span>
        <span className="mt-1 block pl-[22px] text-xs text-fg-3">{`The linked ${label} is not available in Bunkai`}</span>
      </div>
    );
  }

  return (
    <Link
      href={card.href}
      data-testid="chat_entity_card"
      data-state="ok"
      data-type={card.type}
      aria-label={`Open ${card.code}, ${card.title}, ${card.status.label}, in ${card.project_name}`}
      className={`${CARD_BASE} group relative border-stroke-2 bg-surface-2 transition-colors hover:border-stroke-3 hover:bg-surface-3 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-accent`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <EntityTypeIcon type={card.type} className="shrink-0 text-fg-3" />
        <IdChip>{card.code}</IdChip>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg-0">{card.title}</span>
        <span className="status-chip" data-status={card.status.tone === 'neutral' ? 'skipped' : card.status.tone}>{card.status.label}</span>
      </span>
      <span className="mt-1 flex min-w-0 items-center gap-2 pl-[22px] pr-4 text-xs text-fg-3">
        <span className="truncate">{card.project_name}</span>
        {card.detail && (
          <>
            <span className="text-fg-4">·</span>
            <span className="truncate font-mono">{card.detail}</span>
          </>
        )}
      </span>
      <ArrowUpRight size={12} className="absolute bottom-2.5 right-3 text-fg-4 opacity-0 group-hover:text-fg-1 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />
    </Link>
  );
}
