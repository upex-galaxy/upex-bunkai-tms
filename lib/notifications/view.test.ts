import {
  formatUnreadBadgeCount,
  formatUnreadSummary,
  resolveNotificationsViewState,
  resolveNotificationTitle,
  resolveNotificationUnavailable,
} from '@lib/notifications/view';
import { describe, expect, test } from 'bun:test';

describe('resolveNotificationsViewState', () => {
  test('first-paint loading with nothing on screen yet -> loading', () => {
    expect(resolveNotificationsViewState({ loading: true, error: false, rowCount: 0 })).toBe('loading');
  });

  test('a background refresh with rows already mounted does NOT blank the list', () => {
    expect(resolveNotificationsViewState({ loading: true, error: false, rowCount: 5 })).toBe('rows');
  });

  test('error takes priority once nothing is loading', () => {
    expect(resolveNotificationsViewState({ loading: false, error: true, rowCount: 0 })).toBe('error');
  });

  test('rows present -> rows', () => {
    expect(resolveNotificationsViewState({ loading: false, error: false, rowCount: 3 })).toBe('rows');
  });

  test('zero rows, no error, not loading -> empty', () => {
    expect(resolveNotificationsViewState({ loading: false, error: false, rowCount: 0 })).toBe('empty');
  });
});

describe('formatUnreadBadgeCount', () => {
  test('renders the exact count up to 99', () => {
    expect(formatUnreadBadgeCount(0)).toBe('0');
    expect(formatUnreadBadgeCount(3)).toBe('3');
    expect(formatUnreadBadgeCount(99)).toBe('99');
  });

  test('caps at 99+ beyond 99 (N2, business-rules.md)', () => {
    expect(formatUnreadBadgeCount(100)).toBe('99+');
    expect(formatUnreadBadgeCount(250)).toBe('99+');
  });
});

describe('formatUnreadSummary', () => {
  test('a positive count reads "N unread"', () => {
    expect(formatUnreadSummary(3)).toBe('3 unread');
    expect(formatUnreadSummary(120)).toBe('99+ unread');
  });

  test('zero unread reads "All caught up"', () => {
    expect(formatUnreadSummary(0)).toBe('All caught up');
  });
});

describe('resolveNotificationTitle', () => {
  test('run.finished with a passed verdict', () => {
    const title = resolveNotificationTitle({ event_type: 'run.finished', entity_type: 'run', payload: { verdict: 'passed' } });
    expect(title).toEqual({ text: 'Run finished', signal: { label: 'passed', status: 'pass' }, reason: null });
  });

  test('run.finished with a failed verdict', () => {
    const title = resolveNotificationTitle({ event_type: 'run.finished', entity_type: 'run', payload: { verdict: 'failed' } });
    expect(title).toEqual({ text: 'Run finished', signal: { label: 'failed', status: 'fail' }, reason: null });
  });

  test('run.finished with no/unknown verdict renders no signal chip rather than guessing', () => {
    const title = resolveNotificationTitle({ event_type: 'run.finished', entity_type: 'run', payload: {} });
    expect(title).toEqual({ text: 'Run finished', signal: null, reason: null });
  });

  // BK-211 (comment 12173, "Run-event row copy" decision) — AC1: "Run
  // finished: Login regression chain — passed". Title carries the test
  // name; the verdict stays a chip, never re-encoded into the title string.
  test('run.finished with a payload title prepends "Run finished: {title}"', () => {
    const title = resolveNotificationTitle({
      event_type: 'run.finished',
      entity_type: 'run',
      payload: { title: 'Login regression chain', verdict: 'passed' },
    });
    expect(title).toEqual({ text: 'Run finished: Login regression chain', signal: { label: 'passed', status: 'pass' }, reason: null });
  });

  test('run.finished with an empty-string payload title falls back to the bare copy', () => {
    const title = resolveNotificationTitle({
      event_type: 'run.finished',
      entity_type: 'run',
      payload: { title: '', verdict: 'passed' },
    });
    expect(title.text).toBe('Run finished');
  });

  test('run.aborted carries the optional reason through, when present', () => {
    const title = resolveNotificationTitle({ event_type: 'run.aborted', entity_type: 'run', payload: { reason: 'Wrong build deployed' } });
    expect(title).toEqual({ text: 'Run aborted', signal: { label: 'aborted', status: 'aborted' }, reason: 'Wrong build deployed' });
  });

  // AC3: "she sees a notification that the run was aborted including the
  // reason 'Wrong build deployed'" — title carries the test name, reason
  // stays on the dedicated second line NotificationRow.tsx already renders.
  test('run.aborted with a payload title prepends "Run aborted: {title}"', () => {
    const title = resolveNotificationTitle({
      event_type: 'run.aborted',
      entity_type: 'run',
      payload: { title: 'Profile settings chain', reason: 'Wrong build deployed' },
    });
    expect(title).toEqual({
      text: 'Run aborted: Profile settings chain',
      signal: { label: 'aborted', status: 'aborted' },
      reason: 'Wrong build deployed',
    });
  });

  test('an unrecognized run event still gets a neutral run label, not a crash', () => {
    const title = resolveNotificationTitle({ event_type: 'run.something_future', entity_type: 'run', payload: {} });
    expect(title).toEqual({ text: 'Run update', signal: null, reason: null });
  });

  test('test entity_type gets a neutral test label', () => {
    const title = resolveNotificationTitle({ event_type: 'test.created', entity_type: 'test', payload: {} });
    expect(title).toEqual({ text: 'Test update', signal: null, reason: null });
  });

  test('bug.assigned renders the frozen AC1 copy with the bug title from payload', () => {
    const title = resolveNotificationTitle({
      event_type: 'bug.assigned',
      entity_type: 'bug',
      payload: { title: 'Checkout total rounds incorrectly' },
    });
    expect(title).toEqual({ text: 'Bug assigned to you: Checkout total rounds incorrectly', signal: null, reason: null });
  });

  test('bug.reassigned renders the same "assigned to you" copy as bug.assigned', () => {
    const title = resolveNotificationTitle({
      event_type: 'bug.reassigned',
      entity_type: 'bug',
      payload: { title: 'Session expires during long run' },
    });
    expect(title).toEqual({ text: 'Bug assigned to you: Session expires during long run', signal: null, reason: null });
  });

  test('bug.status_changed renders the AC2/AC3 copy, humanizing the underscore in the DB status value', () => {
    const title = resolveNotificationTitle({
      event_type: 'bug.status_changed',
      entity_type: 'bug',
      payload: { title: 'Session expires during long run', status: 'in_progress' },
    });
    expect(title).toEqual({ text: 'Bug status changed to in progress', signal: null, reason: null });
  });

  test('bug.status_changed with a missing/malformed status renders a neutral fallback rather than crashing', () => {
    const title = resolveNotificationTitle({ event_type: 'bug.status_changed', entity_type: 'bug', payload: {} });
    expect(title).toEqual({ text: 'Bug status changed to an unknown status', signal: null, reason: null });
  });

  test('a bug notification with a missing/malformed title falls back to a neutral placeholder rather than crashing', () => {
    const title = resolveNotificationTitle({ event_type: 'bug.assigned', entity_type: 'bug', payload: {} });
    expect(title).toEqual({ text: 'Bug assigned to you: a bug', signal: null, reason: null });
  });

  test('an unrecognized bug event (e.g. bug.unassigned) still gets a neutral bug label, not a crash', () => {
    const title = resolveNotificationTitle({ event_type: 'bug.unassigned', entity_type: 'bug', payload: {} });
    expect(title).toEqual({ text: 'Bug update', signal: null, reason: null });
  });

  test('any other/future entity_type falls back to a generic label', () => {
    const title = resolveNotificationTitle({ event_type: 'something.happened', entity_type: 'future_entity', payload: {} });
    expect(title).toEqual({ text: 'Workspace notification', signal: null, reason: null });
  });
});

describe('resolveNotificationUnavailable', () => {
  test('entity_available: false is unavailable regardless of href', () => {
    expect(resolveNotificationUnavailable(false, null)).toBe(true);
    expect(resolveNotificationUnavailable(false, '/projects/checkout-platform/runs/run-1')).toBe(true);
  });

  test('a run/test with entity_available: true and a resolved href is available', () => {
    expect(resolveNotificationUnavailable(true, '/projects/checkout-platform/runs/run-1')).toBe(false);
    expect(resolveNotificationUnavailable(true, '/projects/checkout-platform/tests/test-1')).toBe(false);
  });

  test('a standalone bug (entity_available: true, href: null) is unavailable — no route could be resolved for it', () => {
    expect(resolveNotificationUnavailable(true, null)).toBe(true);
  });
});
