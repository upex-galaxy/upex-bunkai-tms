/**
 * An adopting app whose `.gitignore` hides the agentic store (measured on a
 * real app, U18-12), and the migration guard that refuses to move tracked
 * skills into an ignored folder.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';
import { hiddenPaths, REINCLUDE_BLOCK_HEADER, reincludeAgenticStore } from './adopt-gitignore.ts';
import { planHarnessMigration } from './updater-harness-migration.ts';

const roots: string[] = [];
function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'adopt gitignore '));
  roots.push(root);
  spawnSync('git', ['-C', root, 'init', '--quiet'], { encoding: 'utf8' });
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}
afterEach(() => {
  while (roots.length > 0) { rmSync(roots.pop()!, { recursive: true, force: true }); }
});

describe('hiddenPaths', () => {
  test('names the rule that hides a path, existing or not', () => {
    const root = repo({ '.gitignore': 'node_modules/\n.agents\n' });
    expect(hiddenPaths(root, ['.agents/project.yaml', 'src/page.tsx'])).toEqual([
      { path: '.agents/project.yaml', source: '.gitignore:2', pattern: '.agents' },
    ]);
  });

  test('a path a later negation re-includes is not hidden', () => {
    const root = repo({ '.gitignore': '.agents\n!/.agents/\n' });
    expect(hiddenPaths(root, ['.agents/project.yaml'])).toEqual([]);
  });
});

describe('reincludeAgenticStore', () => {
  test('nothing hidden: the file is untouched', () => {
    const root = repo({ '.gitignore': 'node_modules/\n' });
    const out = reincludeAgenticStore(root);
    expect(out).toEqual({ hidden: [], added: [], stillHidden: [] });
    expect(readFileSync(join(root, '.gitignore'), 'utf8')).toBe('node_modules/\n');
  });

  test('an app that ignores .agents gets one appended block; its own lines stay byte-identical', () => {
    const app = 'node_modules/\n.agents\n.env*\n';
    const root = repo({ '.gitignore': app });
    const out = reincludeAgenticStore(root);
    expect(out.added).toEqual(['!/.agents/']);
    expect(out.stillHidden).toEqual([]);
    const text = readFileSync(join(root, '.gitignore'), 'utf8');
    expect(text.startsWith(app)).toBe(true);
    expect(text).toContain(REINCLUDE_BLOCK_HEADER);
    expect(text).toContain('.agents (.gitignore:2)');
    expect(hiddenPaths(root, ['.agents/skills/acli/SKILL.md'])).toEqual([]);
    // The tooling's own ignores inside the store still apply when they come after.
    writeFileSync(join(root, '.gitignore'), `${text}/.agents/prompts/\n`);
    expect(hiddenPaths(root, ['.agents/prompts/parity-plan.md']).map(h => h.pattern)).toEqual(['/.agents/prompts/']);
  });

  test('a rule on the children needs the second negation', () => {
    const root = repo({ '.gitignore': '.agents/*\n' });
    const out = reincludeAgenticStore(root);
    expect(out.added).toEqual(['!/.agents/', '!/.agents/**']);
    expect(out.stillHidden).toEqual([]);
  });

  test('idempotent, and --dry-run writes nothing', () => {
    const root = repo({ '.gitignore': '.agents\n' });
    expect(reincludeAgenticStore(root, true).added).toEqual(['!/.agents/']);
    expect(readFileSync(join(root, '.gitignore'), 'utf8')).toBe('.agents\n');
    reincludeAgenticStore(root);
    const once = readFileSync(join(root, '.gitignore'), 'utf8');
    expect(reincludeAgenticStore(root).hidden).toEqual([]);
    expect(readFileSync(join(root, '.gitignore'), 'utf8')).toBe(once);
  });
});

describe('the cross-harness migration never moves tracked skills into an ignored store', () => {
  function legacyApp(gitignore: string): string {
    const root = repo({
      '.gitignore': gitignore,
      '.claude/skills/app-skill/SKILL.md': '---\nname: app-skill\n---\n',
    });
    spawnSync('git', ['-C', root, 'add', '-A'], { encoding: 'utf8' });
    return root;
  }

  test('refused, naming the rule and the skill', () => {
    const plan = planHarnessMigration(legacyApp('.agents\n'), { adopt: true });
    expect(plan.blockers.some(b => b.includes('which git ignores') && b.includes('.agents (.gitignore:1)') && b.includes('app-skill'))).toBe(true);
  });

  test('planned as before once the store is versioned', () => {
    const plan = planHarnessMigration(legacyApp('node_modules/\n'), { adopt: true });
    expect(plan.blockers).toEqual([]);
    expect(plan.skillsToMove).toEqual(['app-skill']);
  });
});
