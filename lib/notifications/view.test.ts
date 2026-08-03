import {
  formatUnreadBadgeCount,
  formatUnreadSummary,
  resolveNotificationsViewState,
  resolveNotificationTitle,
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

  test('run.aborted carries the optional reason through, when present', () => {
    const title = resolveNotificationTitle({ event_type: 'run.aborted', entity_type: 'run', payload: { reason: 'Wrong build deployed' } });
    expect(title).toEqual({ text: 'Run aborted', signal: { label: 'aborted', status: 'aborted' }, reason: 'Wrong build deployed' });
  });

  test('an unrecognized run event still gets a neutral run label, not a crash', () => {
    const title = resolveNotificationTitle({ event_type: 'run.something_future', entity_type: 'run', payload: {} });
    expect(title).toEqual({ text: 'Run update', signal: null, reason: null });
  });

  test('test entity_type gets a neutral test label', () => {
    const title = resolveNotificationTitle({ event_type: 'test.created', entity_type: 'test', payload: {} });
    expect(title).toEqual({ text: 'Test update', signal: null, reason: null });
  });

  test('bug (and any other/future entity_type) falls back to a generic label', () => {
    const title = resolveNotificationTitle({ event_type: 'bug.assigned', entity_type: 'bug', payload: {} });
    expect(title).toEqual({ text: 'Workspace notification', signal: null, reason: null });
  });
});
