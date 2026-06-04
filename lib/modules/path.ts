// Framework-agnostic module-tree helpers. No React/Next/Bun/Supabase imports —
// safe to import from server routes and unit tests alike. The `modules` table
// stores a materialized, slash-separated `path` (NO leading slash) and a
// per-sibling `position`; these pure helpers centralise the path/depth/position
// math so the route stays thin and the rules are unit-testable without a DB.

// Build a child module's materialized path from its parent path and own slug.
// Root modules (empty parent path) get just their own segment — never a leading
// slash. Callers pass an already-slugified `segment`.
export function buildModulePath(parentPath: string, segment: string): string {
  return parentPath ? `${parentPath}/${segment}` : segment;
}

// Depth of a materialized path = number of slash-separated segments. A root
// path ('a') is depth 1; 'a/b/c' is depth 3. Empty string is depth 0.
export function computeDepth(path: string): number {
  return path === '' ? 0 : path.split('/').length;
}

// Next sibling position = highest existing position + 1; an empty sibling set
// yields 0, matching the table's `position` default. Best-effort, no hardened
// concurrency (two racing inserts can collide — acceptable for the MVP).
export function nextPosition(siblingPositions: number[]): number {
  return siblingPositions.reduce((max, p) => (p > max ? p : max), -1) + 1;
}

// Maximum module nesting depth (inclusive). The DB enforces the same bound via
// a CHECK constraint as a safety net; the app layer fails fast before insert.
export const MAX_MODULE_DEPTH = 6;
