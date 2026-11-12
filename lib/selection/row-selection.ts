// BK-507 — row selection as pure functions over a set of ids. Surface-agnostic on
// purpose (nothing here names an ATC or a Project): the workspace ATC Library, a
// Tests list or any other table adopts it through `useRowSelection`.
//
// The selection is a set of ids, NOT of rows, so it survives a filter change
// (E6): a row that is hidden by a filter stays selected, and `hiddenSelectedCount`
// says how many.

export type HeaderCheckState = 'none' | 'some' | 'all';

export function toggleId(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) { next.delete(id); }
  else { next.add(id); }
  return next;
}

// The header checkbox speaks about the rows the user can SEE.
export function headerCheckState(selected: ReadonlySet<string>, visibleIds: readonly string[]): HeaderCheckState {
  if (visibleIds.length === 0) { return 'none'; }
  const chosen = visibleIds.filter(id => selected.has(id)).length;
  if (chosen === 0) { return 'none'; }
  return chosen === visibleIds.length ? 'all' : 'some';
}

// Header click: every visible row selected -> deselect the visible rows (hidden
// selected rows stay); otherwise select every visible row.
export function toggleVisible(selected: ReadonlySet<string>, visibleIds: readonly string[]): Set<string> {
  const next = new Set(selected);
  if (headerCheckState(selected, visibleIds) === 'all') {
    for (const id of visibleIds) { next.delete(id); }
  }
  else {
    for (const id of visibleIds) { next.add(id); }
  }
  return next;
}

export function hiddenSelectedCount(selected: ReadonlySet<string>, visibleIds: readonly string[]): number {
  const visible = new Set(visibleIds);
  let hidden = 0;
  for (const id of selected) {
    if (!visible.has(id)) { hidden += 1; }
  }
  return hidden;
}

// A row that no longer exists (archived by someone else, a refresh) cannot stay
// selected.
export function restrictTo(selected: ReadonlySet<string>, existingIds: readonly string[]): Set<string> {
  const existing = new Set(existingIds);
  const next = new Set<string>();
  for (const id of selected) {
    if (existing.has(id)) { next.add(id); }
  }
  return next;
}
