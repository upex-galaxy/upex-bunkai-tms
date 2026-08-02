import type { BugSeverity } from '@lib/bugs/constants';
import { BUG_SEVERITY_VALUES } from '@lib/bugs/constants';

// BK-41 (Decision 11) — bugs-local base64url keyset-cursor codec, 3 fields
// (severity, created_at, id) instead of `lib/pagination/keyset-cursor.ts`'s
// 2-field `{timestamp, id}` shape. The shared codec cannot carry the extra
// severity-primary sort key (Decision 5) without changing its signature and
// thereby its two existing consumers (Runs, Activity) — that file's own
// header already sanctions a per-domain wrapper for exactly this reason
// ("a follow-up tech-story consolidates the two callers", i.e. per-domain
// cursor wrappers are the norm here, not a shortcut). The WIRE contract
// (Decision 4: opaque token, malformed = 400, never a silent first page) is
// honored identically — only the internal payload shape differs.

export interface BugsCursor {
  severity: BugSeverity
  createdAt: string
  id: string
}

// `ok: false` → the token was present but is not a decodable cursor. Mirrors
// `lib/pagination/keyset-cursor.ts`'s `KeysetCursorDecode` idiom so a caller
// answers 400 instead of silently falling back to the first page.
export type BugsCursorDecode = { ok: true, cursor: BugsCursor } | { ok: false };

const CURSOR_SEPARATOR = '|';

// Postgres serializes a timestamptz into jsonb as ISO 8601 with an offset
// (e.g. `2026-07-29T11:52:00+00:00`); accept that plus the `Z` / no-offset
// and fractional-second variants, and require the value to be a real instant
// (mirrors `lib/pagination/keyset-cursor.ts`'s own regex verbatim).
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/;

const UUID_RE = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

// Opaque wire token: base64url of `${severity}|${createdAt}|${id}` — same
// base64 (not JSON, not raw values) rationale and URL-SAFE alphabet as
// `lib/pagination/keyset-cursor.ts`'s own `toBase64Url`, ported verbatim
// since the mechanics are identical.
function toBase64Url(standard: string): string {
  return standard.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function encodeBugsCursor(cursor: BugsCursor): string {
  return toBase64Url(btoa(`${cursor.severity}${CURSOR_SEPARATOR}${cursor.createdAt}${CURSOR_SEPARATOR}${cursor.id}`));
}

// Decode + fully validate a wire cursor. Every failure mode — non-base64,
// wrong field count, unrecognized severity, unparseable timestamp, non-uuid
// id — collapses into `ok: false`. Accepts both the base64url and standard-
// base64 alphabets on the way in, same as the shared codec.
export function decodeBugsCursor(raw: string): BugsCursorDecode {
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
  if (parts.length !== 3) {
    return { ok: false };
  }

  const [severity, createdAt, id] = parts;
  if (!BUG_SEVERITY_VALUES.includes(severity as BugSeverity)) {
    return { ok: false };
  }
  if (!ISO_TIMESTAMP_RE.test(createdAt) || Number.isNaN(Date.parse(createdAt))) {
    return { ok: false };
  }
  if (!UUID_RE.test(id)) {
    return { ok: false };
  }

  return { ok: true, cursor: { severity: severity as BugSeverity, createdAt, id } };
}
