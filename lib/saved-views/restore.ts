import type { ViewKind } from './constants';
import type { SavedViewState } from './state';
import { SAVED_VIEW_COPY } from './constants';
import { keyLabel, normalizeValue } from './state';

// BK-443 AC-12 — opening a saved view whose targets have moved on degrades one
// filter at a time. The view itself is never deleted or edited by opening it;
// this only decides what to APPLY and what to TELL the member.

export interface DroppedFilter {
  key: string
  label: string
  reason: string
}

export interface RestoreResult {
  // What the surface should apply, canonical. Empty when nothing still applies.
  state: SavedViewState
  dropped: DroppedFilter[]
  // At least one filter was saved and none of them still applies.
  allDropped: boolean
}

export interface LiveOptions {
  // Active module ids on the surface that offers a module filter. Omit on a
  // surface that has none (a module id is then simply not part of its keys).
  moduleIds?: ReadonlySet<string>
}

const REASON_MODULE = 'the module was archived or removed';
const REASON_VALUE = 'it is no longer offered';
const REASON_PARTIAL = 'some of its values are no longer offered';

export function resolveRestore(kind: ViewKind, saved: SavedViewState, live: LiveOptions = {}): RestoreResult {
  const state: SavedViewState = {};
  const dropped: DroppedFilter[] = [];

  for (const [key, raw] of Object.entries(saved)) {
    const label = keyLabel(kind, key);
    const lenient = normalizeValue(kind, key, raw, false);
    if (lenient === null) {
      dropped.push({ key, label, reason: REASON_VALUE });
      continue;
    }
    if (key === 'module' && live.moduleIds && !live.moduleIds.has(lenient)) {
      dropped.push({ key, label, reason: REASON_MODULE });
      continue;
    }
    state[key] = lenient;
    if (normalizeValue(kind, key, raw, true) === null) {
      dropped.push({ key, label, reason: REASON_PARTIAL });
    }
  }

  const savedCount = Object.keys(saved).length;
  return { state, dropped, allDropped: savedCount > 0 && Object.keys(state).length === 0 };
}

// The message shown after opening a view; null when everything applied.
export function restoreNotice(result: RestoreResult): string | null {
  if (result.allDropped) { return SAVED_VIEW_COPY.allDropped; }
  if (result.dropped.length === 0) { return null; }
  const labels = result.dropped.map(d => d.label);
  const reasons = [...new Set(result.dropped.map(d => d.reason))].join('; ');
  const subject = labels.length === 1
    ? `The ${labels[0]} filter no longer applies`
    : `The ${labels.join(', ')} filters no longer apply`;
  return `${subject} (${reasons}). The other saved filters were applied.`;
}
