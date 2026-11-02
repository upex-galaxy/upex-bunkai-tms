'use client';

import type { ChatRole } from '@lib/chat/messages';
import { ChatPanel } from '@components/chat/ChatPanel';
import { useChat } from '@components/chat/ChatProvider';

// BK-215 — right-side collapsible dock in the app shell. Always mounted
// (hidden when closed) so presence + realtime + the unread badge stay live.
// BK-1557 — below `md` there is no room for a 380px column, so the open dock
// covers the screen as a full-width overlay instead (D53).
export function ChatDock({ workspaceId, userId, role }: { workspaceId: string, userId: string, role: ChatRole | null }) {
  const { open, close, setUnread } = useChat();
  return (
    <aside
      data-testid="chat_dock"
      hidden={!open}
      aria-label="Team chat"
      className="fixed inset-0 z-50 min-h-0 w-full bg-surface-1 md:static md:z-auto md:h-dvh md:w-[380px] md:border-l md:border-stroke-1"
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
