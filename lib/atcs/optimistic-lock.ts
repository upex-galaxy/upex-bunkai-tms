// BK-96 — optimistic-lock version-token transport for ATC edits.
//
// The version token rides a CUSTOM header (`X-If-Match`), NOT the reserved RFC
// 7232 `If-Match`. The Vercel Edge Network evaluates `If-Match` itself and
// rewrites the response to a synthesized `412 PRECONDITION_FAILED` BEFORE the
// origin function's result is returned — so on Vercel the app can never use
// `If-Match` for application logic (the mutation still commits at origin, but
// the client only sees the edge 412). A custom header is invisible to that
// machinery. `If-Match` is still read as a fallback for non-Vercel deployments
// (the Phase-2 self-hosted edition has no edge). See .context/PBI/bugs/BUG-BK-96.

export const VERSION_HEADER = 'x-if-match';
export const VERSION_HEADER_FALLBACK = 'if-match';

// `version: null` → no precondition supplied (skip the optimistic-lock check).
// `ok: false` → a header was present but is not a plain decimal version.
export type VersionPrecondition = { ok: true, version: number | null } | { ok: false };

// Read the optimistic-lock version from the request headers. Canonical header
// wins; `If-Match` is the off-Vercel fallback. A present value must be a plain
// decimal version (the RFC 7232 weak prefix + quotes are stripped first):
// empty, hex/octal/exponential, etc. are rejected rather than silently coerced
// (`Number('')` is 0, `Number('0x1F')` is 31).
export function readVersionPrecondition(headers: Headers): VersionPrecondition {
  const raw = headers.get(VERSION_HEADER) ?? headers.get(VERSION_HEADER_FALLBACK);
  if (raw === null) {
    return { ok: true, version: null };
  }
  const cleaned = raw.trim().replace(/^W\//, '').replace(/^"|"$/g, '').trim();
  if (!/^\d+$/.test(cleaned)) {
    return { ok: false };
  }
  return { ok: true, version: Number(cleaned) };
}
