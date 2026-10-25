'use client';

import type { EntityCard as EntityCardData, EntitySearchItem } from '@lib/chat/entity-refs';
import type { ChatMember, ChatMessage, ChatRole } from '@lib/chat/messages';
import type { RealtimeConnectionStatus } from '@lib/runs/realtime-run-channel';
import {
  buildEntityReference,
  distinctRefs,
  insertAtCaret,
  parseBodySegments,
  refKey,
  textWithoutRefs,
} from '@lib/chat/entity-refs';
import {
  buildChatChannelConfig,
  canWriteChat,
  CHAT_MESSAGE_MAX_LENGTH,
  continuesPrevious,
  displayNameFromEmail,
  firstUnreadIndex,
  initialsOf,
  isNewDay,
  lastSeq,
  mergeMessages,
  seenStorageKey,
  validateMessageBody,
} from '@lib/chat/messages';
import { shouldReconcileOnStatusChange } from '@lib/runs/realtime-run-channel';
import { createClient } from '@lib/supabase/client';
import { APP_URLS } from '@lib/urls';
import { cn } from '@lib/utils';
import { Hash, Link2, Loader2, Lock, SendHorizontal, Users, WifiOff, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { EntityCard } from './EntityCard';
import { EntityPicker } from './EntityPicker';

// BK-215 — Team Chat, workspace general channel (mockup:
// bk-210-team-chat/chat-panel-workspace.html, master-design-plan §4.14).
// Header (channel + live status + roster toggle + close), newest-at-bottom
// message list with scroll-up history, composer pinned to the bottom, roster
// flyout with role + presence. Decisions: messages via the REST API (RLS on the
// caller's client), live delivery via Realtime postgres_changes, reconnect
// catch-up via `after_seq`, presence via Realtime Presence, unread separator
// from a per-member last-seen seq kept in localStorage.

interface ChatItem extends ChatMessage {
  author_name?: string
}

interface ChatPanelProps {
  workspaceId: string
  userId: string
  role: ChatRole | null
  open: boolean
  onClose: () => void
  onUnreadChange: (count: number) => void
}

type LiveState = 'connecting' | 'live' | 'offline';

const SCROLL_STICK_PX = 48;

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  const base = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  if (d.toDateString() === today.toDateString()) { return `Today · ${base}`; }
  if (d.toDateString() === yesterday.toDateString()) { return `Yesterday · ${base}`; }
  return base;
}

async function apiJson<T>(input: string, init?: RequestInit): Promise<{ ok: true, data: T } | { ok: false, message: string }> {
  try {
    const response = await fetch(input, init);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, message: (body as { error?: { message?: string } }).error?.message ?? 'Something went wrong.' };
    }
    return { ok: true, data: body as T };
  }
  catch {
    return { ok: false, message: 'You appear to be offline.' };
  }
}

export function ChatPanel({ workspaceId, userId, role, open, onClose, onUnreadChange }: ChatPanelProps) {
  const writable = canWriteChat(role);
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [online, setOnline] = useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [live, setLive] = useState<LiveState>('connecting');
  const [rosterOpen, setRosterOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [lastSeen, setLastSeen] = useState(0);
  const [separatorSeq, setSeparatorSeq] = useState<number | null>(null);
  const [pendingBelow, setPendingBelow] = useState(0);
  // BK-218 — resolved entity cards keyed `{type}:{id}`; `failedRefs` fall back to
  // the plain link. Cleared each time the panel opens so a re-render shows the
  // latest state (cards are never live-updated while mounted).
  const [cards, setCards] = useState<ReadonlyMap<string, EntityCardData>>(new Map());
  const [failedRefs, setFailedRefs] = useState<ReadonlySet<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const inFlightRefs = useRef<Set<string>>(new Set());

  const listRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<ChatItem[]>([]);
  const stickRef = useRef(true);
  const prependAnchorRef = useRef<number | null>(null);
  const membersRef = useRef<ChatMember[]>([]);
  const lastSeenLoaded = useRef(false);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { membersRef.current = members; }, [members]);

  const config = useMemo(() => buildChatChannelConfig(workspaceId), [workspaceId]);
  const base = `/api/v1/workspaces/${workspaceId}/chat`;

  const allowedOrigins = useMemo(
    () => [...Object.values(APP_URLS), ...(typeof window === 'undefined' ? [] : [window.location.origin])],
    [],
  );
  const segmentsById = useMemo(
    () => new Map(messages.map(m => [m.id, parseBodySegments(m.body, allowedOrigins)])),
    [messages, allowedOrigins],
  );

  useEffect(() => {
    if (open) {
      setCards(new Map());
      setFailedRefs(new Set());
      inFlightRefs.current.clear();
    }
  }, [open]);

  // Resolve every not-yet-known reference of the loaded messages in one call.
  useEffect(() => {
    if (!open || loading) { return; }
    const wanted = [...segmentsById.values()].flatMap(distinctRefs).filter((r, i, all) => all.findIndex(x => refKey(x) === refKey(r)) === i).filter(r => !cards.has(refKey(r)) && !failedRefs.has(refKey(r)) && !inFlightRefs.current.has(refKey(r)));
    if (wanted.length === 0) { return; }
    for (let i = 0; i < wanted.length; i += 20) {
      const batch = wanted.slice(i, i + 20);
      for (const r of batch) { inFlightRefs.current.add(refKey(r)); }
      void (async () => {
        const res = await apiJson<{ cards: Record<string, EntityCardData> }>(`${base}/entities/resolve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refs: batch.map(r => ({ type: r.type, id: r.id, project_slug: r.projectSlug })) }),
        });
        for (const r of batch) { inFlightRefs.current.delete(refKey(r)); }
        if (res.ok) {
          setCards(prev => new Map([...prev, ...Object.entries(res.data.cards)]));
        }
        else {
          setFailedRefs(prev => new Set([...prev, ...batch.map(refKey)]));
        }
      })();
    }
  }, [segmentsById, cards, failedRefs, open, loading, base]);

  const insertReference = (item: EntitySearchItem) => {
    const url = buildEntityReference({ type: item.type, id: item.id, projectSlug: item.project_slug }, window.location.origin);
    const el = composerRef.current;
    const caret = el?.selectionStart ?? draft.length;
    const next = insertAtCaret(draft, caret, url);
    setDraft(next.value);
    setSendError(null);
    setPickerOpen(false);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(next.caret, next.caret);
    });
  };

  const nameOf = (m: ChatItem): string => {
    const member = members.find(x => x.user_id === m.author_user_id);
    return member?.display_name ?? m.author_name ?? displayNameFromEmail(null);
  };

  const loadRoster = useCallback(async () => {
    const res = await apiJson<{ members: ChatMember[] }>(`${base}/roster`);
    if (res.ok) { setMembers(res.data.members); }
  }, [base]);

  // Initial load: roster + newest page. Last-seen is read before painting so
  // the separator is computed against what the member had actually seen.
  useEffect(() => {
    let cancelled = false;
    const stored = Number(window.localStorage.getItem(seenStorageKey(workspaceId, userId)) ?? '0');
    setLastSeen(Number.isFinite(stored) ? stored : 0);
    lastSeenLoaded.current = true;
    void (async () => {
      setLoading(true);
      setLoadError(null);
      const [, page] = await Promise.all([
        loadRoster(),
        apiJson<{ items: ChatItem[], has_more: boolean }>(`${base}/messages`),
      ]);
      if (cancelled) { return; }
      if (page.ok) {
        messagesRef.current = page.data.items;
        setMessages(page.data.items);
        setHasMore(page.data.has_more);
      }
      else {
        setLoadError(page.message);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [workspaceId, userId, base, loadRoster]);

  // Catch up everything newer than the last message we hold (reconnect, tab
  // wake). Loops while the server reports more than its 200 cap.
  const catchUp = useCallback(async () => {
    for (let i = 0; i < 10; i++) {
      const after = lastSeq(messagesRef.current);
      const res = await apiJson<{ items: ChatItem[], has_more: boolean }>(`${base}/messages?after_seq=${after}`);
      if (!res.ok) { return; }
      const incoming = res.data.items;
      if (incoming.length > 0) {
        const merged = mergeMessages(messagesRef.current, incoming);
        messagesRef.current = merged;
        setMessages(merged);
      }
      if (!res.data.has_more || incoming.length === 0) { return; }
    }
  }, [base]);

  // Realtime: new messages + reconnect reconciliation.
  useEffect(() => {
    const supabase = createClient();
    let prev: RealtimeConnectionStatus | null = null;
    const channel = supabase.channel(config.channelName);
    channel.on<Record<string, unknown>>(
      'postgres_changes',
      { event: config.binding.event, schema: config.binding.schema, table: config.binding.table, filter: config.binding.filter },
      (payload) => {
        const row = payload.new as unknown as ChatMessage;
        if (!row?.id) { return; }
        if (row.author_user_id && !membersRef.current.some(m => m.user_id === row.author_user_id)) {
          void loadRoster();
        }
        const merged = mergeMessages(messagesRef.current, [row]);
        if (merged === messagesRef.current) { return; }
        messagesRef.current = merged;
        setMessages(merged);
        if (!stickRef.current && row.author_user_id !== userId) { setPendingBelow(n => n + 1); }
      },
    );
    channel.subscribe((status) => {
      const next = String(status) as RealtimeConnectionStatus;
      setLive(next === 'SUBSCRIBED' ? 'live' : 'offline');
      if (shouldReconcileOnStatusChange(prev, next)) { void catchUp(); }
      prev = next;
    });

    const onOnline = () => { void catchUp(); };
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
      void supabase.removeChannel(channel);
    };
  }, [config, catchUp, loadRoster, userId]);

  // Presence: who is online right now (client-side, no DB writes).
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(config.presenceChannelName, { config: { presence: { key: userId } } });
    channel.on('presence', { event: 'sync' }, () => {
      setOnline(new Set(Object.keys(channel.presenceState())));
    });
    channel.subscribe((status) => {
      if (String(status) === 'SUBSCRIBED') { void channel.track({ online_at: new Date().toISOString() }); }
    });
    return () => { void supabase.removeChannel(channel); };
  }, [config, userId]);

  // Freeze the unread separator at the moment the panel opens; clear on close.
  useEffect(() => {
    if (!open || loading) { setSeparatorSeq(null); return; }
    const idx = firstUnreadIndex(messagesRef.current, lastSeen, userId);
    setSeparatorSeq(idx >= 0 ? messagesRef.current[idx].seq : null);
    // Deliberately only on open / first history arrival, not on every message.
  }, [open, loading]);

  // Seen = newest message while the panel is open and the reader is at the bottom.
  const newest = lastSeq(messages);
  useEffect(() => {
    if (!lastSeenLoaded.current || loading) { return; }
    if (open && stickRef.current && newest > lastSeen) {
      setLastSeen(newest);
      window.localStorage.setItem(seenStorageKey(workspaceId, userId), String(newest));
    }
  }, [open, newest, loading, lastSeen, workspaceId, userId]);

  useEffect(() => {
    if (loading) { return; }
    const unread = messages.filter(m => m.seq > lastSeen && m.author_user_id !== userId).length;
    onUnreadChange(open && stickRef.current ? 0 : unread);
  }, [messages, lastSeen, open, loading, userId, onUnreadChange]);

  // Scroll management: stick to the bottom unless the reader scrolled up; keep
  // the viewport anchored when older history is prepended.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) { return; }
    if (prependAnchorRef.current !== null) {
      el.scrollTop = el.scrollHeight - prependAnchorRef.current;
      prependAnchorRef.current = null;
      return;
    }
    if (stickRef.current) { el.scrollTop = el.scrollHeight; }
  }, [messages, open, loading]);

  const loadOlder = useCallback(async () => {
    const first = messagesRef.current[0];
    if (!first || loadingOlder) { return; }
    setLoadingOlder(true);
    const res = await apiJson<{ items: ChatItem[], has_more: boolean }>(`${base}/messages?before_seq=${first.seq}`);
    if (res.ok && res.data.items.length > 0) {
      const el = listRef.current;
      prependAnchorRef.current = el ? el.scrollHeight - el.scrollTop : null;
      const merged = mergeMessages(messagesRef.current, res.data.items);
      messagesRef.current = merged;
      setMessages(merged);
      setHasMore(res.data.has_more);
    }
    else if (res.ok) {
      setHasMore(false);
    }
    setLoadingOlder(false);
  }, [base, loadingOlder]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) { return; }
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_STICK_PX;
    stickRef.current = atBottom;
    if (atBottom) { setPendingBelow(0); }
    if (el.scrollTop < 40 && hasMore && !loadingOlder) { void loadOlder(); }
  };

  const jumpToLatest = () => {
    const el = listRef.current;
    if (el) { el.scrollTop = el.scrollHeight; }
    stickRef.current = true;
    setPendingBelow(0);
  };

  const send = async () => {
    if (!writable || sending) { return; }
    const check = validateMessageBody(draft);
    if (!check.ok) {
      setSendError(check.reason === 'empty' ? 'Write something first.' : `Messages are limited to ${CHAT_MESSAGE_MAX_LENGTH} characters.`);
      return;
    }
    setSending(true);
    setSendError(null);
    const res = await apiJson<ChatItem>(`${base}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: check.body }),
    });
    setSending(false);
    if (!res.ok) { setSendError(res.message); return; }
    setDraft('');
    stickRef.current = true;
    const merged = mergeMessages(messagesRef.current, [res.data]);
    messagesRef.current = merged;
    setMessages(merged);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  const overLimit = draft.trim().length > CHAT_MESSAGE_MAX_LENGTH;

  return (
    <section data-testid="chat_panel" aria-label="Team chat panel" className="relative flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-stroke-1 px-4 py-3">
        <Hash size={14} className="text-fg-3" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-fg-0">general</h2>
        <span className="text-xs text-fg-3">Workspace</span>
        <span
          data-testid="chat_live_chip"
          data-state={live}
          className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-fg-3"
        >
          <span className={cn('size-1.5 rounded-full', live === 'live' ? 'bg-pass' : live === 'offline' ? 'bg-blocked' : 'bg-fg-4')} />
          {live === 'live' ? 'Live' : live === 'offline' ? 'Offline' : 'Connecting'}
        </span>
        <button
          type="button"
          data-testid="chat_roster_toggle"
          aria-expanded={rosterOpen}
          aria-controls="chat-roster"
          onClick={() => setRosterOpen(v => !v)}
          className="inline-flex items-center gap-1 rounded-2 border border-stroke-2 bg-surface-2 px-2 py-1 text-xs text-fg-1 hover:bg-surface-3"
        >
          <Users size={12} aria-hidden="true" />
          {members.length}
        </button>
        <button
          type="button"
          data-testid="chat_close"
          aria-label="Close chat panel"
          onClick={onClose}
          className="inline-flex size-6 items-center justify-center rounded-2 text-fg-3 hover:bg-surface-2 hover:text-fg-1"
        >
          <X size={14} />
        </button>
      </header>

      {live === 'offline' && (
        <div data-testid="chat_offline_banner" role="status" aria-live="polite" className="flex items-center gap-2 border-b border-blocked/40 bg-surface-3 px-4 py-2 text-xs text-blocked">
          <WifiOff size={12} aria-hidden="true" />
          Connection lost. Reconnecting — missed messages will appear automatically.
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <div ref={listRef} onScroll={onScroll} data-testid="chat_message_list" aria-live="polite" className="h-full overflow-y-auto py-2">
          {loadingOlder && (
            <div data-testid="chat_loading_older" className="flex items-center justify-center gap-2 py-2 text-xs text-fg-3">
              <Loader2 size={12} className="animate-spin" aria-hidden="true" />
              Loading earlier messages
            </div>
          )}
          {loading && (
            <div data-testid="chat_skeleton" aria-hidden="true" className="flex flex-col gap-4 p-4">
              {[0, 1, 2].map(i => (
                <div key={i} className="flex flex-col gap-1.5">
                  <div className="h-3 w-1/3 animate-status-pulse rounded-1 bg-surface-3" />
                  <div className="h-3 w-3/4 animate-status-pulse rounded-1 bg-surface-3" />
                </div>
              ))}
            </div>
          )}
          {!loading && loadError && (
            <div data-testid="chat_error" className="flex flex-col items-start gap-2 p-4">
              <p className="m-0 text-sm text-fg-2">{loadError}</p>
            </div>
          )}
          {!loading && !loadError && messages.length === 0 && (
            <div data-testid="chat_empty" className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <Hash size={18} className="text-fg-3" aria-hidden="true" />
              <span className="text-sm font-semibold text-fg-1">No messages yet</span>
              <span className="max-w-[32ch] text-xs text-fg-3">
                {writable ? 'Say hello — start the conversation with your workspace.' : 'Messages from your workspace will show up here.'}
              </span>
            </div>
          )}
          {!loading && messages.map((m, i) => {
            const prev = messages[i - 1];
            const cont = continuesPrevious(prev, m);
            const own = m.author_user_id === userId;
            const name = nameOf(m);
            return (
              <div key={m.id}>
                {isNewDay(prev, m) && (
                  <div className="flex items-center gap-3 px-4 py-3" data-testid="chat_day_divider">
                    <span className="h-px flex-1 bg-stroke-1" />
                    <span className="font-mono text-[10px] uppercase tracking-wider text-fg-3">{dayLabel(m.created_at)}</span>
                    <span className="h-px flex-1 bg-stroke-1" />
                  </div>
                )}
                {separatorSeq === m.seq && (
                  <div data-testid="chat_unread_separator" className="flex items-center gap-3 px-4 py-1.5">
                    <span className="h-px flex-1 bg-accent/60" />
                    <span className="font-mono text-[10px] uppercase tracking-wider text-accent-hi">New messages</span>
                    <span className="h-px flex-1 bg-accent/60" />
                  </div>
                )}
                <article data-testid="chat_message" data-own={own} data-seq={m.seq} className={cn('flex gap-3 px-4 hover:bg-surface-2/50', cont ? 'py-0.5' : 'pb-0.5 pt-2')}>
                  {cont
                    ? <span className="w-7 shrink-0" aria-hidden="true" />
                    : (
                        <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-2 border border-stroke-2 bg-surface-3 text-[10px] font-semibold text-fg-1">
                          {initialsOf(name)}
                        </span>
                      )}
                  <div className="min-w-0 flex-1">
                    {!cont && (
                      <div className="flex items-baseline gap-2">
                        <span className="truncate text-[13px] font-semibold text-fg-0">{name}</span>
                        {own && <span className="rounded-1 bg-surface-3 px-1 text-[10px] text-fg-3">you</span>}
                        <time dateTime={m.created_at} className="font-mono text-[10px] text-fg-3">{timeLabel(m.created_at)}</time>
                      </div>
                    )}
                    {(() => {
                      const segments = segmentsById.get(m.id) ?? [];
                      const refs = segments.filter(sg => sg.kind === 'ref');
                      const text = refs.length > 0 ? textWithoutRefs(segments) : m.body;
                      return (
                        <>
                          {text.length > 0 && <p className="m-0 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-fg-1">{text}</p>}
                          {refs.map((sg, idx) => {
                            const key = refKey(sg.ref);
                            const card = cards.get(key);
                            if (card) { return <EntityCard key={`${key}-${idx}`} card={card} />; }
                            if (failedRefs.has(key)) {
                              return <a key={`${key}-${idx}`} href={sg.raw} className="mt-1 block break-all text-[13px] text-accent-hi underline">{sg.raw}</a>;
                            }
                            return <div key={`${key}-${idx}`} data-testid="chat_entity_loading" aria-hidden="true" className="mt-1.5 h-[52px] w-full max-w-[316px] animate-status-pulse rounded-3 border border-stroke-2 bg-surface-2" />;
                          })}
                        </>
                      );
                    })()}
                  </div>
                </article>
              </div>
            );
          })}
        </div>

        {pendingBelow > 0 && (
          <button
            type="button"
            data-testid="chat_new_below"
            onClick={jumpToLatest}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-3 border border-stroke-2 bg-surface-3 px-3 py-1 text-xs font-medium text-fg-0 hover:bg-surface-2"
          >
            {pendingBelow === 1 ? '1 new message' : `${pendingBelow} new messages`}
            {' '}
            ↓
          </button>
        )}
      </div>

      <footer className="border-t border-stroke-1 bg-surface-1 px-4 py-3">
        {writable
          ? (
              <div className="relative">
                {pickerOpen && (
                  <EntityPicker
                    searchUrl={`${base}/entities/search`}
                    onPick={insertReference}
                    onClose={() => { setPickerOpen(false); composerRef.current?.focus(); }}
                  />
                )}
                <textarea
                  ref={composerRef}
                  data-testid="chat_composer"
                  value={draft}
                  rows={2}
                  disabled={sending}
                  onChange={(e) => { setDraft(e.target.value); setSendError(null); }}
                  onKeyDown={onKeyDown}
                  placeholder="Message #general"
                  aria-label="Message #general"
                  className="w-full resize-none rounded-2 border border-stroke-2 bg-surface-2 px-3 py-2 text-[13px] text-fg-0 placeholder:text-fg-3 focus-visible:border-accent focus-visible:outline-none"
                />
                <div className="mt-1.5 flex items-center gap-2 text-[11px] text-fg-3">
                  <span>Enter to send · Shift+Enter for a new line</span>
                  <button
                    type="button"
                    data-testid="chat_entity_picker_toggle"
                    aria-label="Insert entity reference"
                    aria-expanded={pickerOpen}
                    title="Insert entity reference"
                    onClick={() => setPickerOpen(v => !v)}
                    className="ml-auto inline-flex size-7 items-center justify-center rounded-2 border border-stroke-2 bg-surface-2 text-fg-2 hover:bg-surface-3 hover:text-fg-0"
                  >
                    <Link2 size={14} aria-hidden="true" />
                  </button>
                  {overLimit && <span data-testid="chat_over_limit" className="text-fail">{`${draft.trim().length}/${CHAT_MESSAGE_MAX_LENGTH}`}</span>}
                  <button
                    type="button"
                    data-testid="chat_send"
                    aria-label="Send message"
                    disabled={sending || draft.trim().length === 0 || overLimit}
                    onClick={() => void send()}
                    className="inline-flex size-7 items-center justify-center rounded-2 bg-accent text-white hover:bg-accent-hi disabled:pointer-events-none disabled:opacity-40"
                  >
                    {sending ? <Loader2 size={14} className="animate-spin" /> : <SendHorizontal size={14} />}
                  </button>
                </div>
                {sendError && <p data-testid="chat_send_error" role="alert" className="m-0 mt-1 text-xs text-fail">{sendError}</p>}
              </div>
            )
          : (
              <div data-testid="chat_read_only" className="flex items-start gap-2 rounded-2 border border-stroke-2 bg-surface-2 px-3 py-2 text-xs text-fg-1">
                <Lock size={12} className="mt-0.5 shrink-0 text-fg-3" aria-hidden="true" />
                <span>Viewers have read-only access. Ask a workspace admin for the member role to join the conversation.</span>
              </div>
            )}
      </footer>

      {rosterOpen && (
        <aside id="chat-roster" data-testid="chat_roster" aria-label="Members of #general" className="absolute inset-x-0 top-[49px] z-10 max-h-[60%] overflow-y-auto border-b border-stroke-2 bg-surface-2">
          <div className="flex items-center gap-2 border-b border-stroke-1 px-4 py-2">
            <Users size={12} className="text-fg-3" aria-hidden="true" />
            <h3 className="text-xs font-semibold text-fg-0">Members</h3>
            <span className="font-mono text-[10px] text-fg-3">{members.length}</span>
            <button
              type="button"
              aria-label="Close member roster"
              onClick={() => setRosterOpen(false)}
              className="ml-auto inline-flex size-5 items-center justify-center rounded-2 text-fg-3 hover:bg-surface-3 hover:text-fg-1"
            >
              <X size={12} />
            </button>
          </div>
          <ul className="m-0 list-none p-0">
            {members.map((m) => {
              const isOnline = online.has(m.user_id);
              return (
                <li key={m.user_id} data-testid="chat_roster_member" data-online={isOnline} className="flex items-center gap-3 px-4 py-2">
                  <span className="relative flex size-7 shrink-0 items-center justify-center rounded-2 border border-stroke-2 bg-surface-3 text-[10px] font-semibold text-fg-1">
                    {initialsOf(m.display_name)}
                    <span
                      aria-hidden="true"
                      className={cn('absolute -bottom-0.5 -right-0.5 size-2 rounded-full border border-surface-2', isOnline ? 'bg-pass' : 'bg-fg-4')}
                    />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-fg-0">
                    {m.display_name}
                    {m.user_id === userId && <span className="ml-1 text-fg-3">(you)</span>}
                  </span>
                  <span className="text-[11px] text-fg-3">{isOnline ? 'Online' : 'Offline'}</span>
                  <span className="rounded-1 border border-stroke-2 px-1.5 py-0.5 font-mono text-[10px] uppercase text-fg-2">{m.role}</span>
                </li>
              );
            })}
          </ul>
        </aside>
      )}
    </section>
  );
}
