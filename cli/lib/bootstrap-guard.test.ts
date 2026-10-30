/**
 * @fileoverview Tests for the `/project-bootstrap` brownfield guard.
 *
 * Each case builds a throwaway repo in a temp dir. Never THIS checkout: `cli/`
 * is synced into every project, and a project that already ran the bootstrap
 * holds an app, so a test pinned to the live tree would fail there.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';

import { detectExistingApp, readAdoptionLock } from './bootstrap-guard.ts';

const roots: string[] = [];
afterEach(() => {
  while (roots.length > 0) { rmSync(roots.pop()!, { recursive: true, force: true }); }
});

/** A temp repo with the given files; a value of `null` creates a directory. */
function repo(files: Record<string, string | null>): string {
  const root = mkdtempSync(join(tmpdir(), 'bootstrap-guard-'));
  roots.push(root);
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    if (content === null) { mkdirSync(full, { recursive: true }); continue; }
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

const TOOLING_PKG = JSON.stringify({ name: 'tooling', devDependencies: { yaml: '^2.8.2' } });
const NEXT_PKG = JSON.stringify({ name: 'app', dependencies: { next: '15.0.0', react: '19.0.0' } });

describe('detectExistingApp', () => {
  test('a scaffolded tree with tooling only (the boilerplate before bootstrap) is greenfield', () => {
    const root = repo({
      'package.json': TOOLING_PKG,
      '.template/installer.lock.json': JSON.stringify({ template: 'upex-galaxy/agentic-dev-boilerplate' }),
      'supabase/migrations': null,
      'docs/README.md': '# docs',
      'cli/lib/x.ts': 'export {}',
      'scripts/y.ts': 'export {}',
      '.agents/project.yaml': 'stack:\n  app_root: .\n  framework: nextjs-app-router\n',
    });
    const result = detectExistingApp(root);
    expect(result.verdict).toBe('greenfield');
    expect(result.inspected).toEqual(['.']);
  });

  test('the adoption lock alone refuses the base phases', () => {
    const root = repo({ '.template/installer.lock.json': JSON.stringify({ template: 'x', adopted: true }) });
    const result = detectExistingApp(root);
    expect(result.verdict).toBe('existing-app');
    expect(result.signals).toEqual([{ kind: 'adoption-lock', evidence: '.template/installer.lock.json records adopted: true' }]);
  });

  test('a Next app at the root is found by its package.json and its files', () => {
    const root = repo({
      'package.json': NEXT_PKG,
      'src/app/page.tsx': 'export default function Page() { return null }',
      'middleware.ts': 'export {}',
      'tailwind.config.ts': 'export default {}',
      'components.json': '{}',
      'supabase/migrations/20240101000000_init.sql': 'create table t ();',
    });
    const evidence = detectExistingApp(root).signals.map(s => `${s.kind} ${s.evidence}`);
    expect(evidence).toEqual([
      'app-package package.json declares next',
      'app-files src/app/',
      'app-files middleware.ts',
      'app-files tailwind.config.ts',
      'app-files components.json',
      'app-files supabase/migrations/ holds files',
    ]);
  });

  test('a monorepo app is found under apps/* and under the declared stack.app_root', () => {
    const viaSearch = repo({ 'package.json': TOOLING_PKG, 'apps/web/package.json': NEXT_PKG });
    const found = detectExistingApp(viaSearch);
    expect(found.verdict).toBe('existing-app');
    expect(found.inspected).toEqual(['.', 'apps/web']);

    const viaYaml = repo({
      'package.json': TOOLING_PKG,
      '.agents/project.yaml': 'stack:\n  app_root: ./web/\n',
      'web/package.json': JSON.stringify({ dependencies: { react: '18.0.0' } }),
      'web/proxy.ts': 'export {}',
    });
    const declared = detectExistingApp(viaYaml);
    expect(declared.inspected).toEqual(['.', 'web']);
    expect(declared.signals.map(s => s.evidence)).toEqual(['web/package.json declares react', 'web/proxy.ts']);
  });

  test('app code without a framework dependency is still an app', () => {
    const root = repo({ 'package.json': TOOLING_PKG, 'pages/index.js': 'export default () => null' });
    expect(detectExistingApp(root).signals).toEqual([{ kind: 'app-files', evidence: 'pages/' }]);
  });

  test('an empty route directory or an unparseable yaml does not break the verdict', () => {
    const root = repo({ 'app': null, '.agents/project.yaml': 'stack: [unclosed' });
    expect(detectExistingApp(root).verdict).toBe('greenfield');
  });
});

describe('readAdoptionLock', () => {
  test('true only for adopted: true', () => {
    expect(readAdoptionLock(repo({}))).toBe(false);
    expect(readAdoptionLock(repo({ '.template/installer.lock.json': 'not json' }))).toBe(false);
    expect(readAdoptionLock(repo({ '.template/installer.lock.json': '{"adopted":"yes"}' }))).toBe(false);
    expect(readAdoptionLock(repo({ '.template/installer.lock.json': '{"adopted":true}' }))).toBe(true);
  });
});
