import type { SavedViewState } from './state';
import type { SavedViewItem } from './view-model';
import { countCodePoints } from './constants';

// BK-443 — the derived state of the Saved views control as pure functions, so
// the rules that review findings on earlier stories kept catching ("UI derived
// state cleared on every edit", an in-flight flag that must not be render
// state) are testable without a DOM.

// A stable identity for a filter state, independent of key order.
export function stateKey(state: SavedViewState): string {
  return Object.entries(state)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

// The length the name dialog's counter shows: the name exactly as the server
// will count it (NFC, then trim, then code points), so a decomposed paste or an
// accent typed as a combining mark never reads longer here than it is there.
export function savedViewNameLength(name: string): number {
  return countCodePoints(name.normalize('NFC').trim());
}

// A notice (degraded restore, "nothing to save") is about ONE filter state. It
// is shown only while the surface still holds exactly that state, so the next
// edit of any filter makes it disappear instead of lingering over filters it no
// longer describes.
export interface MenuNotice {
  message: string
  forKey: string
}

export function visibleNotice(notice: MenuNotice | null, currentState: SavedViewState): string | null {
  return notice !== null && notice.forKey === stateKey(currentState) ? notice.message : null;
}

// The notice is dropped for good as soon as the surface no longer holds the
// state it was raised for. Hiding it is not enough: a notice that is merely
// hidden comes back when the filters happen to return to that state (a
// "Nothing to save" raised on an empty filter bar would reappear after the
// member applies a filter and then presses Reset).
export function pruneNotice(notice: MenuNotice | null, currentState: SavedViewState): MenuNotice | null {
  return notice !== null && notice.forKey === stateKey(currentState) ? notice : null;
}

// The database's collation: ICU, locale en-US (Postgres `datlocprovider = i`).
// Comparing with `<` gave character-code order, so a list re-sorted here after
// a save disagreed with the API's for punctuation, digits and accents (BK-1172).
const NAME_COLLATOR = new Intl.Collator('en-US');

// Mirrors the database order: `name_key` (case-folded name) under that
// collation, then id. Postgres breaks a collation tie between different
// strings by their bytes, hence the code-order step before the id.
export function sortViews(views: readonly SavedViewItem[]): SavedViewItem[] {
  return [...views].sort((a, b) => {
    const left = a.name.toLowerCase();
    const right = b.name.toLowerCase();
    if (left !== right) { return NAME_COLLATOR.compare(left, right) || (left < right ? -1 : 1); }
    return a.id < b.id ? -1 : 1;
  });
}

export function upsertView(views: readonly SavedViewItem[], item: SavedViewItem): SavedViewItem[] {
  return sortViews([...views.filter(v => v.id !== item.id), item]);
}

export function removeView(views: readonly SavedViewItem[], id: string): SavedViewItem[] {
  return views.filter(v => v.id !== id);
}

// What a successful write does to the list. With no list loaded yet (it is
// still loading, or its load failed) the one saved item must NOT become the
// whole list and mark it ready: keep it unloaded and ask for a real load.
export interface ListChange {
  views: SavedViewItem[] | null
  reload: boolean
}

export function afterWrite(views: readonly SavedViewItem[] | null, item: SavedViewItem): ListChange {
  return views === null ? { views: null, reload: true } : { views: upsertView(views, item), reload: false };
}

export function afterDelete(views: readonly SavedViewItem[] | null, id: string): ListChange {
  return views === null ? { views: null, reload: true } : { views: removeView(views, id), reload: false };
}

// The name dialog's field: editing clears the error that was raised for the
// previous text, so a stale "already used" never sits under a changed name.
export interface NameFieldState {
  name: string
  error: string | null
}

export type NameFieldAction
  = | { type: 'reset', name: string }
    | { type: 'edit', name: string }
    | { type: 'fail', message: string };

export function nameFieldReducer(state: NameFieldState, action: NameFieldAction): NameFieldState {
  switch (action.type) {
    case 'reset': return { name: action.name, error: null };
    case 'edit': return { name: action.name, error: null };
    case 'fail': return { ...state, error: action.message };
  }
}

// The "active" view is the one the member last opened or saved. It is only
// meaningful while that view still exists; deleting it clears the marker, which
// is what makes "Update" disappear.
export function resolveActiveView(views: readonly SavedViewItem[] | null, activeId: string | null): SavedViewItem | null {
  if (views === null || activeId === null) { return null; }
  return views.find(v => v.id === activeId) ?? null;
}

// A synchronous re-entry guard. It lives in a ref, not in render state: two
// clicks inside one frame both read the same stale state, but the second
// `tryEnter()` sees the first one's mutation.
export interface SubmitGuard {
  tryEnter: () => boolean
  leave: () => void
}

export function createSubmitGuard(): SubmitGuard {
  let busy = false;
  return {
    tryEnter: () => {
      if (busy) { return false; }
      busy = true;
      return true;
    },
    leave: () => { busy = false; },
  };
}
