/**
 * @fileoverview The `stack:` block of `.agents/project.yaml`: the application's
 * real stack, structured, so a skill reads a value instead of hardcoding one.
 *
 * Three consumers share this module:
 *
 *   - `bun run agents:setup --stack` DETECTS the stack from the repo and writes
 *     it into the block (interactive: one prompt per field that differs), then
 *     fills the identity leaves that restate it (`backend_stack`, `db_type`,
 *     the entry points) where they are still null (`writeDerivedIdentity`).
 *   - `bun run setup:doctor` VALIDATES the block and reports drift between
 *     what it declares and what the repo shows. Informational, never a failure.
 *   - the schema gate in `agents-schema.test.ts` reads `STACK_FIELDS` to know
 *     that every placeholder under `stack:` has a prompt.
 *
 * The greenfield defaults are NOT a constant here. They live in the block of
 * the boilerplate's own yaml, travel into `.agents/project.schema.yaml` as
 * methodology (non-null leaves are kept), and a new project is seeded from
 * that schema. One source, no copy to drift.
 *
 * Detection only ever PROPOSES. A field it cannot read from the repo is
 * `undefined` (left as the yaml has it), never guessed: an invented value here
 * is a wrong command in every skill that reads it.
 */

import type { SpliceEdit } from './agents-schema.ts';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { parse as parseYaml } from 'yaml';
import { applyInsertions, applySplices, locateLeaf, planInsertions, projectDelta } from './agents-schema.ts';

// ============================================================================
// THE FIELDS
// ============================================================================

export interface StackField {
  /** Dotted path below `stack.` (`database.schema_source`). */
  path: string
  /** Allowed values; `null` = free text (a path, a script name, an alias). */
  values: readonly string[] | null
  /** Whether `null` is a legitimate answer (the app has no such thing). */
  nullable: boolean
  /** Prompt label. */
  label: string
}

export const STACK_BLOCK = 'stack';

/**
 * Every leaf of the block, in yaml order. Adding a key to the yaml without
 * adding it here fails `stack-descriptor.test.ts` by name.
 */
export const STACK_FIELDS: readonly StackField[] = [
  { path: 'app_root', values: null, nullable: false, label: 'Directory holding the app\'s package.json' },
  { path: 'framework', values: ['nextjs-app-router', 'nextjs-pages', 'other'], nullable: false, label: 'Framework' },
  { path: 'package_manager', values: ['bun', 'pnpm', 'npm', 'yarn'], nullable: false, label: 'Package manager' },
  { path: 'scripts.dev', values: null, nullable: true, label: 'Script name: dev server' },
  { path: 'scripts.build', values: null, nullable: true, label: 'Script name: production build' },
  { path: 'scripts.lint', values: null, nullable: true, label: 'Script name: lint' },
  { path: 'scripts.types', values: null, nullable: true, label: 'Script name: type check' },
  { path: 'scripts.test', values: null, nullable: true, label: 'Script name: tests' },
  { path: 'scripts.db_types', values: null, nullable: true, label: 'Script name: regenerate database types' },
  { path: 'database.engine', values: ['postgres', 'other', 'none'], nullable: false, label: 'Database engine' },
  { path: 'database.provider', values: ['supabase', 'other', 'none'], nullable: false, label: 'Database provider' },
  { path: 'database.schema_source', values: ['live', 'migrations'], nullable: false, label: 'Schema source project-context trusts' },
  { path: 'database.migrations_dir', values: null, nullable: true, label: 'Migration files directory' },
  { path: 'database.migrations_tool', values: ['supabase-mcp', 'supabase-cli', 'prisma', 'drizzle', 'none'], nullable: false, label: 'How a schema change is applied' },
  { path: 'database.types_path', values: null, nullable: true, label: 'Generated database types file' },
  { path: 'ui.css', values: ['tailwind-v3', 'tailwind-v4', 'css-modules', 'other'], nullable: false, label: 'CSS approach' },
  { path: 'ui.kit', values: ['shadcn', 'other', 'none'], nullable: false, label: 'Component kit' },
  { path: 'ui.icons', values: ['lucide', 'other', 'none'], nullable: false, label: 'Icon library' },
  { path: 'hosting', values: ['vercel', 'netlify', 'other', 'none'], nullable: false, label: 'Hosting' },
  { path: 'ci', values: ['github-actions', 'gitlab', 'other', 'none'], nullable: false, label: 'CI' },
  { path: 'test_runner', values: ['vitest', 'jest', 'bun', 'playwright', 'other', 'none'], nullable: true, label: 'Test runner' },
  { path: 'conventions.import_alias', values: null, nullable: true, label: 'Source import alias' },
  { path: 'conventions.testid_style', values: null, nullable: true, label: 'Test-id attribute and case' },
];

/** What the v1 skills support (owner decisions OD2 / OD3); anything else stops at analysis. */
export const V1_SUPPORTED: Readonly<Record<string, readonly string[]>> = {
  'package_manager': ['bun'],
  'framework': ['nextjs-app-router', 'nextjs-pages'],
  'database.engine': ['postgres', 'none'],
};

export type StackValues = Record<string, string | null>;

// ============================================================================
// READ
// ============================================================================

export interface StackRead {
  /** False when the yaml has no `stack:` block at all. */
  present: boolean
  /** Field path -> value. A field absent from the block is absent here. */
  values: StackValues
  /** Set when the yaml does not parse. */
  error: string | null
}

function getIn(node: unknown, path: readonly string[]): { found: boolean, value: unknown } {
  let cur: unknown = node;
  for (const seg of path) {
    if (cur === null || typeof cur !== 'object' || Array.isArray(cur) || !(seg in (cur as Record<string, unknown>))) {
      return { found: false, value: undefined };
    }
    cur = (cur as Record<string, unknown>)[seg];
  }
  return { found: true, value: cur };
}

export function readStack(yamlText: string): StackRead {
  let root: unknown;
  try { root = parseYaml(yamlText); }
  catch (e) { return { present: false, values: {}, error: `.agents/project.yaml does not parse: ${(e as Error).message}` }; }
  const block = getIn(root, [STACK_BLOCK]);
  if (!block.found || block.value === null || typeof block.value !== 'object') {
    return { present: false, values: {}, error: null };
  }
  const values: StackValues = {};
  for (const field of STACK_FIELDS) {
    const hit = getIn(block.value, field.path.split('.'));
    if (!hit.found) { continue; }
    values[field.path] = hit.value === null || hit.value === undefined ? null : String(hit.value);
  }
  return { present: true, values, error: null };
}

// ============================================================================
// VALIDATE
// ============================================================================

export interface StackIssue {
  path: string
  message: string
}

/** Shape problems only: a missing key, a null where null is not an answer, a value outside its set. */
export function validateStack(read: StackRead): StackIssue[] {
  if (!read.present) { return []; }
  const issues: StackIssue[] = [];
  for (const field of STACK_FIELDS) {
    if (!(field.path in read.values)) {
      issues.push({ path: field.path, message: 'missing from the block' });
      continue;
    }
    const value = read.values[field.path];
    if (value === null) {
      if (!field.nullable) { issues.push({ path: field.path, message: 'is null, and null is not an answer for this field' }); }
      continue;
    }
    if (field.values !== null && !field.values.includes(value)) {
      issues.push({ path: field.path, message: `\`${value}\` is not one of ${field.values.join(' | ')}` });
    }
  }
  return issues;
}

/** Values the v1 skills do not support (OD2 / OD3): a project-adoption stop reason, not a shape error. */
export function unsupportedInV1(values: StackValues): StackIssue[] {
  const issues: StackIssue[] = [];
  for (const [path, allowed] of Object.entries(V1_SUPPORTED)) {
    const value = values[path];
    if (value !== null && value !== undefined && !allowed.includes(value)) {
      issues.push({ path, message: `\`${value}\` is outside what the skills support in v1 (${allowed.join(' | ')})` });
    }
  }
  return issues;
}

// ============================================================================
// DETECT
// ============================================================================

export interface Detection {
  value: string | null
  /** The file or fact the value was read from, shown beside the proposal. */
  evidence: string
}

export interface StackDetection {
  /** Field path -> what the repo shows. A field the repo says nothing about is absent. */
  fields: Record<string, Detection>
  /** Whether an application was found at all (a package.json declaring a framework dependency). */
  appFound: boolean
}

interface PackageJson {
  name?: string
  packageManager?: string
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

function readJson<T>(file: string): T | null {
  try { return JSON.parse(readFileSync(file, 'utf8')) as T; }
  catch { return null; }
}

function isDir(path: string): boolean {
  try { return statSync(path).isDirectory(); }
  catch { return false; }
}

function hasEntries(dir: string): boolean {
  try { return readdirSync(dir).some(name => !name.startsWith('.')); }
  catch { return false; }
}

function deps(pkg: PackageJson): Record<string, string> {
  return { ...pkg.devDependencies, ...pkg.dependencies };
}

/** Script names per role, in preference order: the first one the app declares wins. */
const SCRIPT_CANDIDATES: Readonly<Record<string, readonly string[]>> = {
  'scripts.dev': ['dev'],
  'scripts.build': ['build'],
  'scripts.lint': ['lint:check', 'lint'],
  'scripts.types': ['types:check', 'typecheck', 'type-check', 'check-types', 'tsc'],
  'scripts.test': ['test', 'test:unit'],
  'scripts.db_types': ['db:types', 'types:supabase', 'supabase:types', 'gen:types', 'db:generate'],
};

const MIGRATION_DIRS = ['supabase/migrations', 'prisma/migrations', 'drizzle', 'migrations', 'db/migrations'];

const TYPES_PATHS = [
  'src/types/supabase.ts',
  'types/supabase.ts',
  'src/types/database.types.ts',
  'types/database.types.ts',
  'src/lib/database.types.ts',
  'lib/database.types.ts',
  'database.types.ts',
];

/**
 * Where the app lives: the repo root when its package.json declares `next`,
 * else the first `apps/<name>` or `packages/<name>` that does. `null` when no
 * app is found (the boilerplate before /project-bootstrap, for one).
 */
function findAppRoot(repoRoot: string): string | null {
  const declaresNext = (dir: string): boolean => {
    const pkg = readJson<PackageJson>(join(repoRoot, dir, 'package.json'));
    return pkg !== null && 'next' in deps(pkg);
  };
  if (declaresNext('.')) { return '.'; }
  for (const parent of ['apps', 'packages']) {
    if (!isDir(join(repoRoot, parent))) { continue; }
    for (const name of readdirSync(join(repoRoot, parent)).sort()) {
      if (declaresNext(`${parent}/${name}`)) { return `${parent}/${name}`; }
    }
  }
  return null;
}

/** Major version of a dependency range (`^3.4.1` -> 3), or null. */
function major(range: string | undefined): number | null {
  const m = range?.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

/**
 * Script names the updater appended to an ADOPTED app's package.json (the
 * sync lock records them as applied keys). Empty on a greenfield repo, where
 * those scripts are the project's own.
 */
export function toolingAppendedScripts(repoRoot: string): Set<string> {
  const installer = readJson<{ adopted?: unknown }>(join(repoRoot, '.template', 'installer.lock.json'));
  if (installer?.adopted !== true) { return new Set(); }
  const lock = readJson<{ packageJsonSync?: Record<string, Record<string, { appliedKeys?: unknown }>> }>(join(repoRoot, '.template', 'boilerplate.lock.json'));
  const applied = lock?.packageJsonSync?.['package.json']?.scripts?.appliedKeys;
  return new Set(Array.isArray(applied) ? applied.filter((k): k is string => typeof k === 'string') : []);
}

export function detectStack(repoRoot: string): StackDetection {
  const fields: Record<string, Detection> = {};
  const set = (path: string, value: string | null, evidence: string): void => { fields[path] = { value, evidence }; };

  // Repo-level facts, true with or without an app.
  const lockfiles: Array<[string, string]> = [['bun.lock', 'bun'], ['bun.lockb', 'bun'], ['pnpm-lock.yaml', 'pnpm'], ['yarn.lock', 'yarn'], ['package-lock.json', 'npm']];
  const lock = lockfiles.find(([file]) => existsSync(join(repoRoot, file)));
  if (lock) { set('package_manager', lock[1], lock[0]); }

  if (isDir(join(repoRoot, '.github', 'workflows')) && hasEntries(join(repoRoot, '.github', 'workflows'))) { set('ci', 'github-actions', '.github/workflows/'); }
  else if (existsSync(join(repoRoot, '.gitlab-ci.yml'))) { set('ci', 'gitlab', '.gitlab-ci.yml'); }

  const appRoot = findAppRoot(repoRoot);
  if (appRoot === null) { return { fields, appFound: false }; }

  const app = join(repoRoot, appRoot);
  const pkg = readJson<PackageJson>(join(app, 'package.json')) ?? {};
  const all = deps(pkg);
  const pkgFile = appRoot === '.' ? 'package.json' : `${appRoot}/package.json`;
  set('app_root', appRoot, `${pkgFile} declares next`);

  if (!lock && pkg.packageManager) {
    const pm = pkg.packageManager.split('@')[0];
    if (['bun', 'pnpm', 'npm', 'yarn'].includes(pm)) { set('package_manager', pm, `${pkgFile} packageManager`); }
  }

  const appDir = ['app', 'src/app'].find(d => isDir(join(app, d)));
  const pagesDir = ['pages', 'src/pages'].find(d => isDir(join(app, d)));
  if (appDir) { set('framework', 'nextjs-app-router', `${appDir}/`); }
  else if (pagesDir) { set('framework', 'nextjs-pages', `${pagesDir}/`); }

  const scripts = pkg.scripts ?? {};
  // On an adopted app the tooling appended scripts of its own (`lint:check`,
  // `types:check`): they are the tooling's, never the app's role script.
  const appended = toolingAppendedScripts(repoRoot);
  for (const [path, candidates] of Object.entries(SCRIPT_CANDIDATES)) {
    const name = candidates.find(c => c in scripts && !appended.has(c));
    set(path, name ?? null, name ? `${pkgFile} scripts.${name}` : `${pkgFile} declares none of ${candidates.join(', ')}`);
  }

  // Database.
  const supabase = '@supabase/supabase-js' in all || '@supabase/ssr' in all || isDir(join(app, 'supabase'));
  const postgres = supabase || 'pg' in all || 'postgres' in all || '@neondatabase/serverless' in all;
  if (supabase) { set('database.provider', 'supabase', '@supabase dependency or supabase/ directory'); }
  if (postgres) { set('database.engine', 'postgres', supabase ? 'Supabase is Postgres' : `${pkgFile} postgres driver`); }

  const migrationsDir = MIGRATION_DIRS.find(d => isDir(join(app, d)) && hasEntries(join(app, d)));
  if (migrationsDir) {
    set('database.migrations_dir', migrationsDir, `${migrationsDir}/ holds files`);
    set('database.schema_source', 'migrations', `${migrationsDir}/ holds files`);
  }
  else if (postgres) {
    set('database.migrations_dir', null, 'no migration directory with files');
    set('database.schema_source', 'live', 'no migration files in the repo');
  }

  if ('prisma' in all || '@prisma/client' in all) { set('database.migrations_tool', 'prisma', `${pkgFile} prisma dependency`); }
  else if ('drizzle-kit' in all) { set('database.migrations_tool', 'drizzle', `${pkgFile} drizzle-kit dependency`); }
  else if (supabase) { set('database.migrations_tool', 'supabase-mcp', 'Supabase: changes go through the db MCP'); }

  const typesPath = TYPES_PATHS.find(p => existsSync(join(app, p)));
  if (typesPath) { set('database.types_path', typesPath, `${typesPath} exists`); }

  // UI.
  const tw = major(all.tailwindcss);
  if (tw === 3) { set('ui.css', 'tailwind-v3', `${pkgFile} tailwindcss ${all.tailwindcss}`); }
  else if (tw !== null && tw >= 4) { set('ui.css', 'tailwind-v4', `${pkgFile} tailwindcss ${all.tailwindcss}`); }
  if (existsSync(join(app, 'components.json'))) { set('ui.kit', 'shadcn', 'components.json'); }
  if ('lucide-react' in all) { set('ui.icons', 'lucide', `${pkgFile} lucide-react`); }

  // Hosting.
  if (existsSync(join(app, 'vercel.json')) || isDir(join(repoRoot, '.vercel'))) { set('hosting', 'vercel', 'vercel.json or .vercel/'); }
  else if (existsSync(join(app, 'netlify.toml'))) { set('hosting', 'netlify', 'netlify.toml'); }

  // Test runner.
  if ('vitest' in all) { set('test_runner', 'vitest', `${pkgFile} vitest`); }
  else if ('jest' in all) { set('test_runner', 'jest', `${pkgFile} jest`); }
  else if (/\bbun test\b/.test(scripts.test ?? '')) { set('test_runner', 'bun', `${pkgFile} scripts.test runs bun test`); }
  else if ('@playwright/test' in all) { set('test_runner', 'playwright', `${pkgFile} @playwright/test`); }

  // Import alias, from the app's tsconfig `paths`.
  const tsconfig = readJson<{ compilerOptions?: { paths?: Record<string, unknown> } }>(join(app, 'tsconfig.json'));
  const aliases = Object.keys(tsconfig?.compilerOptions?.paths ?? {});
  const alias = aliases.find(a => /^[@~#]\/\*$/.test(a));
  if (alias) { set('conventions.import_alias', alias.slice(0, -1), 'tsconfig.json compilerOptions.paths'); }

  return { fields, appFound: true };
}

// ============================================================================
// DRIFT
// ============================================================================

export interface StackDrift {
  path: string
  declared: string | null
  detected: string | null
  evidence: string
}

/** Fields where the repo shows something other than what the block declares. */
export function stackDrift(read: StackRead, detection: StackDetection): StackDrift[] {
  const drift: StackDrift[] = [];
  for (const field of STACK_FIELDS) {
    const hit = detection.fields[field.path];
    if (!hit) { continue; }
    const declared = read.values[field.path] ?? null;
    if (declared !== hit.value) { drift.push({ path: field.path, declared, detected: hit.value, evidence: hit.evidence }); }
  }
  return drift;
}

// ============================================================================
// WRITE — parser-located splices, never a re-serialization
// ============================================================================

function renderScalar(value: string | null): string {
  if (value === null) { return 'null'; }
  const plain = /^[\w./-][\w./:-]*$/.test(value) && !/^(?:null|true|false|yes|no|on|off|~)$/i.test(value) && !/^-?\d/.test(value);
  return plain ? value : `'${value.replace(/'/g, '\'\'')}'`;
}

export interface StackWrite {
  text: string
  /** Paths whose value changed. */
  changed: string[]
  /** Block paths inserted from the schema because the project lacked them. */
  inserted: string[]
  error: string | null
}

/**
 * Write `updates` into the `stack:` block of `projectText`.
 *
 * A project that lacks the block (or some of its keys) gets them inserted from
 * `schemaText` first, at the schema's position, with their comments: the same
 * insertion `bun sync` performs. Then each value is replaced in place. The
 * result is re-parsed and read back; any mismatch is an error and the input
 * text is returned untouched. NEVER `parseDocument(...).toString()`: it
 * rewraps folded scalars elsewhere in the file.
 */
export function writeStack(projectText: string, schemaText: string | null, updates: StackValues): StackWrite {
  let text = projectText;
  let inserted: string[] = [];

  const before = readStack(text);
  if (before.error) { return { text: projectText, changed: [], inserted: [], error: before.error }; }
  const missing = STACK_FIELDS.filter(f => !(f.path in before.values));
  if (missing.length > 0) {
    if (schemaText === null) {
      return { text: projectText, changed: [], inserted: [], error: 'the `stack:` block is incomplete and no schema is on disk to insert it from: run `bun sync`' };
    }
    const delta = projectDelta(text, schemaText);
    const paths = delta.gaps.filter(g => g.block === STACK_BLOCK).flatMap(g => g.paths);
    const plan = planInsertions(text, schemaText, paths);
    if (plan.error) { return { text: projectText, changed: [], inserted: [], error: plan.error }; }
    const applied = applyInsertions(text, plan);
    if (applied.error) { return { text: projectText, changed: [], inserted: [], error: applied.error }; }
    text = applied.text;
    inserted = plan.inserted;
  }

  const current = readStack(text);
  const edits: SpliceEdit[] = [];
  const changed: string[] = [];
  for (const [path, value] of Object.entries(updates)) {
    if (!STACK_FIELDS.some(f => f.path === path)) {
      return { text: projectText, changed: [], inserted: [], error: `\`stack.${path}\` is not a stack field` };
    }
    if ((current.values[path] ?? null) === value) { continue; }
    const located = locateLeaf(text, [STACK_BLOCK, ...path.split('.')]);
    if (!located) { return { text: projectText, changed: [], inserted: [], error: `could not locate \`stack.${path}\` in .agents/project.yaml` }; }
    edits.push({ range: located.value, text: renderScalar(value) });
    // A filled value answers its TODO.
    if (value !== null && located.trailingComment) {
      const comment = text.slice(located.trailingComment[0], located.trailingComment[1]);
      const cleaned = comment.replace(/^#\s*TODO:\s*/, '# ');
      if (cleaned !== comment) { edits.push({ range: located.trailingComment, text: cleaned }); }
    }
    changed.push(path);
  }
  text = applySplices(text, edits);

  const after = readStack(text);
  if (after.error) { return { text: projectText, changed: [], inserted: [], error: `the write produced a file that does not parse: ${after.error}` }; }
  for (const path of changed) {
    if ((after.values[path] ?? null) !== updates[path]) {
      return { text: projectText, changed: [], inserted: [], error: `read-back mismatch on \`stack.${path}\`` };
    }
  }
  return { text, changed, inserted, error: null };
}

// ============================================================================
// IDENTITY LEAVES DERIVED FROM THE STACK
// ============================================================================

/**
 * The identity leaves that restate what `stack:` already says, as free text
 * for a human reader. Dotted paths from the yaml root.
 */
export const DERIVED_IDENTITY_PATHS = [
  'backend.backend_stack',
  'backend.backend_entry',
  'frontend.frontend_stack',
  'frontend.frontend_entry',
  'database.db_type',
] as const;

const FRAMEWORK_LABEL: Readonly<Record<string, string>> = {
  'nextjs-app-router': 'Next.js (App Router)',
  'nextjs-pages': 'Next.js (Pages Router)',
};
const BACKEND_LABEL: Readonly<Record<string, string>> = {
  'nextjs-app-router': 'Next.js route handlers + server actions',
  'nextjs-pages': 'Next.js API routes',
};
const CSS_LABEL: Readonly<Record<string, string>> = {
  'tailwind-v3': 'Tailwind CSS v3',
  'tailwind-v4': 'Tailwind CSS v4',
  'css-modules': 'CSS Modules',
};
const KIT_LABEL: Readonly<Record<string, string>> = { shadcn: 'shadcn/ui' };

/** The router directory the framework reads, relative to `app_root`, when it exists. */
function routerDir(repoRoot: string, appRoot: string, framework: string): string | null {
  const names = framework === 'nextjs-app-router' ? ['src/app', 'app'] : ['src/pages', 'pages'];
  return names.find(name => isDir(join(repoRoot, appRoot, name))) ?? null;
}

/**
 * Derive the identity leaves from the `stack:` values. A leaf is derived only
 * from values that name something (`other`, `none` and null say nothing), and
 * an entry point only from a directory that exists on disk: nothing guessed.
 * Pure apart from the directory checks under `repoRoot`.
 */
export function deriveIdentity(values: StackValues, repoRoot: string): Record<string, string> {
  const out: Record<string, string> = {};
  const framework = values.framework ?? null;
  const provider = values['database.provider'] ?? null;
  const supabase = provider === 'supabase' ? ' + Supabase' : '';

  if (framework !== null && framework in FRAMEWORK_LABEL) {
    const ui = [CSS_LABEL[values['ui.css'] ?? ''], KIT_LABEL[values['ui.kit'] ?? '']].filter(Boolean);
    out['frontend.frontend_stack'] = [FRAMEWORK_LABEL[framework], ...ui].join(' + ');
    out['backend.backend_stack'] = `${BACKEND_LABEL[framework]}${supabase}`;

    const appRoot = values.app_root ?? '.';
    const prefix = appRoot === '.' || appRoot === '' ? '' : `${appRoot.replace(/\/+$/, '')}/`;
    const dir = routerDir(repoRoot, appRoot, framework);
    if (dir !== null) {
      out['frontend.frontend_entry'] = `${prefix}${dir}/`;
      const api = `${dir}/api`;
      out['backend.backend_entry'] = isDir(join(repoRoot, appRoot, api)) ? `${prefix}${api}/` : `${prefix}${dir}/`;
    }
  }

  if (values['database.engine'] === 'postgres') {
    out['database.db_type'] = provider === 'supabase' ? 'PostgreSQL (Supabase)' : 'PostgreSQL';
  }
  return out;
}

export interface IdentityWrite {
  text: string
  /** Leaf path -> the value written. Only leaves that were null before. */
  filled: Record<string, string>
  error: string | null
}

/**
 * Fill the identity leaves that are still null with what `deriveIdentity`
 * reads from the `stack:` block of `projectText`. A filled leaf is never
 * overwritten, an absent one is never inserted. Same splice and read-back
 * contract as `writeStack`.
 */
export function writeDerivedIdentity(projectText: string, repoRoot: string): IdentityWrite {
  const stack = readStack(projectText);
  if (stack.error) { return { text: projectText, filled: {}, error: stack.error }; }
  if (!stack.present) { return { text: projectText, filled: {}, error: null }; }

  let root: unknown;
  try { root = parseYaml(projectText); }
  catch (e) { return { text: projectText, filled: {}, error: (e as Error).message }; }

  const derived = deriveIdentity(stack.values, repoRoot);
  const edits: SpliceEdit[] = [];
  const filled: Record<string, string> = {};
  for (const path of DERIVED_IDENTITY_PATHS) {
    const value = derived[path];
    if (value === undefined) { continue; }
    const segments = path.split('.');
    const have = getIn(root, segments);
    if (!have.found || (have.value !== null && have.value !== undefined)) { continue; }
    const located = locateLeaf(projectText, segments);
    if (!located) { return { text: projectText, filled: {}, error: `could not locate \`${path}\` in .agents/project.yaml` }; }
    edits.push({ range: located.value, text: renderScalar(value) });
    if (located.trailingComment) {
      const comment = projectText.slice(located.trailingComment[0], located.trailingComment[1]);
      const cleaned = comment.replace(/^#\s*TODO:\s*(?:fill per project\s*(?:—|-)\s*)?/, '# ');
      if (cleaned !== comment) { edits.push({ range: located.trailingComment, text: cleaned }); }
    }
    filled[path] = value;
  }
  if (edits.length === 0) { return { text: projectText, filled: {}, error: null }; }

  const text = applySplices(projectText, edits);
  let after: unknown;
  try { after = parseYaml(text); }
  catch (e) { return { text: projectText, filled: {}, error: `the write produced a file that does not parse: ${(e as Error).message}` }; }
  for (const [path, value] of Object.entries(filled)) {
    if (getIn(after, path.split('.')).value !== value) {
      return { text: projectText, filled: {}, error: `read-back mismatch on \`${path}\`` };
    }
  }
  return { text, filled, error: null };
}

// ============================================================================
// DOCTOR
// ============================================================================

export interface StackDiagnostic {
  present: boolean
  appFound: boolean
  issues: StackIssue[]
  unsupported: StackIssue[]
  /** Includes a declared script the app's package.json lacks (detected `null`). */
  drift: StackDrift[]
  note: string | null
}

/** Everything `setup:doctor` reports about the block. Never throws. */
export function diagnoseStack(repoRoot: string, yamlText: string): StackDiagnostic {
  const read = readStack(yamlText);
  const empty: StackDiagnostic = { present: read.present, appFound: false, issues: [], unsupported: [], drift: [], note: null };
  if (read.error) { return { ...empty, note: read.error }; }
  if (!read.present) { return empty; }

  const detection = detectStack(repoRoot);
  const result: StackDiagnostic = {
    ...empty,
    appFound: detection.appFound,
    issues: validateStack(read),
    unsupported: unsupportedInV1(read.values),
  };
  // Before /project-bootstrap there is no app to compare against: the block
  // holds the shipped greenfield defaults, and reporting every script as
  // missing would be noise about a state that is expected.
  if (!detection.appFound) { return result; }

  result.drift = stackDrift(read, detection);
  return result;
}
