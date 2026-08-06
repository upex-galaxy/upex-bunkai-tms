'use client';

import type { ApiErrorBody } from '@lib/api/error-envelope';
import type { EditableEventType, NotificationChannel } from '@lib/notification-preferences/constants';
import type { PreferenceCell } from '@lib/notification-preferences/grid';
import { Switch } from '@components/ui/switch';
import { cn } from '@lib/utils';
import { Bell, Lock, Mail } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface NotificationPreferencesGridProps {
  preferences: PreferenceCell[]
}

interface RowMeta {
  label: string
  description: string
  note?: string
}

// Copy + row order per the mockup (settings-notifications.html) and
// business-rules.md. Local to this single caller — not extracted to `lib/`
// since nothing else renders this grid (Behavioral Layer: no abstractions
// for single-use).
const ROW_META: Record<string, RowMeta> = {
  run_lifecycle: {
    label: 'Run lifecycle',
    description: 'A run finishes, fails, or is aborted.',
  },
  bug_lifecycle: {
    label: 'Bug lifecycle',
    description: 'Assignments and status changes.',
  },
  mentions: {
    label: 'Mentions',
    description: 'Someone mentions you in a comment or discussion.',
    note: 'Mentions arrive with the Team Chat epic — these controls unlock when it ships.',
  },
};
const ROW_ORDER = ['run_lifecycle', 'bug_lifecycle', 'mentions'];
const CHANNEL_LABEL: Record<NotificationChannel, string> = { in_app: 'In-app', email: 'Email' };

// Settings > Notifications preference grid (BK-213 — AC1-AC5). Instant-save:
// each toggle click optimistically flips the cell, PATCHes
// `/api/v1/notification-preferences`, and reverts + toasts on failure —
// mirrors `BugsListView.tsx`'s fetch/error convention (handleStatusAdvance).
// `principal.userId`-scoped server data comes in as `preferences` from the
// parent server component (`settings/notifications/page.tsx`, TD7 isolation);
// this component owns no Supabase client of its own.
export function NotificationPreferencesGrid({ preferences }: NotificationPreferencesGridProps) {
  const [cells, setCells] = useState(preferences);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const handleToggle = async (eventType: EditableEventType, channel: NotificationChannel, nextEnabled: boolean) => {
    const key = cellKey(eventType, channel);
    const previous = cells;
    setCells(prev => prev.map(cell =>
      cell.event_type === eventType && cell.channel === channel
        ? { ...cell, enabled: nextEnabled }
        : cell,
    ));
    setSavingKey(key);

    try {
      const response = await fetch('/api/v1/notification-preferences', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event_type: eventType, channel, enabled: nextEnabled }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
        setCells(previous);
        toast.error(body.error?.message ?? 'Could not save this preference.');
        return;
      }
      toast.success('Saved');
    }
    catch (err) {
      setCells(previous);
      toast.error(err instanceof Error ? err.message : 'Network error.');
    }
    finally {
      setSavingKey(null);
    }
  };

  return (
    <div>
      <div
        role="group"
        aria-label="Notification channels by event type"
        data-testid="notification-preferences-grid"
        className="mt-5 max-w-[860px] overflow-hidden rounded-3 border border-stroke-2 bg-surface-2 shadow-card"
      >
        <div className="grid grid-cols-[1fr_160px_160px] border-b border-stroke-1 bg-surface-1">
          <div className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-fg-3">Event type</div>
          <div className="flex items-center gap-2 px-6 py-3 text-xs font-medium uppercase tracking-wide text-fg-3">
            <Bell size={13} />
            In-app
          </div>
          <div className="flex items-center gap-2 px-6 py-3 text-xs font-medium uppercase tracking-wide text-fg-3">
            <Mail size={13} />
            Email
          </div>
        </div>

        {ROW_ORDER.map((eventType, rowIndex) => {
          const meta = ROW_META[eventType];
          const rowCells = cells.filter(cell => cell.event_type === eventType);
          return (
            <div
              key={eventType}
              data-testid={`pref-row-${eventType}`}
              className={cn(
                'grid grid-cols-[1fr_160px_160px]',
                rowIndex < ROW_ORDER.length - 1 && 'border-b border-stroke-1',
              )}
            >
              <div className="px-6 py-5">
                <div className="flex items-center gap-3 text-base font-semibold text-fg-0">
                  {meta.label}
                  {meta.note && (
                    <span className="rounded-2 border border-stroke-2 bg-surface-3 px-1.5 py-px font-mono text-2xs uppercase tracking-wide text-fg-3">
                      soon
                    </span>
                  )}
                </div>
                <div className="mt-1 text-sm text-fg-2">{meta.description}</div>
                {meta.note && <div className="mt-2 text-xs text-fg-3">{meta.note}</div>}
              </div>

              {(['in_app', 'email'] as const).map((channel) => {
                const cell = rowCells.find(c => c.channel === channel);
                if (!cell) {
                  return <div key={channel} className="border-l border-stroke-1" />;
                }
                const key = cellKey(eventType, channel);
                return (
                  <div
                    key={channel}
                    data-testid={`pref-cell-${eventType}-${channel}`}
                    className={cn(
                      'flex items-center gap-3 border-l border-stroke-1 px-6 py-5',
                      !cell.locked && 'transition-colors duration-token ease-token hover:bg-surface-3',
                    )}
                  >
                    <Switch
                      checked={cell.enabled}
                      disabled={cell.locked || savingKey === key}
                      onCheckedChange={(checked) => { void handleToggle(eventType as EditableEventType, channel, checked); }}
                      aria-label={cell.locked
                        ? `${CHANNEL_LABEL[channel]}, ${meta.label}, locked until Team Chat ships`
                        : `${meta.label}, ${CHANNEL_LABEL[channel]} notifications`}
                    />
                    <span className={cn('font-mono text-xs', cell.locked ? 'flex items-center gap-1 text-fg-4' : cell.enabled ? 'font-medium text-fg-1' : 'text-fg-3')}>
                      {cell.locked ? <Lock size={11} /> : null}
                      {cell.locked ? 'Locked' : cell.enabled ? 'On' : 'Off'}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <p className="mt-5 flex max-w-[860px] items-center gap-2 text-sm text-fg-3">
        Changes save automatically and persist across sessions.
      </p>
    </div>
  );
}

function cellKey(eventType: string, channel: string): string {
  return `${eventType}:${channel}`;
}
