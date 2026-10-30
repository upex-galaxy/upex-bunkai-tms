import type { PackageJsonSpec } from './updater-types';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';
import { applyPackageJsonAppend, applyPackageJsonOverride, detectPackageJsonDelta, getSection } from './updater-package';

const roots: string[] = [];
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'updater package '));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) { rmSync(root, { recursive: true, force: true }); }
});

const SPEC: PackageJsonSpec = { path: 'package.json', sections: ['scripts', 'lint-staged'] };

function fixture(upstream: Record<string, unknown>, local: Record<string, unknown>): { repo: string, template: string } {
  const repo = tempRoot();
  const template = join(repo, '.upstream');
  mkdirSync(template);
  writeFileSync(join(template, 'package.json'), `${JSON.stringify(upstream, null, 2)}\n`);
  writeFileSync(join(repo, 'package.json'), `${JSON.stringify(local, null, 2)}\n`);
  return { repo, template };
}

function readLocal(repo: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(repo, 'package.json'), 'utf-8')) as Record<string, unknown>;
}

describe('getSection', () => {
  test('a plain section keeps strings only', () => {
    expect(getSection({ scripts: { a: 'x', b: ['y'] } }, 'scripts')).toEqual({ a: 'x' });
  });

  test('lint-staged keeps every value as canonical JSON, arrays included', () => {
    expect(getSection({ 'lint-staged': { '*.ts': ['eslint --fix'], '*.md': 'prettier --write' } }, 'lint-staged'))
      .toEqual({ '*.ts': '["eslint --fix"]', '*.md': '"prettier --write"' });
  });
});

describe('lint-staged arrays travel with every sync (greenfield included)', () => {
  test('an upstream-only glob is detected and appended as an array', () => {
    const { repo, template } = fixture(
      { 'lint-staged': { '*.ts': ['eslint --fix'], '*.json': ['prettier --write'] } },
      { 'lint-staged': { '*.ts': ['eslint --fix'] } },
    );
    const delta = detectPackageJsonDelta(SPEC, repo, template, null);
    expect(delta.sections['lint-staged'].upstreamOnlyKeys).toEqual({ '*.json': '["prettier --write"]' });
    expect(delta.sections['lint-staged'].localOverrideKeys).toEqual({});

    const written = applyPackageJsonAppend(SPEC, { 'lint-staged': delta.sections['lint-staged'].upstreamOnlyKeys }, repo);
    expect(written).toEqual({ 'lint-staged': ['*.json'] });
    expect(readLocal(repo)['lint-staged']).toEqual({ '*.ts': ['eslint --fix'], '*.json': ['prettier --write'] });
  });

  test('a changed command list is drift, and taking upstream writes the array back', () => {
    const { repo, template } = fixture(
      { 'lint-staged': { '*.ts': ['eslint --fix', 'prettier --write'] } },
      { 'lint-staged': { '*.ts': ['eslint --fix'] } },
    );
    const drift = detectPackageJsonDelta(SPEC, repo, template, null).sections['lint-staged'].localOverrideKeys['*.ts'];
    expect(drift).toEqual({ localValue: '["eslint --fix"]', upstreamValue: '["eslint --fix","prettier --write"]' });

    applyPackageJsonOverride(SPEC, { 'lint-staged': { '*.ts': drift.upstreamValue } }, repo);
    expect(readLocal(repo)['lint-staged']).toEqual({ '*.ts': ['eslint --fix', 'prettier --write'] });
  });

  test('a kept decision stops re-surfacing until upstream changes the list again', () => {
    const { repo, template } = fixture(
      { 'lint-staged': { '*.ts': ['eslint --fix', 'prettier --write'] } },
      { 'lint-staged': { '*.ts': ['eslint --fix'] } },
    );
    const state = { packageJsonSync: { 'package.json': { 'lint-staged': { lastSyncedSha: '', appliedKeys: [], keptKeys: { '*.ts': '["eslint --fix","prettier --write"]' } } } } };
    expect(detectPackageJsonDelta(SPEC, repo, template, state).sections['lint-staged'].localOverrideKeys).toEqual({});
  });

  test('identical arrays are no drift, and a string command still round-trips as a string', () => {
    const { repo, template } = fixture(
      { 'lint-staged': { '*.ts': ['eslint --fix'], '*.sh': '[ -x x ] || true' }, 'scripts': { t: '[ -f a ] && b' } },
      { 'lint-staged': { '*.ts': ['eslint --fix'] }, 'scripts': {} },
    );
    const delta = detectPackageJsonDelta(SPEC, repo, template, null);
    expect(delta.sections['lint-staged'].localOverrideKeys).toEqual({});
    applyPackageJsonAppend(SPEC, {
      'scripts': delta.sections.scripts.upstreamOnlyKeys,
      'lint-staged': delta.sections['lint-staged'].upstreamOnlyKeys,
    }, repo);
    const local = readLocal(repo);
    expect(local.scripts).toEqual({ t: '[ -f a ] && b' });
    expect(local['lint-staged']).toEqual({ '*.ts': ['eslint --fix'], '*.sh': '[ -x x ] || true' });
  });
});
