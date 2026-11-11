'use client';

import type { HeaderCheckState } from '@lib/selection/row-selection';
import { headerCheckState, hiddenSelectedCount, restrictTo, toggleId, toggleVisible } from '@lib/selection/row-selection';
import { useCallback, useMemo, useState } from 'react';

// BK-507 — React binding for `lib/selection/row-selection`. `allIds` is every row
// the table holds, `visibleIds` the rows its filters currently show; both should
// be memoised by the caller so the derived values stay referentially stable.

const NONE: ReadonlySet<string> = new Set();

export interface RowSelection {
  selected: ReadonlySet<string>
  count: number
  hiddenCount: number
  headerState: HeaderCheckState
  isSelected: (id: string) => boolean
  toggle: (id: string) => void
  toggleVisible: () => void
  replace: (ids: readonly string[]) => void
  clear: () => void
}

export function useRowSelection(allIds: readonly string[], visibleIds: readonly string[]): RowSelection {
  const [raw, setRaw] = useState<ReadonlySet<string>>(NONE);

  // Rows that vanished (archived elsewhere, a refresh) drop out of the selection.
  const selected = useMemo(() => restrictTo(raw, allIds), [raw, allIds]);
  const hiddenCount = useMemo(() => hiddenSelectedCount(selected, visibleIds), [selected, visibleIds]);
  const headerState = useMemo(() => headerCheckState(selected, visibleIds), [selected, visibleIds]);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);
  const toggle = useCallback((id: string) => setRaw(current => toggleId(restrictTo(current, allIds), id)), [allIds]);
  const toggleAllVisible = useCallback(
    () => setRaw(current => toggleVisible(restrictTo(current, allIds), visibleIds)),
    [allIds, visibleIds],
  );
  const replace = useCallback((ids: readonly string[]) => setRaw(new Set(ids)), []);
  const clear = useCallback(() => setRaw(NONE), []);

  return {
    selected,
    count: selected.size,
    hiddenCount,
    headerState,
    isSelected,
    toggle,
    toggleVisible: toggleAllVisible,
    replace,
    clear,
  };
}
