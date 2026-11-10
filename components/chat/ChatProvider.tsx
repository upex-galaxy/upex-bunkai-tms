'use client';

import type { ReactNode } from 'react';
import { createContext, use, useCallback, useMemo, useState } from 'react';

// BK-215 — open/closed + unread state shared between the sidebar entry point
// (AppSidebar) and the docked panel (ChatDock) in the app shell. The panel
// stays mounted while closed so the Realtime subscription keeps the unread
// badge live; only its visibility changes.

interface ChatContextValue {
  open: boolean
  unread: number
  // BK-217: the message a mention notification asked the chat to show. The
  // panel scrolls to it, highlights it briefly and then calls `clearFocus`.
  focusMessageId: string | null
  toggle: () => void
  close: () => void
  setUnread: (n: number) => void
  openOnMessage: (messageId: string) => void
  clearFocus: () => void
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [focusMessageId, setFocusMessageId] = useState<string | null>(null);
  const toggle = useCallback(() => setOpen(o => !o), []);
  const close = useCallback(() => setOpen(false), []);
  const openOnMessage = useCallback((messageId: string) => {
    setFocusMessageId(messageId);
    setOpen(true);
  }, []);
  const clearFocus = useCallback(() => setFocusMessageId(null), []);
  const value = useMemo(
    () => ({ open, unread, focusMessageId, toggle, close, setUnread, openOnMessage, clearFocus }),
    [open, unread, focusMessageId, toggle, close, openOnMessage, clearFocus],
  );
  return <ChatContext value={value}>{children}</ChatContext>;
}

export function useChat(): ChatContextValue {
  const ctx = use(ChatContext);
  if (!ctx) { throw new Error('useChat must be used inside <ChatProvider>'); }
  return ctx;
}
