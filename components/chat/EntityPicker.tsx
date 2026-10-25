'use client';

import type { EntitySearchItem } from '@lib/chat/entity-refs';
import { ENTITY_TYPE_LABEL } from '@lib/chat/entity-refs';
import { Link2, Search } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { EntityTypeIcon, IdChip } from './EntityCard';

// BK-218 — composer entity picker (mockup frame 02). Search ATCs / Tests / Runs,
// arrow keys move, Enter inserts, Escape dismisses. Results come from the
// permission-bound search endpoint, so inaccessible entities never appear.

interface EntityPickerProps {
  searchUrl: string
  onPick: (item: EntitySearchItem) => void
  onClose: () => void
}

const DEBOUNCE_MS = 200;

export function EntityPicker({ searchUrl, onPick, onClose }: EntityPickerProps) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<EntitySearchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(`${searchUrl}?q=${encodeURIComponent(q)}`);
          if (!response.ok) { throw new Error('search failed'); }
          const body = await response.json() as { items: EntitySearchItem[] };
          if (cancelled) { return; }
          setItems(body.items);
          setFailed(false);
          setActive(0);
        }
        catch {
          if (!cancelled) { setFailed(true); setItems([]); }
        }
        if (!cancelled) { setLoading(false); }
      })();
    }, DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [q, searchUrl]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, Math.max(items.length - 1, 0))); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); return; }
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      const item = items[active];
      if (item) { onPick(item); }
    }
  };

  return (
    <div data-testid="chat_entity_picker" className="absolute inset-x-4 bottom-full z-30 mb-1 overflow-hidden rounded-3 border border-stroke-3 bg-surface-3">
      <div className="flex items-center gap-2 px-3 pb-1 pt-2.5 font-mono text-[10px] uppercase tracking-wider text-fg-3">
        <Link2 size={11} aria-hidden="true" />
        Insert reference
      </div>
      <div className="relative px-2 py-1.5">
        <Search size={12} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-fg-3" aria-hidden="true" />
        <input
          ref={inputRef}
          data-testid="chat_entity_search"
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={items[active] ? `${listId}-${active}` : undefined}
          aria-label="Search ATC, Test, and Run references"
          placeholder="Search by title or id"
          className="w-full rounded-2 border border-stroke-2 bg-surface-2 py-1.5 pl-7 pr-2 font-mono text-[13px] text-fg-0 placeholder:text-fg-3 focus-visible:border-accent focus-visible:outline-none"
        />
      </div>
      <div id={listId} role="listbox" aria-label="Insert an entity reference" className="max-h-[220px] overflow-y-auto p-1">
        {items.map((item, i) => (
          <button
            key={`${item.type}:${item.id}`}
            id={`${listId}-${i}`}
            type="button"
            role="option"
            aria-selected={i === active}
            data-testid="chat_entity_option"
            tabIndex={-1}
            onMouseEnter={() => setActive(i)}
            onClick={() => onPick(item)}
            className={`grid w-full grid-cols-[16px_auto_1fr_auto] items-center gap-3 rounded-2 px-3 py-2 text-left ${i === active ? 'bg-surface-5' : 'hover:bg-surface-4'}`}
          >
            <EntityTypeIcon type={item.type} className="text-fg-3" />
            <IdChip>{item.code}</IdChip>
            <span className="truncate text-[13px] font-medium text-fg-0">{item.title}</span>
            <span className="text-[10px] uppercase tracking-wide text-fg-3">{ENTITY_TYPE_LABEL[item.type]}</span>
          </button>
        ))}
      </div>
      {!loading && !failed && items.length === 0 && (
        <div data-testid="chat_entity_empty" className="px-4 py-2 text-xs italic text-fg-3">No ATC, Test, or Run matches this search</div>
      )}
      {failed && <div role="alert" className="px-4 py-2 text-xs text-fail">Search is unavailable right now.</div>}
      <div className="flex gap-3 border-t border-stroke-1 px-4 py-2 text-[11px] text-fg-3">
        <span>↑↓ navigate · Enter insert · Esc dismiss</span>
      </div>
    </div>
  );
}
