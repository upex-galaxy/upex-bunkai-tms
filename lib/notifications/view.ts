// BK-209 (Slice 3: UI) — pure, framework-agnostic view-state helpers for the
// notifications panel: branch selection (loading/error/empty/rows, mirrors
// lib/activity/view.ts's resolveActivityViewState), the unread-badge copy
// (N2, business-rules.md: "caps its display at 99+"), and the per-row event
// vocabulary. All I/O (fetch, Realtime, router navigation) stays in
// components/layout/AppSidebar.tsx / components/notifications/*; this file
// is what makes branch selection and label derivation unit-testable without
// a browser or a live DB.

export type NotificationsViewState = 'loading' | 'error' | 'empty' | 'rows';

interface ResolveNotificationsViewStateParams {
  loading: boolean
  error: boolean
  rowCount: number
}

// `loading` only wins the FIRST paint (rowCount === 0) — reopening an
// already-loaded panel never blanks the list while a background refresh is
// in flight (mirrors ActivityView's error/append-error split: don't unmount
// what is already on screen).
export function resolveNotificationsViewState({ loading, error, rowCount }: ResolveNotificationsViewStateParams): NotificationsViewState {
  if (loading && rowCount === 0) {
    return 'loading';
  }
  if (error) {
    return 'error';
  }
  return rowCount > 0 ? 'rows' : 'empty';
}

// N2 (business-rules.md): "The unread badge shows the exact count up to 99,
// then '99+'." Bare numeral/cap text for the small bell-overlay pill.
export function formatUnreadBadgeCount(count: number): string {
  return count > 99 ? '99+' : String(count);
}

// The panel header's summary line ("3 unread" / "All caught up" — mirrors
// the shipped mockup's `#count-1` text and its all-read state copy).
export function formatUnreadSummary(count: number): string {
  return count > 0 ? `${formatUnreadBadgeCount(count)} unread` : 'All caught up';
}

export type NotificationSignalStatus = 'pass' | 'fail' | 'aborted';

export interface NotificationTitleView {
  text: string
  signal: { label: string, status: NotificationSignalStatus } | null
  reason: string | null
}

interface NotificationTitleInput {
  event_type: string
  entity_type: string
  payload: Record<string, unknown>
}

// Event vocabulary: `run`, `test`, and (BK-212 Slice 2) `bug` entity types
// have a real vocabulary this slice can render. Unknown/future event types
// fall back to a neutral label rather than guessing at a payload shape no
// producer has defined yet.
export function resolveNotificationTitle(notification: NotificationTitleInput): NotificationTitleView {
  const { event_type: eventType, entity_type: entityType, payload } = notification;

  if (entityType === 'run') {
    if (eventType === 'run.finished') {
      const verdict = payload.verdict;
      const signal: NotificationTitleView['signal'] = verdict === 'passed'
        ? { label: 'passed', status: 'pass' }
        : verdict === 'failed'
          ? { label: 'failed', status: 'fail' }
          : null;
      return { text: 'Run finished', signal, reason: null };
    }
    if (eventType === 'run.aborted') {
      const reason = typeof payload.reason === 'string' ? payload.reason : null;
      return { text: 'Run aborted', signal: { label: 'aborted', status: 'aborted' }, reason };
    }
    return { text: 'Run update', signal: null, reason: null };
  }

  if (entityType === 'test') {
    return { text: 'Test update', signal: null, reason: null };
  }

  // BK-212 Slice 2 — bug assignment/status vocabulary. `payload.title` is
  // always populated by the producer (migration 0056/0057:
  // bunkai_notify_bug_event never inserts a row without a resolved bug
  // title) — the string fallback below is defensive, not the expected path.
  if (entityType === 'bug') {
    const bugTitle = typeof payload.title === 'string' ? payload.title : 'a bug';

    if (eventType === 'bug.assigned' || eventType === 'bug.reassigned') {
      // AC1 (acceptance-criteria.md): "Bug assigned to you: Checkout total
      // rounds incorrectly" — frozen copy, not a paraphrase.
      return { text: `Bug assigned to you: ${bugTitle}`, signal: null, reason: null };
    }
    if (eventType === 'bug.status_changed') {
      // AC2/AC3: "the bug status changed to in progress". business-rules.md:
      // "notifications display whatever status names that lifecycle
      // defines, without inventing their own" — render the DB's own status
      // value verbatim, only humanizing the underscore BK-31's schema uses
      // (`in_progress` -> "in progress"), never a different word.
      const status = typeof payload.status === 'string' ? payload.status.replace(/_/g, ' ') : 'an unknown status';
      return { text: `Bug status changed to ${status}`, signal: null, reason: null };
    }
    // Any other/future bug event (e.g. bug.unassigned, which this story
    // never notifies on — see 0056's header): neutral label, mirrors the
    // "Run update"/"Test update" fallback shape above.
    return { text: 'Bug update', signal: null, reason: null };
  }

  // Any future entity_type: no vocabulary defined yet.
  return { text: 'Workspace notification', signal: null, reason: null };
}

// BK-212 review fix — `entity_available` alone is not sufficient: a
// standalone bug (bugs.run_id null) has `entity_available: true` (migration
// 0057's CASE only checks the bug row exists) but resolveNotificationHref
// (lib/notifications/entity-routes.ts) still returns null for it, since
// there is no run to deep-link into. A row is only really "available to
// open" when BOTH the entity exists/is visible AND a route actually
// resolved for it — otherwise the row must show the same "no longer
// available" affordance as a genuinely-deleted entity, not render as a
// silent no-op click.
export function resolveNotificationUnavailable(entityAvailable: boolean, href: string | null): boolean {
  return !entityAvailable || href === null;
}
