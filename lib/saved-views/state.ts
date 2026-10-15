import type { ViewKind } from './constants';
import { BUG_SEVERITY_VALUES, BUG_STATUS_VALUES } from '@lib/bugs/constants';
import { RUN_HISTORY_OUTCOMES } from '@lib/runs/history-constants';
import { isValidDateParam, RESULT_FILTER_VALUES } from '@lib/traceability/chain-view';
import { countCodePoints, SAVED_VIEW_TEXT_MAX } from './constants';

// BK-443 — the saved-view state codec. A view's `state` is the surface's own
// URL query-parameter map (flat string -> string), so "restores exactly what
// the address shows" and "reproducible by link" are the same data (AI Tech
// Lead decision, BK-443). Pure and framework-agnostic: client components, the
// routes and the tests all import it.
//
// Two modes per value:
//   * STRICT  — used on write. Any unknown key or invalid value is refused.
//   * LENIENT — used on read/restore. Unknown keys are ignored and invalid
//     list items are dropped, so a stale or hand-edited view degrades instead
//     of breaking (AC-12).

export type SavedViewState = Record<string, string>;

interface KeySpec {
  label: string
  // Returns the canonical value, or null when nothing valid is left. In strict
  // mode a single invalid item makes the whole value invalid.
  normalize: (raw: string, strict: boolean) => string | null
}

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

// Mirrors `ATC_TECHNIQUES` / `ATC_PRIORITIES` / `ATC_LAYERS` in
// `@lib/atcs/validation`, restated because that module pulls Zod into the
// client bundle; `state.test.ts` fails if they drift.
export const WORKBENCH_TECHNIQUES = [
  'Equivalence Partitioning',
  'Boundary Value Analysis',
  'State Transition',
  'Decision Table',
  'Pairwise',
] as const;
export const WORKBENCH_PRIORITIES = ['Critical', 'High', 'Medium', 'Low'] as const;
export const WORKBENCH_LAYERS = ['UI', 'API', 'Unit'] as const;
// The "Not specified" facet value, written in the address as a plain word.
export const FACET_UNSPECIFIED = 'unspecified';

function oneOf(allowed: readonly string[]): KeySpec['normalize'] {
  return raw => (allowed.includes(raw) ? raw : null);
}

// Comma list of allowed values -> canonical (allowed-list order, no duplicates).
function listOf(allowed: readonly string[]): KeySpec['normalize'] {
  return (raw, strict) => {
    const items = raw.split(',').map(v => v.trim()).filter(v => v !== '');
    if (strict && items.some(v => !allowed.includes(v))) { return null; }
    const picked = new Set(items);
    const ordered = allowed.filter(v => picked.has(v));
    return ordered.length > 0 ? ordered.join(',') : null;
  };
}

const uuid: KeySpec['normalize'] = raw => (UUID.test(raw) ? raw.toLowerCase() : null);
const date: KeySpec['normalize'] = raw => (isValidDateParam(raw) ? raw : null);
const text: KeySpec['normalize'] = (raw) => {
  const trimmed = raw.trim();
  return trimmed !== '' && countCodePoints(trimmed) <= SAVED_VIEW_TEXT_MAX ? trimmed : null;
};

const SPECS: Record<ViewKind, Record<string, KeySpec>> = {
  traceability: {
    result: { label: 'Result', normalize: listOf(RESULT_FILTER_VALUES) },
    module: { label: 'Module', normalize: uuid },
    from: { label: 'From date', normalize: date },
    to: { label: 'To date', normalize: date },
  },
  run_history: {
    outcome: { label: 'Outcome', normalize: oneOf(RUN_HISTORY_OUTCOMES) },
  },
  bugs: {
    module: { label: 'Module', normalize: uuid },
    status: { label: 'Status', normalize: listOf(BUG_STATUS_VALUES) },
    severity: { label: 'Severity', normalize: listOf(BUG_SEVERITY_VALUES) },
  },
  workbench: {
    atc_q: { label: 'ATC search', normalize: text },
    tag: { label: 'Test tag', normalize: text },
    technique: { label: 'Technique', normalize: oneOf([...WORKBENCH_TECHNIQUES, FACET_UNSPECIFIED]) },
    priority: { label: 'Priority', normalize: oneOf([...WORKBENCH_PRIORITIES, FACET_UNSPECIFIED]) },
    layer: { label: 'Layer', normalize: oneOf(WORKBENCH_LAYERS) },
  },
};

export function stateKeys(kind: ViewKind): string[] {
  return Object.keys(SPECS[kind]);
}

export function keyLabel(kind: ViewKind, key: string): string {
  return SPECS[kind][key]?.label ?? key;
}

// Canonical value for one key; null when it is unknown or invalid.
export function normalizeValue(kind: ViewKind, key: string, raw: string, strict: boolean): string | null {
  const spec = SPECS[kind][key];
  return spec ? spec.normalize(raw, strict) : null;
}

export function isStateEmpty(state: SavedViewState): boolean {
  return Object.keys(state).length === 0;
}

// The current address -> the saved-view state it would save. Lenient: a junk
// value is simply not part of the state.
export function stateFromParams(kind: ViewKind, params: URLSearchParams): SavedViewState {
  const state: SavedViewState = {};
  for (const key of stateKeys(kind)) {
    const raw = params.get(key);
    if (raw === null) { continue; }
    const value = normalizeValue(kind, key, raw, false);
    if (value !== null) { state[key] = value; }
  }
  return state;
}

// Writes `state` into a copy of `params`, clearing exactly this kind's keys
// first and leaving every foreign param (`?story=`, the Command Palette's
// `?module=` on the workbench) alone — the shape of BK-717's
// `mergeFilterParamsIntoUrl`. An axis the state does not hold is cleared, which
// is what makes opening a view REPLACE the applied filters (business rule 5).
export function mergeStateIntoParams(kind: ViewKind, params: URLSearchParams, state: SavedViewState): URLSearchParams {
  const merged = new URLSearchParams(params);
  for (const key of stateKeys(kind)) { merged.delete(key); }
  for (const [key, value] of Object.entries(state)) {
    if (SPECS[kind][key]) { merged.set(key, value); }
  }
  return merged;
}

export type StateRefusal = 'state_empty' | 'state_invalid' | 'date_range_inverted';

// Write-time check: every key known, every value valid, at least one filter,
// and a date range that is not inverted (the live Traceability view ignores an
// inverted range, so saving one would save a no-op). Returns the canonical
// state to store.
export function validateStateForKind(kind: ViewKind, input: SavedViewState): { ok: true, state: SavedViewState } | { ok: false, reason: StateRefusal } {
  const state: SavedViewState = {};
  for (const [key, raw] of Object.entries(input)) {
    const value = normalizeValue(kind, key, raw, true);
    if (value === null) { return { ok: false, reason: 'state_invalid' }; }
    state[key] = value;
  }
  if (isStateEmpty(state)) { return { ok: false, reason: 'state_empty' }; }
  if (state.from !== undefined && state.to !== undefined && state.from > state.to) {
    return { ok: false, reason: 'date_range_inverted' };
  }
  return { ok: true, state };
}
