import type { SavedViewItem } from './view-model';
import { describe, expect, test } from 'bun:test';
import { SAVED_VIEW_NAME_MAX } from './constants';
import {
  afterDelete,
  afterWrite,
  createSubmitGuard,
  nameFieldReducer,
  pruneNotice,
  removeView,
  resolveActiveView,
  savedViewNameLength,
  sortViews,
  stateKey,
  upsertView,
  visibleNotice,
} from './menu-state';
import { SavedViewNameSchema } from './validation';

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

describe('pruneNotice', () => {
  const raisedForEmpty = { message: 'Nothing to save: apply at least one filter first.', forKey: stateKey({}) };

  test('keeps a notice while the surface holds the state it was raised for', () => {
    expect(pruneNotice(raisedForEmpty, {})).toBe(raisedForEmpty);
  });

  test('drops it for good on the next edit, so it cannot come back', () => {
    // Nothing to save -> the member applies a filter -> then presses Reset.
    let notice: typeof raisedForEmpty | null = raisedForEmpty;
    notice = pruneNotice(notice, { severity: 'P1' });
    expect(notice).toBeNull();
    notice = pruneNotice(notice, {});
    expect(notice).toBeNull();
    expect(visibleNotice(notice, {})).toBeNull();
  });

  test('covers the degraded-restore notices the same way', () => {
    const degraded = { message: 'The Module filter no longer applies', forKey: stateKey({ severity: 'P1' }) };
    expect(pruneNotice(degraded, { severity: 'P1' })).toBe(degraded);
    expect(pruneNotice(degraded, { severity: 'P2' })).toBeNull();
  });

  test('is null for no notice', () => {
    expect(pruneNotice(null, {})).toBeNull();
  });
});

describe('afterWrite and afterDelete', () => {
  test('with a loaded list the write is merged in order and no reload is needed', () => {
    const change = afterWrite([view('1', 'Alpha'), view('3', 'Gamma')], view('2', 'Beta'));
    expect(change.views?.map(v => v.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(change.reload).toBe(false);
  });

  test('with no list loaded the one saved item does not become the list; a reload is asked for', () => {
    expect(afterWrite(null, view('2', 'Beta'))).toEqual({ views: null, reload: true });
  });

  test('a delete removes the view from a loaded list and reloads an unloaded one', () => {
    expect(afterDelete([view('1', 'A'), view('2', 'B')], '1')).toEqual({ views: [view('2', 'B')], reload: false });
    expect(afterDelete(null, '1')).toEqual({ views: null, reload: true });
  });
});

describe('nameFieldReducer', () => {
  test('a failure shows its message under the current text', () => {
    expect(nameFieldReducer({ name: 'Taken', error: null }, { type: 'fail', message: 'That name is already used on this list.' }))
      .toEqual({ name: 'Taken', error: 'That name is already used on this list.' });
  });

  test('editing the name clears the error raised for the previous text', () => {
    expect(nameFieldReducer({ name: 'Taken', error: 'That name is already used on this list.' }, { type: 'edit', name: 'Taken 2' }))
      .toEqual({ name: 'Taken 2', error: null });
  });

  test('reopening the dialog starts from the given name with no error', () => {
    expect(nameFieldReducer({ name: 'x', error: 'boom' }, { type: 'reset', name: 'Critical bugs' }))
      .toEqual({ name: 'Critical bugs', error: null });
  });
});

describe('savedViewNameLength (the dialog counter)', () => {
  test('trims and counts code points', () => {
    expect(savedViewNameLength('  Critical bugs  ')).toBe(13);
    expect(savedViewNameLength('😀😀')).toBe(2);
  });

  test('counts the NFC form: a decomposed accent is one character, as on the server', () => {
    expect(savedViewNameLength('cafe\u0301')).toBe(4);
    expect(savedViewNameLength('caf\u00E9')).toBe(4);
    // 80 decomposed "é" read as 80 here, not 160.
    expect(savedViewNameLength('e\u0301'.repeat(80))).toBe(80);
  });

  test('agrees with the server schema at the boundary, in either spelling', () => {
    for (const unit of ['e\u0301', '\u00E9', 'x']) {
      for (const count of [SAVED_VIEW_NAME_MAX, SAVED_VIEW_NAME_MAX + 1]) {
        const name = unit.repeat(count);
        expect(savedViewNameLength(name) <= SAVED_VIEW_NAME_MAX).toBe(SavedViewNameSchema.safeParse(name).success);
      }
    }
  });
});
