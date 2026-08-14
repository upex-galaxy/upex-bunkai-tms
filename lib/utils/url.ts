// Framework-agnostic URL helpers. No React/Next/Bun imports — safe to import
// from server routes, client components, or unit tests. Mirrors
// `lib/utils/slug.ts`'s convention for small, single-purpose pure helpers.
//
// BK-40 — hoisted out of `lib/runs/mark-step-view.ts` (BK-35), which had it as
// a private helper backing its own evidence-link field validation. `lib/bugs`
// needs the identical check for evidence link URLs, so this is now the single
// shared source rather than a second copy drifting alongside it.

export function isValidUrl(value: string): boolean {
  try {
    void new URL(value);
    return true;
  }
  catch {
    return false;
  }
}

// BK-337 — the first scheme allowlist outside `components/markdown/
// markdown-renderer.tsx:19-31` (Tech Lead ruling, Scenario 3.4). `isValidUrl`
// above accepts ANY parseable scheme, including `javascript:` and `data:`
// (both parse fine as a bare `new URL(...)`) — safe for evidence links that
// only ever get RENDERED as inert text, but not safe once a value becomes an
// anchor's `href`. This is the render-time control the defect detail page
// uses to decide anchor-vs-text, and the same helper the filing-time Zod
// schema (`lib/bugs/validation.ts`) and its dialog counterpart
// (`BugFormDialog.tsx`) are tightened to use, so all three surfaces agree on
// what counts as an openable link.
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  }
  catch {
    return false;
  }
}
