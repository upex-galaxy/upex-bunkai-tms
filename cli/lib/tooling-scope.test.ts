import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';
import { collectUpstreamOwned, isToolingPath, isToolingSkill, readUpstreamOwned, writeUpstreamOwned } from './tooling-scope.ts';

const roots: string[] = [];
function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'tooling scope '));
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

const LOCK = '.template/installer.lock.json';

describe('collectUpstreamOwned', () => {
  test('lists every scripts/ file and every skill folder with a SKILL.md, minus the excluded', () => {
    const upstream = tree({
      'scripts/lint-skills.ts': '',
      'scripts/lib/volatile-facts.ts': '',
      'scripts/lint-skills.test.ts': '',
      '.agents/skills/acli/SKILL.md': '',
      '.agents/skills/not-a-skill/notes.md': '',
      '.agents/skills/REGISTRY.md': '',
    });
    expect(collectUpstreamOwned(upstream, rel => rel.endsWith('.test.ts'))).toEqual({
      scripts: ['scripts/lib/volatile-facts.ts', 'scripts/lint-skills.ts'],
      skills: ['acli'],
    });
  });
});

describe('the list lives in the installer lock of an adopted repo only', () => {
  const owned = { scripts: ['scripts/lint-skills.ts'], skills: ['acli'] };

  test('written and read back on an adopted repo, other keys kept', () => {
    const root = tree({ [LOCK]: '{\n  "template": "x",\n  "adopted": true\n}\n' });
    expect(writeUpstreamOwned(root, owned)).toBe(true);
    expect(readUpstreamOwned(root)).toEqual(owned);
    expect(JSON.parse(readFileSync(join(root, LOCK), 'utf8')).template).toBe('x');
    // Idempotent: same list, no write.
    expect(writeUpstreamOwned(root, owned)).toBe(false);
  });

  test('a greenfield lock (no adopted flag) is never touched and reads as no list', () => {
    const text = '{\n  "template": "x"\n}\n';
    const root = tree({ [LOCK]: text });
    expect(writeUpstreamOwned(root, owned)).toBe(false);
    expect(readFileSync(join(root, LOCK), 'utf8')).toBe(text);
    expect(readUpstreamOwned(root)).toBeNull();
  });

  test('an adopted lock written before the list existed reads as no list', () => {
    expect(readUpstreamOwned(tree({ [LOCK]: '{ "adopted": true }\n' }))).toBeNull();
  });
});

describe('isToolingPath', () => {
  const owned = { scripts: ['scripts/lint-skills.ts'], skills: ['acli'] };

  test('with the list: cli/ whole, listed scripts and skills only', () => {
    expect(isToolingPath('cli/update-boilerplate.ts', owned)).toBe(true);
    expect(isToolingPath('scripts/lint-skills.ts', owned)).toBe(true);
    expect(isToolingPath('scripts/x-thread.ts', owned)).toBe(false);
    expect(isToolingPath('.agents/skills/acli/scripts/md-to-adf.ts', owned)).toBe(true);
    expect(isToolingPath('.agents/skills/upex-email/scripts/send.ts', owned)).toBe(false);
    expect(isToolingPath('lib/jira/api.ts', owned)).toBe(false);
    expect(isToolingSkill('upex-email', owned)).toBe(false);
  });

  test('without a list (greenfield) every path counts, as the folder-wide checks always did', () => {
    expect(isToolingPath('scripts/x-thread.ts', null)).toBe(true);
    expect(isToolingPath('.agents/skills/upex-email/SKILL.md', null)).toBe(true);
    expect(isToolingSkill('upex-email', null)).toBe(true);
  });
});
