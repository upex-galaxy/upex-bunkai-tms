/**
 * What the boilerplate OWNS inside the namespaces an adopted app shares with it.
 *
 * Measured on a real app (U18-12): `scripts/` held the app's own scripts next
 * to the tooling's, and `.agents/skills/` held the app's own skills next to the
 * framework's (moved there from `.claude/skills/` by the cross-harness
 * migration). The tooling gates read whole folders, so the app's code failed
 * `tooling:types:check`, `tooling:lint:check` and `skills:check`, and the
 * pre-commit gate blocked every commit of the app.
 *
 * The answer is a list, not a guess: on an adopted repo every sync records the
 * `scripts/` files and the skill folders upstream ships, in the tracked
 * installer lock (`upstreamOwned`). The gates scope themselves to it. `cli/` is
 * the tooling's whole (the adoption refuses an app file there). A repo that is
 * not adopted, or a lock without the list, keeps the folder-wide behaviour:
 * greenfield is unchanged.
 *
 * Node built-ins only (`cli/**` import closure).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/** Same file `./updater-adopt.ts` writes; repeated here so this module stays a leaf. */
const INSTALLER_LOCK = path.join('.template', 'installer.lock.json');

/**
 * Where `--adopt` saves upstream's copy of each framework skill the app had
 * copied in by hand (gitignored with `.agents/prompts/`, single-use):
 * `project-adoption` replaces the app's copy from here on its own approval
 * line. While a copy waits here, `skills:check` leaves that skill alone.
 */
export const ADOPT_UPSTREAM_SKILLS_DIR = '.agents/prompts/adopt-upstream';

export interface UpstreamOwned {
  /** Repo-relative files under `scripts/` that upstream ships (forward slashes). */
  scripts: string[]
  /** Folder names under `.agents/skills/` that upstream ships. */
  skills: string[]
}

function readLock(root: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(root, INSTALLER_LOCK), 'utf8')) as unknown;
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  }
  catch { return null; }
}

function stringList(value: unknown): string[] | null {
  return Array.isArray(value) && value.every(v => typeof v === 'string') ? value : null;
}

/** Whether the installer lock records an adoption (`"adopted": true`); false on greenfield or with no lock. */
export function isAdoptedRepo(root: string): boolean {
  return readLock(root)?.adopted === true;
}

/** The recorded list on an adopted repo; null anywhere else (greenfield, or a lock written before the list existed). */
export function readUpstreamOwned(root: string): UpstreamOwned | null {
  const lock = readLock(root);
  if (lock === null || lock.adopted !== true) { return null; }
  const owned = lock.upstreamOwned as Record<string, unknown> | undefined;
  if (owned === undefined || owned === null || typeof owned !== 'object') { return null; }
  const scripts = stringList(owned.scripts);
  const skills = stringList(owned.skills);
  return scripts !== null && skills !== null ? { scripts, skills } : null;
}

function walk(dir: string, base: string, out: string[]): void {
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; }
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    const rel = path.relative(base, abs).replace(/\\/g, '/');
    if (e.isDirectory()) { walk(abs, base, out); }
    else if (e.isFile()) { out.push(rel); }
  }
}

/**
 * The list from an upstream checkout: every file under `scripts/` and every
 * folder of `.agents/skills/` with a `SKILL.md`, minus what this repo never
 * receives (`excluded`, the updater's repo-only rules).
 */
export function collectUpstreamOwned(upstreamDir: string, excluded: (rel: string) => boolean = () => false): UpstreamOwned {
  const files: string[] = [];
  walk(path.join(upstreamDir, 'scripts'), upstreamDir, files);
  const scripts = files.filter(f => !excluded(f)).sort();
  let skills: string[] = [];
  try {
    skills = fs.readdirSync(path.join(upstreamDir, '.agents', 'skills'), { withFileTypes: true })
      .filter(e => e.isDirectory() && fs.existsSync(path.join(upstreamDir, '.agents', 'skills', e.name, 'SKILL.md')))
      .map(e => e.name)
      .sort();
  }
  catch { skills = []; }
  return { scripts, skills };
}

/** Records the list in the installer lock of an ADOPTED repo (merge, other keys kept). No-op anywhere else. */
export function writeUpstreamOwned(root: string, owned: UpstreamOwned): boolean {
  const lock = readLock(root);
  if (lock === null || lock.adopted !== true) { return false; }
  const next = { ...lock, upstreamOwned: owned };
  const text = `${JSON.stringify(next, null, 2)}\n`;
  const file = path.join(root, INSTALLER_LOCK);
  if (fs.readFileSync(file, 'utf8') === text) { return false; }
  fs.writeFileSync(file, text);
  return true;
}

/**
 * True when `rel` (repo-relative) belongs to the tooling on this repo:
 * anything under `cli/`, a listed `scripts/` file, or a file of a listed
 * skill. With no list (greenfield) every path under the tooling folders
 * belongs, exactly as the folder-wide checks always assumed.
 */
export function isToolingPath(rel: string, owned: UpstreamOwned | null): boolean {
  const p = rel.replace(/\\/g, '/').replace(/^\.\//, '');
  if (p.startsWith('cli/')) { return true; }
  if (p.startsWith('scripts/')) { return owned === null || owned.scripts.includes(p); }
  const skill = /^\.agents\/skills\/([^/]+)\//.exec(p);
  if (skill) { return owned === null || owned.skills.includes(skill[1]); }
  return owned === null;
}

/** True when the skill folder `name` is the framework's on this repo (always, without a list). */
export function isToolingSkill(name: string, owned: UpstreamOwned | null): boolean {
  return owned === null || owned.skills.includes(name);
}
