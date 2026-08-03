// BK-209 (Slice 3: UI) / ADR-0010 — Realtime channel config for the
// notifications bell/panel, the second consumer of the pattern BK-35
// established (ADR-0010 explicitly names "BK-209's workspace-event inbox" as
// a reuse case). This module owns only the channel/binding SHAPE — the
// refetch-coalescing scheduler and the reconnect/reconciliation policy are
// fully generic already (no run-specific typing anywhere in their
// signatures), so the UI wiring (components/layout/AppSidebar.tsx) imports
// `createRefetchScheduler` / `shouldReconcileOnStatusChange` /
// `RealtimeConnectionStatus` straight from `lib/runs/realtime-run-channel.ts`
// rather than this file re-deriving a second copy (DRY — CLAUDE.md §10:
// share once a stable abstraction gets a genuine second consumer).

export interface NotificationsChannelBinding {
  event: 'INSERT' | 'UPDATE'
  schema: 'public'
  table: 'notifications'
  filter: string
}

export interface NotificationsChannelConfig {
  // One channel per active workspace — mirrors buildRunChannelConfig's
  // per-run channel naming.
  channelName: string
  bindings: NotificationsChannelBinding[]
}

// RLS (`notifications_select_recipient_member_retained`, migration
// 0053_notifications.sql) scopes every delivered row to the CALLER's own
// rows regardless of who else shares this workspace-scoped channel —
// Realtime Authorization enforces the same SELECT policy on
// `postgres_changes` (the migration's own comment). So a plain
// `workspace_id=eq.<id>` filter is enough; no per-recipient filter is needed
// on top of it. Both INSERT (a new notification arrives) and UPDATE (a
// read-state change, from this session or mark-all-read) are bound — new
// rows change the badge/list, and read-state changes reconcile the badge
// when the same recipient acts from a second tab/device.
export function buildNotificationsChannelConfig(workspaceId: string): NotificationsChannelConfig {
  const filter = `workspace_id=eq.${workspaceId}`;

  return {
    channelName: `notifications-${workspaceId}`,
    bindings: [
      { event: 'INSERT', schema: 'public', table: 'notifications', filter },
      { event: 'UPDATE', schema: 'public', table: 'notifications', filter },
    ],
  };
}
