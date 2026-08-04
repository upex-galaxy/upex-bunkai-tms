import type { NotificationChannel } from '@lib/notification-preferences/constants';
import {
  CHANNELS,
  DEFAULT_ENABLED_EDITABLE,
  EDITABLE_EVENT_TYPES,
  LOCKED_EVENT_TYPE,
} from '@lib/notification-preferences/constants';

// BK-213 — pure grid-assembly logic, split out of `response.ts` so it is
// unit-testable with plain arrays (no `db`, no DOM), mirroring
// `lib/tokens/view-state.ts`'s pattern of keeping data-shaping logic
// framework-agnostic and separately testable from the route.

export interface PreferenceCell {
  event_type: string
  channel: NotificationChannel
  enabled: boolean
  locked: boolean
}

export interface PreferenceRowRecord {
  event_type: string
  channel: string
  enabled: boolean
}

// Merges the caller's stored rows (possibly a subset, possibly empty --
// AC1: "run lifecycle and bug lifecycle show their current values with both
// channels on by default") with the ratified defaults into the full,
// fixed-order grid the UI renders (mockup row order: run lifecycle, bug
// lifecycle, mentions). An absent row for an editable cell means "never
// touched, still on default" (`enabled: true`), NOT "off".
//
// The two `mentions` cells are ALWAYS synthesized here, never read from
// `rows` -- migration 0062's own INSERT/UPDATE RLS policies structurally
// forbid a `mentions` row from ever existing, so this function does not even
// look for one (AC5: "marked as coming soon and its toggles cannot be
// changed").
export function buildPreferenceGrid(rows: PreferenceRowRecord[]): PreferenceCell[] {
  const enabledByKey = new Map(rows.map(row => [cellKey(row.event_type, row.channel), row.enabled]));

  const editableCells: PreferenceCell[] = EDITABLE_EVENT_TYPES.flatMap(eventType =>
    CHANNELS.map(channel => ({
      event_type: eventType,
      channel,
      enabled: enabledByKey.get(cellKey(eventType, channel)) ?? DEFAULT_ENABLED_EDITABLE,
      locked: false,
    })),
  );

  const lockedCells: PreferenceCell[] = CHANNELS.map(channel => ({
    event_type: LOCKED_EVENT_TYPE,
    channel,
    enabled: false,
    locked: true,
  }));

  return [...editableCells, ...lockedCells];
}

function cellKey(eventType: string, channel: string): string {
  return `${eventType}:${channel}`;
}
