import { hasAlphanumeric } from '@lib/utils/slug';

// Framework-agnostic module-tree helpers. No React/Next/Bun/Supabase imports —
// safe to import from server routes and unit tests alike. The `modules` table
// stores a materialized, slash-separated `path` (NO leading slash) and a
// per-sibling `position`; these pure helpers centralise the path/depth/position
// math so the route stays thin and the rules are unit-testable without a DB.

// Granular failure reasons for a module name, in the hybrid-error
// `details.reason` vocabulary shared with the create route.
export type ModuleNameError
  = | 'name_required'
    | 'name_too_short'
    | 'name_too_long'
    | 'name_no_alphanumeric';

export const MIN_MODULE_NAME = 2;
export const MAX_MODULE_NAME = 80;

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

// Validate a module name against the BK-10 rules (the server trims first).
// Returns the granular failure reason, or null when the trimmed name is
// acceptable. Adds `name_required` for the empty / whitespace-only case on top
// of the create route's length + alphanumeric rules.
export function moduleNameError(name: string): ModuleNameError | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return 'name_required';
  }
  if (trimmed.length < MIN_MODULE_NAME) {
    return 'name_too_short';
  }
  if (trimmed.length > MAX_MODULE_NAME) {
    return 'name_too_long';
  }
  if (!hasAlphanumeric(trimmed)) {
    return 'name_no_alphanumeric';
  }
  return null;
}

// True when `candidatePath` is the ancestor itself or sits under it. Used to
// exclude a module and its whole subtree from the valid move-target set (you
// cannot move a module under itself or its own descendant).
export function isDescendantPath(ancestorPath: string, candidatePath: string): boolean {
  return candidatePath === ancestorPath || candidatePath.startsWith(`${ancestorPath}/`);
}

// Resulting max depth after moving a subtree: every node's depth shifts by
// (newSourceDepth - oldSourceDepth). `newParentPath === null` moves to the root
// (the source lands at depth 1). The caller passes the subtree's current max
// depth; a result > MAX_MODULE_DEPTH means the move is rejected.
export function movedSubtreeMaxDepth(
  sourcePath: string,
  subtreeMaxDepth: number,
  newParentPath: string | null,
): number {
  const oldSourceDepth = computeDepth(sourcePath);
  const newSourceDepth = newParentPath === null ? 1 : computeDepth(newParentPath) + 1;
  return subtreeMaxDepth + (newSourceDepth - oldSourceDepth);
}

// Re-base a descendant's materialized path when an ancestor's slug changes.
// Pure mirror of the SQL `bunkai_update_module` rebuild: a path equal to the old
// prefix becomes the new prefix; a path under `${oldPrefix}/` has its prefix
// swapped; any unrelated path passes through unchanged. Centralises the rule so
// the trickiest part of rename is unit-testable without a database.
export function rebuildModulePath(oldPrefix: string, newPrefix: string, path: string): string {
  if (path === oldPrefix) {
    return newPrefix;
  }
  if (path.startsWith(`${oldPrefix}/`)) {
    return newPrefix + path.slice(oldPrefix.length);
  }
  return path;
}
