import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';
import { detectHookManager, FRAMEWORK_GATES_FILE, gatesWired, hookWiringSnippet, withoutHuskyStep } from './hook-manager.ts';

const roots: string[] = [];
function tempRoot(files: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'hook manager '));
  roots.push(root);
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}
afterEach(() => {
  while (roots.length > 0) { rmSync(roots.pop()!, { recursive: true, force: true }); }
});

describe('detectHookManager', () => {
  test('husky and none are not foreign: husky installs normally', () => {
    expect(detectHookManager(tempRoot({ '.husky/pre-commit': 'x' }), null)).toMatchObject({ manager: 'husky', foreign: false });
    expect(detectHookManager(tempRoot({ 'package.json': '{}' }), null)).toMatchObject({ manager: 'none', foreign: false });
    // The value husky itself writes.
    expect(detectHookManager(tempRoot({ '.husky/pre-commit': 'x' }), '.husky/_').manager).toBe('husky');
  });

  test('every foreign manager is detected, and wins over the .husky/ the sync delivers', () => {
    const cases: Array<[Record<string, string>, string, string]> = [
      [{ 'lefthook.yml': 'pre-commit: {}' }, 'lefthook', 'lefthook.yml'],
      [{ '.lefthook.yaml': '' }, 'lefthook', '.lefthook.yaml'],
      [{ 'package.json': '{"simple-git-hooks":{"pre-commit":"x"}}' }, 'simple-git-hooks', 'package.json'],
      [{ '.simple-git-hooks.json': '{}' }, 'simple-git-hooks', '.simple-git-hooks.json'],
      [{ '.pre-commit-config.yaml': 'repos: []' }, 'pre-commit', '.pre-commit-config.yaml'],
      [{ 'package.json': '{"husky":{"hooks":{"pre-commit":"x"}}}' }, 'husky-v4', 'package.json'],
      [{ '.huskyrc.json': '{}' }, 'husky-v4', '.huskyrc.json'],
    ];
    for (const [files, manager, configPath] of cases) {
      const d = detectHookManager(tempRoot({ ...files, '.husky/framework-gates.sh': '' }), null);
      expect(d).toMatchObject({ manager, configPath, foreign: true });
    }
  });

  test('a custom core.hooksPath is foreign; reading it from git never uses the global value', () => {
    expect(detectHookManager(tempRoot(), '.githooks')).toMatchObject({ manager: 'hooks-path', configPath: '.githooks', foreign: true });
    // Not a git repo at all: no local config, so no hooks path.
    expect(detectHookManager(tempRoot()).manager).toBe('none');
  });
});

describe('gatesWired', () => {
  test('a foreign config wires the gates only with a non-comment reference to the gates file', () => {
    const root = tempRoot({ 'lefthook.yml': '# framework-gates.sh later\npre-commit:\n  commands: {}\n' });
    expect(gatesWired(root, detectHookManager(root, null))).toBe(false);
    writeFileSync(join(root, 'lefthook.yml'), `pre-commit:\n  commands:\n    g:\n      run: sh -c '. ${FRAMEWORK_GATES_FILE} && framework_gates_pre_commit'\n`);
    expect(gatesWired(root, detectHookManager(root, null))).toBe(true);
  });

  test('a hooks directory counts when any hook in it sources the gates; husky is always wired here', () => {
    const root = tempRoot({ '.githooks/pre-commit': `. ./${FRAMEWORK_GATES_FILE}\n` });
    expect(gatesWired(root, detectHookManager(root, '.githooks'))).toBe(true);
    const husky = tempRoot({ '.husky/pre-commit': 'x' });
    expect(gatesWired(husky, detectHookManager(husky, null))).toBe(true);
  });
});

describe('hookWiringSnippet', () => {
  test('every foreign manager gets the three gate functions through the synced gates file', () => {
    const configs: Record<string, string>[] = [{ 'lefthook.yml': '' }, { '.simple-git-hooks.json': '' }, { '.pre-commit-config.yaml': '' }, { '.huskyrc': '' }];
    for (const files of configs) {
      const snippet = hookWiringSnippet(detectHookManager(tempRoot(files), null))!;
      for (const fn of ['framework_gates_pre_commit', 'framework_gates_pre_push', 'framework_gates_commit_msg']) {
        expect(snippet).toContain(fn);
      }
      expect(snippet).toContain(FRAMEWORK_GATES_FILE);
    }
    expect(hookWiringSnippet(detectHookManager(tempRoot(), '.githooks'))).toContain('framework_gates_commit_msg "$1"');
  });

  test('lefthook forwards the message file with {1}; husky and none get no snippet', () => {
    expect(hookWiringSnippet(detectHookManager(tempRoot({ 'lefthook.yml': '' }), null))).toContain('framework_gates_commit_msg "$1"\' sh {1}');
    expect(hookWiringSnippet(detectHookManager(tempRoot({ '.husky/x': '' }), null))).toBeNull();
    expect(hookWiringSnippet(detectHookManager(tempRoot(), null))).toBeNull();
  });
});

describe('withoutHuskyStep', () => {
  test('drops every spelling of the husky install step and keeps the rest in order', () => {
    expect(withoutHuskyStep('husky && bun scripts/harness-env.ts --placeholders')).toBe('bun scripts/harness-env.ts --placeholders');
    expect(withoutHuskyStep('lefthook install && npx husky install && node x.js')).toBe('lefthook install && node x.js');
    expect(withoutHuskyStep('husky')).toBeNull();
    expect(withoutHuskyStep('node husky-like.js')).toBe('node husky-like.js');
  });
});
