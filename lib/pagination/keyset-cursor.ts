// BK-49 — generic base64url keyset-cursor codec, extracted out of
// `lib/runs/history-validation.ts`'s (startedAt, id) cursor (Decision 4,
// implementation-plan.md: the activity feed is a SECOND stable-shape
// consumer of the same algorithm, which meets CLAUDE.md §10's DRY
// threshold). Zero imports and field-neutral naming (`timestamp`, not
// `startedAt`) — this module has no idea what the timestamp measures, so it
// is usable from any future keyset-paged list, a unit test, or a
// `'use client'` component without dragging in Zod or a domain schema graph.
//
// Runs' own `lib/runs/history-validation.ts` is deliberately NOT refactored
// to import this module in this story (surgical-changes rule) — a follow-up
// tech-story consolidates the two callers onto this one implementation.

export interface KeysetCursor {
  timestamp: string
  id: string
}

// `ok: false` → the token was present but is not a decodable cursor. Mirrors
// the Runs cursor's `RunCursorDecode` idiom so a caller answers 400 instead
// of silently falling back to the first page.
export type KeysetCursorDecode = { ok: true, cursor: KeysetCursor } | { ok: false };

const CURSOR_SEPARATOR = '|';

// Postgres serializes a timestamptz into jsonb as ISO 8601 with an offset
// (e.g. `2026-07-29T11:52:00+00:00`); accept that plus the `Z` / no-offset
// and fractional-second variants, and require the value to be a real instant.
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/;

const UUID_RE = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

// Opaque wire token: base64url of `${timestamp}|${id}`. base64 (not JSON, not
// raw values) keeps the pagination shape a server-owned implementation
// detail, changeable without breaking callers. The URL-SAFE alphabet matters:
// standard base64 emits `+`, `/`, `=`, and a consumer that concatenates
// (rather than routing through URLSearchParams) would put a literal `+` in
// the query string, which decodes back as a SPACE — see
// `lib/runs/history-validation.ts`'s longer note on this exact hazard, ported
// verbatim here since the mechanics are identical.
function toBase64Url(standard: string): string {
  return standard.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function encodeKeysetCursor(cursor: KeysetCursor): string {
  return toBase64Url(btoa(`${cursor.timestamp}${CURSOR_SEPARATOR}${cursor.id}`));
}

// Decode + fully validate a wire cursor. Every failure mode — non-base64,
// wrong field count, unparseable timestamp, non-uuid id — collapses into
// `ok: false`. Accepts BOTH the base64url and standard-base64 alphabets on
// the way in (lossless either way — neither `-` nor `_` appears in the
// standard alphabet) so a token minted by a future caller before some later
// encoding change keeps decoding.
export function decodeKeysetCursor(raw: string): KeysetCursorDecode {
  let decoded: string;
  try {
    const standard = raw.replaceAll('-', '+').replaceAll('_', '/');
    // `atob` requires the `=` padding that base64url strips.
    const padded = standard.padEnd(standard.length + ((4 - (standard.length % 4)) % 4), '=');
    decoded = atob(padded);
  }
  catch {
    return { ok: false };
  }

  const parts = decoded.split(CURSOR_SEPARATOR);
  if (parts.length !== 2) {
    return { ok: false };
  }

  const [timestamp, id] = parts;
  if (!ISO_TIMESTAMP_RE.test(timestamp) || Number.isNaN(Date.parse(timestamp))) {
    return { ok: false };
  }
  if (!UUID_RE.test(id)) {
    return { ok: false };
  }

  return { ok: true, cursor: { timestamp, id } };
}
