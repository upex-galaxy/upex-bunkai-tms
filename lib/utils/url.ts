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
