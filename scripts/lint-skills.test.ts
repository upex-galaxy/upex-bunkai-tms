/**
 * Regression tests for `scripts/lint-skills.ts`, run against fixture repos
 * through the `LINT_SKILLS_ROOT` override. Each fixture is the smallest tree
 * the linter needs: a `cli/install.ts` with the community tier lists, the
 * strategy doc with a §4.1 table, and one T1 skill whose Expected-matches
 * table annotates tiers.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

const LINT_SCRIPT = resolve(import.meta.dir, 'lint-skills.ts');
const temporaryRoots: string[] = [];

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root) { rmSync(root, { recursive: true, force: true }); }
  }
});

function write(root: string, relativePath: string, content: string): void {
  const destination = join(root, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, content);
}

/**
 * A repo with one T1 skill (`unit-testing`, not session-retrofitted) that cites `shadcn` in its
 * Expected-matches table with the given tier annotation, and `shadcn` itself
 * COMMITTED as a real directory inside `.agents/skills/` while `cli/install.ts`
 * lists it under PROJECT_LEVEL_SKILLS (T3).
 */
function fixture(annotation: string): string {
  const root = mkdtempSync(join(tmpdir(), 'lint-skills-'));
  temporaryRoots.push(root);

  write(root, 'cli/install.ts', [
    'const PROJECT_LEVEL_SKILLS: ReadonlyArray<CommunitySkill> = [',
    '  { package: \'https://github.com/shadcn/ui\', skill: \'shadcn\' },',
    '];',
    'const USER_LEVEL_SKILLS: ReadonlyArray<CommunitySkill> = [];',
    '',
  ].join('\n'));

  write(root, '.agents/skills/agentic-dev-core/references/skill-composition-strategy.md', [
    '# Strategy',
    '',
    '### 4.1 Category list (v2)',
    '',
    '| Category      | Examples of skills that fit (T3/T4) | Used by (T1)    |',
    '| ------------- | ----------------------------------- | --------------- |',
    '| `frontend-ui` | `shadcn`                            | `unit-testing` |',
    '',
    '### 4.2 Matching rule',
    '',
    'Text.',
    '',
  ].join('\n'));

  write(root, '.agents/skills/unit-testing/SKILL.md', [
    '---',
    'name: unit-testing',
    'complementary_categories:',
    '  - frontend-ui',
    '---',
    '',
    '# unit-testing',
    '',
    '## Composable Skills',
    '',
    '| Category      | Expected matches      |',
    '| ------------- | --------------------- |',
    `| \`frontend-ui\` | \`shadcn\` ${annotation} |`,
    '',
  ].join('\n'));

  // The committed community skill: a real directory, not a symlink.
  write(root, '.agents/skills/shadcn/SKILL.md', '---\nname: shadcn\ndescription: Community UI skill.\n---\n\n# shadcn\n');

  // A project-authored skill that install.ts does not know stays T1.
  write(root, '.agents/skills/vercel-cli/SKILL.md', '---\nname: vercel-cli\n---\n\n# vercel-cli\n');
  return root;
}

function runLint(root: string): { exitCode: number, stdout: string } {
  const result = Bun.spawnSync({
    cmd: ['bun', LINT_SCRIPT],
    env: { ...process.env, LINT_SKILLS_ROOT: root },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return { exitCode: result.exitCode, stdout: `${result.stdout.toString()}${result.stderr.toString()}` };
}

describe('lint-skills tier classification', () => {
  test('a community skill committed in the store keeps its install.ts tier (no TIER-MISMATCH)', () => {
    const { exitCode, stdout } = runLint(fixture('(T3)'));

    expect(stdout).not.toContain('TIER-MISMATCH');
    expect(stdout).toContain('2 T1 skills (+ 1 community skills committed in the store, tiers from cli/install.ts)');
    expect(stdout).toContain('Summary: 0 errors');
    expect(exitCode).toBe(0);
  });

  test('a wrong annotation on that same committed skill is still a TIER-MISMATCH against install.ts', () => {
    const { exitCode, stdout } = runLint(fixture('(T2)'));

    expect(stdout).toContain('[ERROR/TIER-MISMATCH] \'shadcn\' annotated as T2 but install.ts says T3');
    expect(exitCode).toBe(1);
  });
});
