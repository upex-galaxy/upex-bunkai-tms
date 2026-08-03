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

// Event vocabulary: only `run` and `test` entity types have a real
// vocabulary this slice can render today. BK-211 (run lifecycle) and BK-212
// (bug lifecycle) are the sibling producer stories that will actually
// populate `event_type`/`payload`, but neither has shipped — and
// `entity_type: 'bug'` always resolves `entity_available: false` regardless
// (migration 0053_notifications.sql), so a bug notification never needs more
// than the generic label below; it always renders the unavailable fallback.
// Unknown/future event types fall back to a neutral label rather than
// guessing at a payload shape no producer has defined yet.
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

  // `bug` + any future entity_type: no vocabulary defined yet, and
  // entity_available is always false for these today, so the row renders
  // the unavailable fallback regardless of this label's specificity.
  return { text: 'Workspace notification', signal: null, reason: null };
}
