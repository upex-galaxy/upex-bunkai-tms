/**
 * @fileoverview The brownfield guard of `/project-bootstrap`: is there already
 * an application in this repo?
 *
 * The bootstrap BASE phases (backend setup, frontend setup) only create: tables,
 * RLS, seed rows, Supabase clients, `middleware.ts`, the root layout, the
 * Tailwind theme, `shadcn init`, framework upgrades, README, demo pages. On an
 * application that already exists every one of those steps overwrites or
 * upgrades something live, so the skill refuses them there and routes to
 * `/project-adoption`. The add-on phases (OpenAPI, API routes, bearer auth, env
 * URLs, Supabase types) stay available: they read the `stack:` block instead.
 *
 * The verdict is computed here, not by the agent reading the tree, because a
 * gate keyed on a value the gated agent writes itself is fail-open
 * (AGENTS.md §3, GATE DESIGN). The skill runs `bun run bootstrap:guard` and
 * cites its output.
 *
 * Signals, strongest first, any one of them is enough:
 *
 *   - `adoption-lock`: `.template/installer.lock.json` records `adopted: true`
 *     (the updater's `--adopt` run wrote it);
 *   - `app-package`: a `package.json` declaring `next` or `react`, at the repo
 *     root, at the `stack.app_root` the yaml declares, or under `apps/*` /
 *     `packages/*` (the same search `detectStack` runs);
 *   - `app-files`: app code a greenfield checkout never carries, under that
 *     app root: a route tree, a middleware / proxy, a Tailwind config, a
 *     `components.json`, a migration directory holding files.
 *
 * A greenfield checkout (the boilerplate, or a project scaffolded from it
 * before `/project-bootstrap`) has none of them. Once the bootstrap's own
 * phases create the app, the guard reads `existing-app` too; that is why the
 * skill takes the verdict ONCE at entry and records it in its session plan.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { detectStack, readStack } from './stack-descriptor.ts';

// ============================================================================
// TYPES
// ============================================================================

export type GuardVerdict = 'greenfield' | 'existing-app';

export type GuardSignalKind = 'adoption-lock' | 'app-package' | 'app-files';

export interface GuardSignal {
  kind: GuardSignalKind
  /** The file or directory that carries the signal, relative to the repo root. */
  evidence: string
}

export interface GuardResult {
  verdict: GuardVerdict
  signals: GuardSignal[]
  /** The app roots that were inspected, relative to the repo root (`.` first). */
  inspected: string[]
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Written by the updater's `--adopt` run (`INSTALLER_LOCK_FILE` in `updater-adopt.ts`). */
export const ADOPTION_LOCK_FILE = '.template/installer.lock.json';

const PROJECT_YAML = '.agents/project.yaml';

/** Dependencies that make a `package.json` an application's. */
const APP_DEPENDENCIES = ['next', 'react'] as const;

/** Directories that only exist once an app does (they must hold entries). */
const APP_DIRS = ['app', 'src/app', 'pages', 'src/pages'] as const;

/** Files that only exist once an app does. */
const APP_FILES = [
  'middleware.ts',
  'middleware.js',
  'proxy.ts',
  'proxy.js',
  'src/middleware.ts',
  'src/middleware.js',
  'src/proxy.ts',
  'src/proxy.js',
  'tailwind.config.ts',
  'tailwind.config.js',
  'tailwind.config.mjs',
  'tailwind.config.cjs',
  'components.json',
] as const;

/** Migration directories; one holding files means a schema already has history. */
const MIGRATION_DIRS = ['supabase/migrations', 'prisma/migrations', 'drizzle', 'db/migrations', 'migrations'] as const;

// ============================================================================
// HELPERS
// ============================================================================

function hasEntries(dir: string): boolean {
  try { return statSync(dir).isDirectory() && readdirSync(dir).some(name => !name.startsWith('.')); }
  catch { return false; }
}

function rel(appRoot: string, path: string): string {
  return appRoot === '.' ? path : `${appRoot}/${path}`;
}

/** True when the installer lock says this repo was adopted. Never throws. */
export function readAdoptionLock(repoRoot: string): boolean {
  try {
    const parsed = JSON.parse(readFileSync(join(repoRoot, ADOPTION_LOCK_FILE), 'utf8')) as { adopted?: unknown };
    return parsed.adopted === true;
  }
  catch {
    return false;
  }
}

/** The `stack.app_root` the yaml declares, or null (no yaml, no block, unparseable). */
function declaredAppRoot(repoRoot: string): string | null {
  let text: string;
  try { text = readFileSync(join(repoRoot, PROJECT_YAML), 'utf8'); }
  catch { return null; }
  const value = readStack(text).values.app_root;
  if (typeof value !== 'string' || value.trim() === '') { return null; }
  return value.replace(/^\.\/+/, '').replace(/\/+$/, '') || '.';
}

/** The app dependency a `package.json` declares, or null. */
function appDependency(file: string): string | null {
  try {
    const pkg = JSON.parse(readFileSync(file, 'utf8')) as { dependencies?: Record<string, string>, devDependencies?: Record<string, string> };
    const all = { ...pkg.devDependencies, ...pkg.dependencies };
    return APP_DEPENDENCIES.find(dep => dep in all) ?? null;
  }
  catch {
    return null;
  }
}

// ============================================================================
// GUARD
// ============================================================================

/** Inspect a repo and say whether an application already lives in it. Never throws. */
export function detectExistingApp(repoRoot: string): GuardResult {
  const signals: GuardSignal[] = [];

  if (readAdoptionLock(repoRoot)) {
    signals.push({ kind: 'adoption-lock', evidence: `${ADOPTION_LOCK_FILE} records adopted: true` });
  }

  const roots = ['.'];
  const add = (root: string | null): void => {
    if (root !== null && !roots.includes(root)) { roots.push(root); }
  };
  add(declaredAppRoot(repoRoot));
  const detection = detectStack(repoRoot);
  const detected = detection.fields.app_root?.value;
  add(typeof detected === 'string' ? detected : null);

  for (const root of roots) {
    const dir = join(repoRoot, root);
    if (!existsSync(dir)) { continue; }

    const dep = appDependency(join(dir, 'package.json'));
    if (dep !== null) { signals.push({ kind: 'app-package', evidence: `${rel(root, 'package.json')} declares ${dep}` }); }

    for (const d of APP_DIRS) {
      if (hasEntries(join(dir, d))) { signals.push({ kind: 'app-files', evidence: `${rel(root, d)}/` }); }
    }
    for (const f of APP_FILES) {
      if (existsSync(join(dir, f))) { signals.push({ kind: 'app-files', evidence: rel(root, f) }); }
    }
    for (const m of MIGRATION_DIRS) {
      if (hasEntries(join(dir, m))) { signals.push({ kind: 'app-files', evidence: `${rel(root, m)}/ holds files` }); }
    }
  }

  return { verdict: signals.length > 0 ? 'existing-app' : 'greenfield', signals, inspected: roots };
}
