/**
 * @fileoverview Tests for the `stack:` descriptor block.
 *
 * Detection runs against throwaway app trees built in a temp dir, one per
 * shape (greenfield boilerplate before bootstrap, a Next + Supabase app, a
 * monorepo, a non-default stack). The yaml contract runs against THIS repo's
 * real `.agents/project.yaml` and the schema generated from it, because the
 * block's greenfield defaults live there and nowhere else.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';

import { generateSchema, isMaintainerCopy, isSchemaOwner, SCHEMA_SOURCE, seedFromSchema, yamlLeafWalk } from './agents-schema.ts';
import {
  deriveIdentity,
  detectStack,
  diagnoseStack,
  readStack,
  STACK_FIELDS,
  stackDrift,
  unsupportedInV1,
  validateStack,
  writeDerivedIdentity,
  writeStack,
} from './stack-descriptor.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const realSource = (): string => readFileSync(join(REPO_ROOT, SCHEMA_SOURCE), 'utf8');
const realSchema = (): string => generateSchema(realSource()).schema;

/**
 * The boilerplate's own checkout: the package name AND the maintainer sentinel
 * (the same test `contractsEnforced` makes). Downstream the real yaml is the
 * project's own and generation refuses it, so the cases that read it as the
 * boilerplate's greenfield copy skip there, never fail.
 */
const MAINTAINER_CHECKOUT = isSchemaOwner(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) && isMaintainerCopy(realSource());

const roots: string[] = [];
afterEach(() => {
  while (roots.length > 0) { rmSync(roots.pop()!, { recursive: true, force: true }); }
});

/** A temp repo with the given files; a value of `null` creates a directory. */
function repo(files: Record<string, string | null>): string {
  const root = mkdtempSync(join(tmpdir(), 'stack-descriptor-'));
  roots.push(root);
  for (const [path, content] of Object.entries(files)) {
    if (content === null) { mkdirSync(join(root, path), { recursive: true }); continue; }
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

const pkg = (body: Record<string, unknown>): string => JSON.stringify(body, null, 2);

const NEXT_SUPABASE_APP = {
  'bun.lock': '',
  '.github/workflows/ci.yml': 'on: push\n',
  'vercel.json': '{}',
  'components.json': '{}',
  'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
  'src/app/page.tsx': 'export default function Page() {}\n',
  'src/types/supabase.ts': 'export type Database = {}\n',
  'supabase/migrations/20240101000000_init.sql': 'create table t ();\n',
  'package.json': pkg({
    name: 'some-app',
    scripts: { 'dev': 'next dev', 'build': 'next build', 'lint': 'next lint', 'typecheck': 'tsc --noEmit', 'test': 'vitest run', 'db:types': 'supabase gen types' },
    dependencies: { 'next': '15.0.0', '@supabase/supabase-js': '^2.0.0', 'lucide-react': '^0.4.0' },
    devDependencies: { tailwindcss: '^3.4.1', vitest: '^2.0.0' },
  }),
};

describe('the block in the real yaml', () => {
  test('STACK_FIELDS names every leaf of the block, in yaml order, and nothing else', () => {
    const walk = yamlLeafWalk(realSource())!;
    const containers = new Set(walk.containers);
    const leaves = [...walk.entries.keys()]
      .filter(p => p.startsWith('stack.') && !containers.has(p))
      .map(p => p.slice('stack.'.length));
    expect(leaves).toEqual(STACK_FIELDS.map(f => f.path));
  });

  test('the shipped greenfield defaults are valid and inside what v1 supports', () => {
    const read = readStack(realSource());
    expect(read.present).toBe(true);
    expect(validateStack(read)).toEqual([]);
    expect(unsupportedInV1(read.values)).toEqual([]);
  });

  test.skipIf(!MAINTAINER_CHECKOUT)('the generated schema carries the greenfield defaults verbatim (methodology, not identity)', () => {
    expect(readStack(realSchema()).values).toEqual(readStack(realSource()).values);
  });

  test.skipIf(!MAINTAINER_CHECKOUT)('a new project seeded from the schema starts with the block, valid', () => {
    const seeded = seedFromSchema(realSchema())!;
    const read = readStack(seeded);
    expect(read.present).toBe(true);
    expect(validateStack(read)).toEqual([]);
  });

  test.skipIf(!MAINTAINER_CHECKOUT)('legitimately-null leaves ship without a TODO prefix', () => {
    const block = realSchema().split('\nstack:\n')[1].split('\n\n')[0];
    expect(block).not.toContain('TODO');
  });
});

describe('detectStack', () => {
  test('an empty folder shows nothing', () => {
    expect(detectStack(repo({}))).toEqual({ fields: {}, appFound: false });
  });

  test('the boilerplate before /project-bootstrap: repo-level facts only, no app fields', () => {
    const root = repo({
      'bun.lock': '',
      '.github/workflows/ci.yml': 'on: push\n',
      'package.json': pkg({ name: 'x', scripts: { 'lint:check': 'eslint .', 'test': 'bun test cli/' } }),
    });
    const d = detectStack(root);
    expect(d.appFound).toBe(false);
    expect(Object.keys(d.fields).sort()).toEqual(['ci', 'package_manager']);
    expect(d.fields.package_manager.value).toBe('bun');
    expect(d.fields.ci.value).toBe('github-actions');
  });

  test('a Next.js App Router + Supabase app with migration files', () => {
    const d = detectStack(repo(NEXT_SUPABASE_APP));
    const values = Object.fromEntries(Object.entries(d.fields).map(([k, v]) => [k, v.value]));
    expect(d.appFound).toBe(true);
    expect(values).toEqual({
      'package_manager': 'bun',
      'ci': 'github-actions',
      'app_root': '.',
      'framework': 'nextjs-app-router',
      'scripts.dev': 'dev',
      'scripts.build': 'build',
      'scripts.lint': 'lint',
      'scripts.types': 'typecheck',
      'scripts.test': 'test',
      'scripts.db_types': 'db:types',
      'database.provider': 'supabase',
      'database.engine': 'postgres',
      'database.migrations_dir': 'supabase/migrations',
      'database.schema_source': 'migrations',
      'database.migrations_tool': 'supabase-mcp',
      'database.types_path': 'src/types/supabase.ts',
      'ui.css': 'tailwind-v3',
      'ui.kit': 'shadcn',
      'ui.icons': 'lucide',
      'hosting': 'vercel',
      'test_runner': 'vitest',
      'conventions.import_alias': '@/',
    });
    expect(d.fields['scripts.types'].evidence).toContain('scripts.typecheck');
  });

  test('a Supabase app with no migration files reads the live schema', () => {
    const files: Record<string, string | null> = { ...NEXT_SUPABASE_APP };
    delete files['supabase/migrations/20240101000000_init.sql'];
    const d = detectStack(repo(files));
    expect(d.fields['database.schema_source'].value).toBe('live');
    expect(d.fields['database.migrations_dir'].value).toBeNull();
  });

  test('a monorepo app under apps/, pnpm, pages router, prisma, tailwind v4, jest', () => {
    const root = repo({
      'pnpm-lock.yaml': '',
      'package.json': pkg({ name: 'mono', private: true }),
      'apps/web/package.json': pkg({
        name: 'web',
        scripts: { build: 'next build' },
        dependencies: { 'next': '14.0.0', '@prisma/client': '^5', 'pg': '^8' },
        devDependencies: { tailwindcss: '^4.0.0', jest: '^29' },
      }),
      'apps/web/pages/index.tsx': '',
      'apps/web/prisma/migrations/001/migration.sql': '',
    });
    const d = detectStack(root);
    expect(d.fields.app_root.value).toBe('apps/web');
    expect(d.fields.package_manager.value).toBe('pnpm');
    expect(d.fields.framework.value).toBe('nextjs-pages');
    expect(d.fields['database.migrations_tool'].value).toBe('prisma');
    expect(d.fields['database.migrations_dir'].value).toBe('prisma/migrations');
    expect(d.fields['database.provider']).toBeUndefined();
    expect(d.fields['ui.css'].value).toBe('tailwind-v4');
    expect(d.fields.test_runner.value).toBe('jest');
    expect(d.fields['scripts.dev'].value).toBeNull();
  });
});

describe('detectStack on an adopted app (measured: upexgalaxy-webapp)', () => {
  const ADOPTED = {
    'bun.lock': '',
    'app/page.tsx': 'export default function Page() {}\n',
    'types/database.types.ts': 'export type Database = {}\n',
    'package.json': pkg({
      name: 'webapp',
      // The app's own `lint` / `type-check`, plus the tooling's `lint:check` / `types:check` the adoption appended.
      scripts: { 'lint': 'eslint .', 'type-check': 'tsc --noEmit', 'lint:check': 'eslint .', 'types:check': 'tsc --noEmit' },
      dependencies: { 'next': '15.0.0', '@supabase/supabase-js': '^2.0.0' },
    }),
    '.template/installer.lock.json': '{ "adopted": true }\n',
    '.template/boilerplate.lock.json': JSON.stringify({ packageJsonSync: { 'package.json': { scripts: { appliedKeys: ['lint:check', 'types:check'] } } } }),
  };

  test('the app\'s own role scripts win over the ones the tooling appended', () => {
    const d = detectStack(repo(ADOPTED));
    expect(d.fields['scripts.lint'].value).toBe('lint');
    expect(d.fields['scripts.types'].value).toBe('type-check');
  });

  test('types/database.types.ts is a generated types path', () => {
    expect(detectStack(repo(ADOPTED)).fields['database.types_path'].value).toBe('types/database.types.ts');
  });

  test('greenfield (no adoption lock): the same scripts are the project\'s own', () => {
    const { '.template/installer.lock.json': _, ...greenfield } = ADOPTED;
    expect(detectStack(repo(greenfield)).fields['scripts.lint'].value).toBe('lint:check');
  });
});

describe('writeStack', () => {
  test('replaces values in place and leaves every other byte alone', () => {
    const source = realSource();
    const result = writeStack(source, realSchema(), { 'package_manager': 'pnpm', 'scripts.lint': 'lint', 'conventions.import_alias': '~/' });
    expect(result.error).toBeNull();
    expect(result.changed).toEqual(['package_manager', 'scripts.lint', 'conventions.import_alias']);
    const before = source.split('\n');
    const after = result.text.split('\n');
    expect(after.length).toBe(before.length);
    const differing = before.map((line, i) => [line, after[i]]).filter(([a, b]) => a !== b);
    expect(differing.map(([, b]) => b.trim().split(' #')[0])).toEqual(['package_manager: pnpm', 'lint: lint', 'import_alias: \'~/\'']);
    expect(readStack(result.text).values.package_manager).toBe('pnpm');
  });

  test('a value equal to the yaml is not a change', () => {
    const result = writeStack(realSource(), realSchema(), { package_manager: 'bun' });
    expect(result.changed).toEqual([]);
    expect(result.text).toBe(realSource());
  });

  test.skipIf(!MAINTAINER_CHECKOUT)('a project without the block gets it from the schema, at the schema\'s position', () => {
    const source = realSource();
    const start = source.indexOf('\n# The application\'s REAL stack');
    const end = source.indexOf('\nissue_tracker:');
    const stripped = source.slice(0, start) + source.slice(end - 1);
    expect(readStack(stripped).present).toBe(false);

    const result = writeStack(stripped, realSchema(), { 'database.schema_source': 'migrations' });
    expect(result.error).toBeNull();
    expect(result.inserted.length).toBeGreaterThan(0);
    const read = readStack(result.text);
    expect(validateStack(read)).toEqual([]);
    expect(read.values['database.schema_source']).toBe('migrations');
    expect(result.text.indexOf('\nstack:')).toBeLessThan(result.text.indexOf('\nissue_tracker:'));
    expect(result.text.indexOf('\nstack:')).toBeGreaterThan(result.text.indexOf('\ndatabase:'));
  });

  test('a missing block with no schema on disk is refused, never invented', () => {
    const result = writeStack('project:\n  project_name: null\n', null, { package_manager: 'bun' });
    expect(result.error).toContain('bun sync');
    expect(result.text).toBe('project:\n  project_name: null\n');
  });

  test('an unknown field is refused and the text comes back untouched', () => {
    const result = writeStack(realSource(), realSchema(), { 'database.nope': 'x' });
    expect(result.error).toContain('not a stack field');
    expect(result.text).toBe(realSource());
  });

  test('filling a TODO leaf drops the TODO prefix from its comment', () => {
    const withTodo = realSource().replace(/test_runner: null # /, 'test_runner: null # TODO: ');
    const result = writeStack(withTodo, realSchema(), { test_runner: 'vitest' });
    expect(result.error).toBeNull();
    expect(result.text).toMatch(/test_runner: vitest # vitest \|/);
  });
});

describe('identity leaves derived from the stack', () => {
  const NEXT_VALUES = { 'app_root': '.', 'framework': 'nextjs-app-router', 'database.engine': 'postgres', 'database.provider': 'supabase', 'ui.css': 'tailwind-v3', 'ui.kit': 'shadcn' };

  test('a Next + Supabase app gets every leaf, entry points read from disk', () => {
    const root = repo({ 'src/app/page.tsx': '', 'src/app/api/health/route.ts': '' });
    expect(deriveIdentity(NEXT_VALUES, root)).toEqual({
      'frontend.frontend_stack': 'Next.js (App Router) + Tailwind CSS v3 + shadcn/ui',
      'backend.backend_stack': 'Next.js route handlers + server actions + Supabase',
      'frontend.frontend_entry': 'src/app/',
      'backend.backend_entry': 'src/app/api/',
      'database.db_type': 'PostgreSQL (Supabase)',
    });
  });

  test('a monorepo app root prefixes the entry points; no api dir means the router dir', () => {
    const root = repo({ 'apps/web/app/page.tsx': '' });
    const out = deriveIdentity({ ...NEXT_VALUES, app_root: 'apps/web' }, root);
    expect(out['frontend.frontend_entry']).toBe('apps/web/app/');
    expect(out['backend.backend_entry']).toBe('apps/web/app/');
  });

  test('nothing is guessed: unknown values and a missing router dir derive nothing', () => {
    const root = repo({});
    expect(deriveIdentity({ 'framework': null, 'database.engine': null }, root)).toEqual({});
    expect(deriveIdentity({ 'framework': 'other', 'database.engine': 'other' }, root)).toEqual({});
    const noDir = deriveIdentity(NEXT_VALUES, root);
    expect(noDir['frontend.frontend_entry']).toBeUndefined();
    expect(noDir['backend.backend_entry']).toBeUndefined();
  });

  test.skipIf(!MAINTAINER_CHECKOUT)('writeDerivedIdentity fills only null leaves, answers their TODO, never overwrites', () => {
    const root = repo({ 'src/app/page.tsx': '' });
    const filledSource = realSource().replace(/^ {2}db_type: null.*$/m, '  db_type: MySQL # the app says so');
    const result = writeDerivedIdentity(filledSource, root);
    expect(result.error).toBeNull();
    expect(result.filled['database.db_type']).toBeUndefined();
    expect(result.filled['frontend.frontend_entry']).toBe('src/app/');
    expect(result.text).toContain('  db_type: MySQL # the app says so');
    expect(result.text).toMatch(/^ {2}backend_stack: 'Next\.js route handlers \+ server actions \+ Supabase' # Backend technology stack/m);
    expect(result.text).toMatch(/^ {2}frontend_entry: src\/app\/ # Frontend source entry point/m);
    const again = writeDerivedIdentity(result.text, root);
    expect(again.filled).toEqual({});
    expect(again.text).toBe(result.text);
  });

  test('a yaml with no stack block is left untouched', () => {
    const text = 'project:\n  project_name: null\nbackend:\n  backend_stack: null\n';
    expect(writeDerivedIdentity(text, repo({}))).toEqual({ text, filled: {}, error: null });
  });
});

describe('validation and drift', () => {
  test('a value outside its set and a null where null is no answer are both reported', () => {
    const read = readStack(realSource().replace('package_manager: bun', 'package_manager: deno').replace('hosting: vercel', 'hosting: null'));
    expect(validateStack(read).map(i => i.path)).toEqual(['package_manager', 'hosting']);
  });

  test('a package manager other than bun is outside v1 (OD3), a shape-valid value all the same', () => {
    const read = readStack(realSource().replace('package_manager: bun', 'package_manager: pnpm'));
    expect(validateStack(read)).toEqual([]);
    expect(unsupportedInV1(read.values).map(i => i.path)).toEqual(['package_manager']);
  });

  test.skipIf(!MAINTAINER_CHECKOUT)('drift lists only fields the repo shows differently', () => {
    const d = detectStack(repo(NEXT_SUPABASE_APP));
    const drift = stackDrift(readStack(realSource()), d);
    expect(drift.map(x => x.path)).toEqual([
      'scripts.lint',
      'scripts.types',
      'database.schema_source',
      'database.migrations_dir',
      'test_runner',
    ]);
  });

  test('the doctor stays quiet about an app that does not exist yet', () => {
    const root = repo({ 'bun.lock': '', 'package.json': pkg({ name: 'x' }) });
    const diag = diagnoseStack(root, realSource());
    expect(diag).toEqual({ present: true, appFound: false, issues: [], unsupported: [], drift: [], note: null });
  });

  test('the doctor reports a declared script the app lacks as drift to null', () => {
    const files: Record<string, string | null> = { ...NEXT_SUPABASE_APP };
    files['package.json'] = pkg({ name: 'a', scripts: { build: 'next build' }, dependencies: { next: '15' } });
    const diag = diagnoseStack(repo(files), realSource());
    const dev = diag.drift.find(d => d.path === 'scripts.dev')!;
    expect(dev.declared).toBe('dev');
    expect(dev.detected).toBeNull();
  });

  test('a project without the block is reported as absent, with no issues', () => {
    const diag = diagnoseStack(repo({}), 'project:\n  project_name: null\n');
    expect(diag.present).toBe(false);
    expect(diag.issues).toEqual([]);
  });

  test('an unparseable yaml is a note, never a throw', () => {
    expect(diagnoseStack(repo({}), 'a: [\n').note).toContain('does not parse');
  });
});
