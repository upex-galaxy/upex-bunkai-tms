/**
 * @fileoverview Protected-file drift detection (feeds the parity report).
 *
 * Some files are deliberately NOT synced by the updater because every
 * downstream project adapts them (AI memory, env map, MCP registries, Claude
 * permissions). But the boilerplate keeps evolving those same files, so a
 * downstream project would silently miss the improvements forever.
 *
 * This module detects WHICH watchlist entries drifted. It NEVER edits any of
 * them. Per entry it:
 *
 *  1. Reads the upstream copy from the template clone (tempDir).
 *  2. Short-circuits when the local copy already matches upstream
 *     (whitespace-insensitive) — nothing to migrate.
 *  3. Fires ONLY when the UPSTREAM content changed since the last advice,
 *     tracked by a content hash in `.template/upstream-sha/<slug>.sha`
 *     (one nudge per upstream change, never on dry-run — afterApply is
 *     skipped there).
 *
 * The advisory itself (section-level evidence, the copy-paste prompt, the
 * persisted `.agents/prompts/parity-plan.md`) is rendered by
 * `updater-parity.ts`, which folds these entries into the single end-of-run
 * parity report next to compat errors, MCP set drift and held-back components.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ============================================================================
// TYPES
// ============================================================================

export interface ProtectedWatchEntry {
  /** Repo-relative path, forward slashes (e.g. `allurerc.mjs`). */
  path: string
  /** One-line human reason shown in the advisory table (why it is protected). */
  reason: string
  /**
   * Override for the sha-marker file. Only used by `CLAUDE.md` to keep its
   * legacy marker (`.template/claude-md.upstream.sha`) so repos that already
   * received the old single-file advisory are not re-nudged.
   */
  markerPath?: string
}

/** Default marker directory for watchlist entries (one .sha file per entry). */
const MARKER_DIR = '.template/upstream-sha';

// ============================================================================
// PURE HELPERS (exported for tests)
// ============================================================================

/** Whitespace-insensitive normalization for the "already identical" short-circuit. */
export function normalizeForCompare(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/g, '\n');
}

/** Stable filesystem-safe slug for an entry path (marker filename). */
export function markerSlug(entryPath: string): string {
  return entryPath.replace(/\\/g, '/').replace(/[^a-z0-9.-]+/gi, '_');
}

/** Resolve the marker file for an entry (legacy override wins). */
export function resolveMarkerPath(entry: ProtectedWatchEntry, cwd: string): string {
  return path.join(cwd, entry.markerPath ?? path.join(MARKER_DIR, `${markerSlug(entry.path)}.sha`));
}

export interface DriftedEntry extends ProtectedWatchEntry {
  upstreamSha: string
  /** True when this is the first advice ever for this entry (no marker yet). */
  firstAdvice: boolean
}

/**
 * Detect which watchlist entries drifted: upstream exists, local exists,
 * local differs from upstream, and upstream changed since the last advice.
 * Pure with respect to markers — does NOT write them (see persistMarkers).
 */
export function detectProtectedDrift(
  entries: ProtectedWatchEntry[],
  tempDir: string,
  cwd: string,
): DriftedEntry[] {
  const drifted: DriftedEntry[] = [];
  for (const entry of entries) {
    const upstreamPath = path.join(tempDir, entry.path);
    const localPath = path.join(cwd, entry.path);
    // Both copies must exist: no upstream → nothing canonical to port; no
    // local → the project intentionally removed it, not ours to resurrect.
    if (!fs.existsSync(upstreamPath) || !fs.existsSync(localPath)) { continue; }

    let upstreamContent: string;
    let localContent: string;
    try {
      upstreamContent = fs.readFileSync(upstreamPath, 'utf8');
      localContent = fs.readFileSync(localPath, 'utf8');
    }
    catch { continue; }

    // Project tracks the boilerplate verbatim → nothing to suggest.
    if (normalizeForCompare(upstreamContent) === normalizeForCompare(localContent)) { continue; }

    const upstreamSha = crypto.createHash('sha256').update(upstreamContent, 'utf8').digest('hex');
    let lastSha = '';
    try {
      const markerPath = resolveMarkerPath(entry, cwd);
      if (fs.existsSync(markerPath)) { lastSha = fs.readFileSync(markerPath, 'utf8').trim(); }
    }
    catch { /* unreadable marker — treat as first advice */ }

    if (lastSha === upstreamSha) { continue; } // no NEW upstream change since last nudge

    drifted.push({ ...entry, upstreamSha, firstAdvice: lastSha === '' });
  }
  return drifted;
}

/**
 * Persist the upstream sha markers for the advised entries so each upstream
 * change nudges exactly once, even if the user ignores the advice.
 * Non-fatal on write failure — worst case we advise again next run.
 */
export function persistMarkers(drifted: DriftedEntry[], cwd: string): void {
  for (const entry of drifted) {
    try {
      const markerPath = resolveMarkerPath(entry, cwd);
      fs.mkdirSync(path.dirname(markerPath), { recursive: true });
      fs.writeFileSync(markerPath, `${entry.upstreamSha}\n`);
    }
    catch { /* non-fatal */ }
  }
}
