import type { SavedViewState } from './state';
import type { SavedViewItem } from './view-model';

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

// Mirrors the database order: case-folded name, then id.
export function sortViews(views: readonly SavedViewItem[]): SavedViewItem[] {
  return [...views].sort((a, b) => {
    const left = a.name.toLowerCase();
    const right = b.name.toLowerCase();
    if (left !== right) { return left < right ? -1 : 1; }
    return a.id < b.id ? -1 : 1;
  });
}

export function upsertView(views: readonly SavedViewItem[], item: SavedViewItem): SavedViewItem[] {
  return sortViews([...views.filter(v => v.id !== item.id), item]);
}

export function removeView(views: readonly SavedViewItem[], id: string): SavedViewItem[] {
  return views.filter(v => v.id !== id);
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
