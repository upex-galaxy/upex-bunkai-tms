'use client';

import type { ChatRole } from '@lib/chat/messages';
import { ChatPanel } from '@components/chat/ChatPanel';
import { useChat } from '@components/chat/ChatProvider';

// BK-215 — right-side collapsible dock in the app shell. Always mounted
// (hidden when closed) so presence + realtime + the unread badge stay live.
export function ChatDock({ workspaceId, userId, role }: { workspaceId: string, userId: string, role: ChatRole | null }) {
  const { open, close, setUnread } = useChat();
  return (
    <aside
      data-testid="chat_dock"
      hidden={!open}
      aria-label="Team chat"
      className="h-screen w-[380px] min-h-0 border-l border-stroke-1 bg-surface-1"
    >
      <ChatPanel
        key={workspaceId}
        workspaceId={workspaceId}
        userId={userId}
        role={role}
        open={open}
        onClose={close}
        onUnreadChange={setUnread}
      />
    </aside>
  );
}
