import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';
import { APP_INSTRUCTIONS_REFERENCE } from './lib/adopt-app-context.ts';
import { ADOPT_INSTRUCTIONS_HEADING, ADOPT_INSTRUCTIONS_PROMPT, INSTALLER_LOCK_FILE } from './lib/updater-adopt.ts';
import { ADOPT_NEXT_STEP, deprecatedFilesToClean, parseArgs } from './update-boilerplate.ts';

const UPDATER = join(import.meta.dir, 'update-boilerplate.ts');
const roots: string[] = [];
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'updater adopt cli '));
  roots.push(root);
  return root;
}
afterEach(() => {
  while (roots.length > 0) { rmSync(roots.pop()!, { recursive: true, force: true }); }
});

function run(cwd: string, args: string[]): { status: number | null, out: string } {
  const res = Bun.spawnSync(['bun', UPDATER, ...args], { cwd, stdout: 'pipe', stderr: 'pipe', stdin: 'ignore' });
  return { status: res.exitCode, out: `${res.stdout.toString()}${res.stderr.toString()}` };
}

describe('--adopt flag', () => {
  test('parses, and stays off by default (a plain run is unchanged)', () => {
    expect(parseArgs(['--adopt']).adopt).toBe(true);
    expect(parseArgs([]).adopt).toBe(false);
    expect(parseArgs(['--auto']).adopt).toBe(false);
  });

  test('refuses to combine with --force or a component subset', () => {
    const cwd = tempRoot();
    for (const extra of [['--force'], ['scripts']]) {
      const res = run(cwd, ['--adopt', ...extra]);
      expect(res.status).toBe(1);
      expect(res.out).toContain('--adopt no se combina');
    }
  });

  test('on an adopted repo a second --adopt is a no-op that exits 0; on a greenfield lock it refuses', () => {
    const cwd = tempRoot();
    mkdirSync(join(cwd, '.template'));
    writeFileSync(join(cwd, '.template', 'boilerplate.lock.json'), '{}\n');
    writeFileSync(join(cwd, '.template', 'installer.lock.json'), '{"template":"upex-galaxy/agentic-dev-boilerplate","adopted":true}\n');
    const adopted = run(cwd, ['--adopt']);
    expect(adopted.status).toBe(0);
    expect(adopted.out).toContain('ya está adoptado');

    writeFileSync(join(cwd, '.template', 'installer.lock.json'), '{"template":"upex-galaxy/agentic-dev-boilerplate"}\n');
    const greenfield = run(cwd, ['--adopt']);
    expect(greenfield.status).toBe(1);
    expect(greenfield.out).toContain('solo para la primera corrida');
  });
});

describe('--adopt closing line', () => {
  const skillDir = join(import.meta.dir, '..', '.agents', 'skills', 'project-adoption');

  test('hands off to the project-adoption skill, which ships in the synced skills tree', () => {
    expect(ADOPT_NEXT_STEP).toContain('project-adoption');
    expect(existsSync(join(skillDir, 'SKILL.md'))).toBe(true);
  });

  test('the skill names the same lock file and saved instruction merge the install writes', () => {
    const skill = readFileSync(join(skillDir, 'SKILL.md'), 'utf8');
    const workflow = readFileSync(join(skillDir, 'references', 'adoption-workflow.md'), 'utf8');
    // `path.join` builds the prompt path; the skill prose always uses forward slashes.
    const prompt = ADOPT_INSTRUCTIONS_PROMPT.replaceAll('\\', '/');
    expect(skill).toContain(INSTALLER_LOCK_FILE);
    expect(skill).toContain('adopted: true');
    expect(skill).toContain(prompt);
    expect(workflow).toContain(prompt);
    // The app's text lands in its `<app>-context` skill; the legacy `## 0.` block is still named for the move.
    expect(workflow).toContain(APP_INSTRUCTIONS_REFERENCE);
    expect(workflow).toContain(ADOPT_INSTRUCTIONS_HEADING.replace(/^## /, ''));
  });
});

describe('retired paths a project protects', () => {
  test('are never handed to the deprecated cleanup; the rest still are', () => {
    const retired = [{ path: '.claude/commands/a.md' }, { path: '.claude/commands/b.md' }];
    const watchlist = [{ path: '.claude/commands/a.md', reason: 'project', source: 'project' as const }];
    expect(deprecatedFilesToClean(retired, watchlist)).toEqual([{ path: '.claude/commands/b.md' }]);
    expect(deprecatedFilesToClean(retired, [])).toEqual(retired);
  });
});
