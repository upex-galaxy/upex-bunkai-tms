// Framework-agnostic project-slug validation. No React/Next imports — safe to
// import from server routes, client components, or unit tests.

// Reserved project slugs — list ratified in BK-8 AC-11 (Dev Q8). Deliberately
// SEPARATE from the workspace route's RESERVED_SLUGS: a project slug lives
// under /projects/{slug}, so it collides with a different URL surface
// (sub-routes like /projects/new) than a top-level workspace slug does.
export const RESERVED_PROJECT_SLUGS: ReadonlySet<string> = new Set([
  'api',
  'new',
  'create',
  'edit',
  'delete',
  'settings',
  'admin',
  'null',
  'undefined',
  'true',
  'false',
  'me',
  'self',
  'health',
  'docs',
  'openapi',
  'static',
  'public',
]);

// True when the derived slug is reserved. Callers must pass the FINAL slug —
// after any hash fallback — so the check covers exactly what would be stored.
export function isReservedProjectSlug(slug: string): boolean {
  return RESERVED_PROJECT_SLUGS.has(slug);
}
