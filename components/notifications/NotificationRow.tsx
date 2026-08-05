'use client';

import type { NotificationRpcRow } from '@app/api/v1/workspaces/[id]/notifications/response';
import { resolveNotificationHref } from '@lib/notifications/entity-routes';
import { formatRelativeTime } from '@lib/notifications/relative-time';
import { resolveNotificationTitle, resolveNotificationUnavailable } from '@lib/notifications/view';
import { Check, Info } from 'lucide-react';

// BK-209 (Slice 3: UI) — one notification row inside NotificationsPanel.
// Presentational only: activation (mark-read + optional navigate) and the
// per-row "mark as read" affordance are owned by the caller (AppSidebar),
// this component just renders the row and reports intent via callbacks —
// mirrors ActivityView's ActivityRow, minus the click-through (Activity has
// none; this row's whole point IS the deep link, AC4/AC5).
//
// PO Answer (comments.md 2026-07-16): "Unread rows should use a small
// unread dot, stronger text weight, and subtle surface emphasis... Do not
// rely on color alone" — the unread marker below is a structural dot + font
// weight, never color-only.

interface NotificationRowProps {
  notification: NotificationRpcRow
  marking: boolean
  onMarkRead: () => void
  onOpen: () => void
}

export function NotificationRow({ notification, marking, onMarkRead, onOpen }: NotificationRowProps) {
  const unread = notification.read_at === null;
  const title = resolveNotificationTitle(notification);
  const href = resolveNotificationHref(notification);
  // AC5 — the fallback note is proactive: it renders whenever the entity is
  // not available, not only after the user has already clicked through once.
  // A row is also unavailable when entity_available is true but no route
  // could be resolved (e.g. a standalone bug — see resolveNotificationUnavailable).
  const unavailable = resolveNotificationUnavailable(notification.entity_available, href);

  const handleActivate = () => {
    onOpen();
  };

  return (
    <div
      data-testid="notificationRow"
      role="button"
      tabIndex={0}
      aria-label={`${title.text}${href !== null ? '' : ', unavailable'}${unread ? ', unread' : ', read'}`}
      onClick={handleActivate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleActivate();
        }
      }}
      className={`grid grid-cols-[10px_1fr_auto] items-start gap-2.5 border-b border-stroke-1 px-4 py-3 outline-none last:border-b-0 focus-visible:bg-surface-2 ${href !== null ? 'cursor-pointer hover:bg-surface-2' : 'cursor-default'}`}
    >
      <span
        data-testid="notification_unread_dot"
        aria-hidden="true"
        className={`mt-1.5 size-1.5 shrink-0 rounded-full bg-fg-0 ${unread ? '' : 'invisible'}`}
      />

      <div className="min-w-0">
        <div className={`flex flex-wrap items-center gap-1.5 text-xs ${unread ? 'font-semibold text-fg-0' : 'font-normal text-fg-3'}`}>
          <span>{title.text}</span>
          {title.signal && (
            <span className="status-chip" data-status={title.signal.status}>{title.signal.label}</span>
          )}
        </div>

        {title.reason && (
          <p className="m-0 mt-0.5 text-2xs text-fg-3">
            Reason:
            {' '}
            {title.reason}
          </p>
        )}

        <div className="mt-1 font-mono text-2xs text-fg-3">
          <span title={notification.created_at}>{formatRelativeTime(notification.created_at)}</span>
        </div>

        {unavailable && (
          <div
            data-testid="notification_unavailable_note"
            className="mt-2 flex items-start gap-1.5 rounded-2 border border-dashed border-stroke-2 bg-surface-1 px-2.5 py-2 text-2xs text-fg-3"
          >
            <Info size={12} className="mt-0.5 shrink-0 text-fg-3" />
            <span>This item is no longer available.</span>
          </div>
        )}
      </div>

      <div className="flex items-start">
        {unread && (
          <button
            type="button"
            data-testid="notification_mark_read_button"
            aria-label="Mark as read"
            title="Mark as read"
            disabled={marking}
            onClick={(e) => {
              e.stopPropagation();
              onMarkRead();
            }}
            className="inline-flex size-6 items-center justify-center rounded-2 text-fg-3 hover:bg-surface-4 hover:text-fg-0 disabled:pointer-events-none disabled:opacity-50"
          >
            <Check size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
