'use client';

import type { NotificationRpcRow } from '@app/api/v1/workspaces/[id]/notifications/response';
import { NotificationRow } from '@components/notifications/NotificationRow';
import {
  formatUnreadSummary,
  resolveNotificationsViewState,
} from '@lib/notifications/view';
import { Bell, CheckCheck, RefreshCw } from 'lucide-react';

// BK-209 (Slice 3: UI) — the bell-anchored notifications panel. Purely
// presentational: AppSidebar owns the fetch, the Realtime subscription, and
// every mutation (mark-one/mark-all read); this component only renders the
// current state and reports row-level intent via callbacks — mirrors
// ActivityView's split between view-state resolution and I/O, minus the
// load-older control (out of this slice's scope — the shipped mockup
// (notifications-inbox.html) has no "load more" affordance in any of its
// four states, so there is nothing to build against; a future story can add
// pagination against the API's existing `next_cursor` without a UI-shape
// change here).

interface NotificationsPanelProps {
  items: NotificationRpcRow[]
  unreadCount: number
  loading: boolean
  error: string | null
  markingAll: boolean
  markingIds: ReadonlySet<string>
  onRetry: () => void
  onMarkAllRead: () => void
  onRowActivate: (notification: NotificationRpcRow) => void
  onMarkOneRead: (notification: NotificationRpcRow) => void
}

export function NotificationsPanel({
  items,
  unreadCount,
  loading,
  error,
  markingAll,
  markingIds,
  onRetry,
  onMarkAllRead,
  onRowActivate,
  onMarkOneRead,
}: NotificationsPanelProps) {
  const state = resolveNotificationsViewState({ loading, error: error !== null, rowCount: items.length });

  return (
    <section
      data-testid="notificationsPanel"
      role="region"
      aria-label="Notifications"
      className="flex max-h-[560px] w-[380px] flex-col overflow-hidden rounded-3 border border-stroke-2 bg-surface-1 shadow-pop"
    >
      <header className="flex items-center gap-3 border-b border-stroke-1 px-4 py-3">
        <h2 className="text-sm font-semibold text-fg-0">Notifications</h2>
        <span data-testid="notifications_summary" className="text-xs text-fg-3">
          {formatUnreadSummary(unreadCount)}
        </span>
        <button
          type="button"
          data-testid="notifications_mark_all_read"
          disabled={unreadCount === 0 || markingAll}
          onClick={onMarkAllRead}
          className="ml-auto inline-flex items-center gap-1 rounded-2 px-2 py-1 text-xs font-medium text-fg-3 transition-colors hover:bg-surface-3 hover:text-fg-0 disabled:pointer-events-none disabled:cursor-default disabled:opacity-40"
        >
          <CheckCheck size={13} />
          {markingAll ? 'Marking…' : 'Mark all as read'}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        {state === 'loading' && (
          <div data-testid="notifications_skeleton" className="flex flex-col gap-4 p-4" aria-hidden="true">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex flex-col gap-1.5">
                <div className="h-3 w-3/4 animate-status-pulse rounded-1 bg-surface-3" />
                <div className="h-2.5 w-1/3 animate-status-pulse rounded-1 bg-surface-3" />
              </div>
            ))}
          </div>
        )}

        {state === 'error' && (
          <div data-testid="notifications_error" className="flex flex-col items-start gap-3 p-4">
            <p className="m-0 text-sm text-fg-2">{error}</p>
            <button
              type="button"
              data-testid="notifications_retry"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 rounded-2 border border-stroke-2 bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-fg-1 hover:bg-surface-3"
            >
              <RefreshCw size={12} />
              Retry
            </button>
          </div>
        )}

        {state === 'empty' && (
          <div data-testid="notifications_empty" className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <Bell size={18} className="text-fg-3" />
            <span className="text-sm font-semibold text-fg-1">No notifications yet</span>
            {/* PO Answer, comments.md 2026-07-16 — frozen empty-state copy. */}
            <span className="max-w-[36ch] text-xs text-fg-3">
              Important workspace events will appear here.
            </span>
          </div>
        )}

        {state === 'rows' && (
          <div data-testid="notifications_list">
            {items.map(item => (
              <NotificationRow
                key={item.id}
                notification={item}
                marking={markingIds.has(item.id)}
                onMarkRead={() => onMarkOneRead(item)}
                onOpen={() => onRowActivate(item)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
