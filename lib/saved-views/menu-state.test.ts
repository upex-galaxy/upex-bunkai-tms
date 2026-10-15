import type { SavedViewItem } from './view-model';
import { describe, expect, test } from 'bun:test';
import {
  createSubmitGuard,
  removeView,
  resolveActiveView,
  sortViews,
  stateKey,
  upsertView,
  visibleNotice,
} from './menu-state';

// BK-443 — derived state of the Saved views control.

function view(id: string, name: string): SavedViewItem {
  return {
    id,
    project_id: 'p',
    view_kind: 'bugs',
    name,
    state: { severity: 'P1' },
    created_at: '2026-10-15T00:00:00Z',
    updated_at: '2026-10-15T00:00:00Z',
  };
}

describe('stateKey', () => {
  test('is independent of key order', () => {
    expect(stateKey({ b: '2', a: '1' })).toBe(stateKey({ a: '1', b: '2' }));
  });

  test('differs when any value differs, and is empty for an empty state', () => {
    expect(stateKey({ a: '1' })).not.toBe(stateKey({ a: '2' }));
    expect(stateKey({})).toBe('');
  });
});

describe('visibleNotice', () => {
  const notice = { message: 'The Module filter no longer applies', forKey: stateKey({ severity: 'P1' }) };

  test('shows while the surface still holds the state it was produced for', () => {
    expect(visibleNotice(notice, { severity: 'P1' })).toBe(notice.message);
  });

  test('disappears on the next edit of any filter', () => {
    expect(visibleNotice(notice, { severity: 'P1,P2' })).toBeNull();
    expect(visibleNotice(notice, {})).toBeNull();
  });

  test('is null when there is no notice', () => {
    expect(visibleNotice(null, {})).toBeNull();
  });
});

describe('view list helpers', () => {
  test('sorts by case-folded name, then id', () => {
    const sorted = sortViews([view('2', 'banana'), view('1', 'Apple'), view('3', 'apple')]);
    expect(sorted.map(v => v.id)).toEqual(['1', '3', '2']);
  });

  test('a saved view is listed immediately and in order, replacing a stale copy of itself', () => {
    const list = upsertView([view('1', 'Alpha'), view('3', 'Gamma')], view('2', 'Beta'));
    expect(list.map(v => v.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
    const renamed = upsertView(list, view('2', 'Zeta'));
    expect(renamed.map(v => v.name)).toEqual(['Alpha', 'Gamma', 'Zeta']);
  });

  test('removeView drops only the targeted view', () => {
    expect(removeView([view('1', 'A'), view('2', 'B')], '1').map(v => v.id)).toEqual(['2']);
  });
});

describe('resolveActiveView', () => {
  const views = [view('1', 'A'), view('2', 'B')];

  test('returns the active view while it exists', () => {
    expect(resolveActiveView(views, '2')?.name).toBe('B');
  });

  test('clears once the active view is deleted', () => {
    expect(resolveActiveView(removeView(views, '2'), '2')).toBeNull();
  });

  test('is null before the list has loaded or when nothing is active', () => {
    expect(resolveActiveView(null, '1')).toBeNull();
    expect(resolveActiveView(views, null)).toBeNull();
  });
});

describe('createSubmitGuard', () => {
  test('lets exactly one of two rapid submits through', () => {
    const guard = createSubmitGuard();
    expect(guard.tryEnter()).toBe(true);
    expect(guard.tryEnter()).toBe(false);
  });

  test('allows a new submit after the first one finished', () => {
    const guard = createSubmitGuard();
    guard.tryEnter();
    guard.leave();
    expect(guard.tryEnter()).toBe(true);
  });
});
