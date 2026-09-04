import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { isInside } from './lib/agent-compatibility.ts';
import {
  applyHarnessMigration,
  describeHarnessMigration,
  LEGACY_CLAUDE_HOOK,
  MIGRATION_BACKUP_DIR,
  planHarnessMigration,
} from './lib/updater-harness-migration.ts';

const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'harness migration '));
  temporaryRoots.push(root);
  return root;
}

function git(root: string, args: string[]): string {
  return spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' }).stdout ?? '';
}

function write(root: string, relativePath: string, contents: string): void {
  const destination = join(root, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, contents);
}

/**
 * A repo scaffolded before the cross-harness move: project memory in CLAUDE.md,
 * skills committed under `.claude/skills/` next to the generated REGISTRY.md, the
 * personality hook under `.claude/hooks/`, no AGENTS.md, no `.agents/skills/`.
 */
const PROJECT_MEMORY = '# ACME Memory\n\nJira: ACME. Never touch billing.\n';

function legacyConsumer(): string {
  const root = temporaryRoot();
  write(root, 'CLAUDE.md', PROJECT_MEMORY);
  write(root, '.claude/skills/sprint-development/SKILL.md', 'upstream body\n');
  write(root, '.claude/skills/acme-internal/SKILL.md', 'work nobody else has\n');
  write(root, '.claude/skills/REGISTRY.md', '# generated\n');
  write(root, LEGACY_CLAUDE_HOOK, 'console.log("legacy hook");\n');
  return root;
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root) { rmSync(root, { recursive: true, force: true }); }
  }
});

describe('windows path separators', () => {
  // A downstream user hit this class of bug on Windows-with-bash: `process.platform`
  // is still `win32`, so `path` APIs emit `\` while every pattern we compare against
  // uses `/`. Both assertions below failed before the fix.

  test('containment survives a separator mismatch and rejects a sibling prefix', () => {
    expect(isInside('/repo/.agents/skills/acli', '/repo/.agents/skills')).toBe(true);
    expect(isInside('/repo/.agents/skills', '/repo/.agents/skills')).toBe(true);
    expect(isInside('/repo/elsewhere/rogue', '/repo/.agents/skills')).toBe(false);
    // The naive `startsWith(parent)` check accepted this one.
    expect(isInside('/repo/.agents/skills-other', '/repo/.agents/skills')).toBe(false);
  });

  test('the backup dir stays POSIX-separated because .gitignore patterns always are', () => {
    // Built with join() it became `.template\pre-agents-migration` on Windows, so the
    // ignore rule matched nothing and the project's own pre-migration CLAUDE.md,
    // sitting in that directory, became committable.
    expect(MIGRATION_BACKUP_DIR).toBe('.template/pre-agents-migration');
    expect(MIGRATION_BACKUP_DIR).not.toContain('\\');
    expect(LEGACY_CLAUDE_HOOK).not.toContain('\\');
  });
});

describe('cross-harness migration plan', () => {
  test('plans nothing for a repo that is already on the canonical layout', () => {
    const root = temporaryRoot();
    write(root, 'AGENTS.md', '# canonical\n');
    write(root, 'CLAUDE.md', '@AGENTS.md\n');
    write(root, '.agents/skills/sprint-development/SKILL.md', 'body\n');
    write(root, '.agents/hooks/personality-reinject.mjs', 'export const PERSONALITY_CONTRACT = "x";\n');
    mkdirSync(join(root, '.claude'), { recursive: true });
    symlinkSync('../.agents/skills', join(root, '.claude/skills'), 'dir');

    expect(planHarnessMigration(root)).toMatchObject({ needed: false, blockers: [], instructions: 'none' });
  });

  test('plans nothing for a fresh repo with neither instruction file', () => {
    expect(planHarnessMigration(temporaryRoot())).toMatchObject({ needed: false, blockers: [] });
  });

  test('detects the promotion and every move on a legacy consumer', () => {
    const plan = planHarnessMigration(legacyConsumer());

    expect(plan.instructions).toBe('promote-claude-md');
    expect(plan.skillsToMove.sort()).toEqual(['acme-internal', 'sprint-development']);
    expect(plan.skillsToArchive).toEqual([]);
    expect(plan.replacesClaudeSkillsDirectory).toBe(true);
    expect(plan.archivesLegacyHook).toBe(true);
    expect(plan.needed).toBe(true);
    expect(plan.blockers).toEqual([]);
    // Every action is narrated, so --dry-run shows the user exactly what moves.
    const narrated = describeHarnessMigration(plan).join('\n');
    expect(narrated).toContain('CLAUDE.md -> AGENTS.md');
    expect(narrated).toContain('.claude/skills/acme-internal/ -> .agents/skills/acme-internal/');
    expect(narrated).toContain(LEGACY_CLAUDE_HOOK);
  });

  test('refuses when CLAUDE.md is already the shim but AGENTS.md is gone', () => {
    // The exact broken end-state this preflight exists to prevent: instructions
    // pointing at a file that does not exist.
    const root = temporaryRoot();
    write(root, 'CLAUDE.md', '@AGENTS.md\n');

    const plan = planHarnessMigration(root);
    expect(plan.instructions).toBe('orphaned-shim');
    expect(plan.blockers[0]).toContain('NO instructions');
    expect(plan.blockers[0]).toContain(MIGRATION_BACKUP_DIR);
    expect(() => applyHarnessMigration(root, plan)).toThrow('Cross-harness migration refused');
  });

  test('refuses when AGENTS.md and a prose CLAUDE.md coexist, and touches neither', () => {
    // Guessing which file is canonical would silently drop somebody's rules; the
    // compatibility check would reject the prose shim anyway.
    const root = temporaryRoot();
    write(root, 'AGENTS.md', '# canonical\n');
    write(root, 'CLAUDE.md', '@AGENTS.md\n\nAlso: Claude-only notes.\n');

    const plan = planHarnessMigration(root);
    expect(plan.instructions).toBe('conflicting-instructions');
    expect(plan.blockers[0]).toContain('only one may be canonical');
    expect(() => applyHarnessMigration(root, plan)).toThrow('Cross-harness migration refused');
    expect(readFileSync(join(root, 'CLAUDE.md'), 'utf8')).toBe('@AGENTS.md\n\nAlso: Claude-only notes.\n');
    expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toBe('# canonical\n');
  });

  test('normalizes a shim that only differs by whitespace', () => {
    const root = temporaryRoot();
    write(root, 'AGENTS.md', '# canonical\n');
    write(root, 'CLAUDE.md', '@AGENTS.md');

    const plan = planHarnessMigration(root);
    expect(plan.instructions).toBe('normalize-shim');
    expect(plan.blockers).toEqual([]);
    applyHarnessMigration(root, plan);
    expect(readFileSync(join(root, 'CLAUDE.md'), 'utf8')).toBe('@AGENTS.md\n');
  });

  test('refuses a symlink escaping the canonical skills store, and touches nothing', () => {
    const root = temporaryRoot();
    write(root, 'AGENTS.md', '# canonical\n');
    write(root, 'elsewhere/rogue/SKILL.md', 'body\n');
    mkdirSync(join(root, '.claude/skills'), { recursive: true });
    symlinkSync('../../elsewhere/rogue', join(root, '.claude/skills/rogue'), 'dir');

    const plan = planHarnessMigration(root);
    expect(plan.blockers[0]).toContain('pointing outside .agents/skills');
    expect(() => applyHarnessMigration(root, plan)).toThrow('Cross-harness migration refused');
    expect(existsSync(join(root, '.claude/skills/rogue'))).toBe(true);
  });

  test('refuses a loose file sitting in the skills directory', () => {
    const root = temporaryRoot();
    write(root, 'AGENTS.md', '# canonical\n');
    write(root, '.claude/skills/notes.txt', 'stray\n');

    expect(planHarnessMigration(root).blockers[0]).toContain('loose file');
  });

  test('skips OS metadata files and the generated registry instead of blocking on them', () => {
    const root = temporaryRoot();
    write(root, 'AGENTS.md', '# canonical\n');
    write(root, '.claude/skills/.DS_Store', ' ');
    write(root, '.claude/skills/Thumbs.db', ' ');
    write(root, '.claude/skills/desktop.ini', '[.ShellClassInfo]\n');
    write(root, '.claude/skills/REGISTRY.md', '# generated\n');

    const plan = planHarnessMigration(root);
    expect(plan.blockers).toEqual([]);
    expect(plan.replacesClaudeSkillsDirectory).toBe(true);
    expect(plan.skillsToMove).toEqual([]);

    applyHarnessMigration(root, plan);
    expect(existsSync(join(root, '.claude/skills'))).toBe(false);
    // Nothing of value was archived: the registry is rebuilt by `skills:registry`.
    expect(existsSync(join(root, MIGRATION_BACKUP_DIR, 'skills'))).toBe(false);
  });
});

describe('cross-harness migration apply', () => {
  test('promotes project memory to AGENTS.md and leaves CLAUDE.md as the shim', () => {
    const root = legacyConsumer();
    const result = applyHarnessMigration(root);

    expect(result.promotedInstructions).toBe(true);
    // The memory MOVED, byte for byte: this is the file the sync would have destroyed.
    expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toBe(PROJECT_MEMORY);
    expect(readFileSync(join(root, 'CLAUDE.md'), 'utf8')).toBe('@AGENTS.md\n');
    // And the original is still recoverable.
    expect(readFileSync(join(root, MIGRATION_BACKUP_DIR, 'CLAUDE.md'), 'utf8')).toBe(PROJECT_MEMORY);
  });

  test('moves every legacy skill into the canonical store and drops the old directory', () => {
    const root = legacyConsumer();
    const result = applyHarnessMigration(root);

    expect(result.movedSkills.sort()).toEqual(['acme-internal', 'sprint-development']);
    expect(result.archivedSkills).toEqual([]);
    expect(readFileSync(join(root, '.agents/skills/acme-internal/SKILL.md'), 'utf8')).toBe('work nobody else has\n');
    expect(readFileSync(join(root, '.agents/skills/sprint-development/SKILL.md'), 'utf8')).toBe('upstream body\n');
    expect(existsSync(join(root, '.claude/skills'))).toBe(false);
  });

  test('archives a legacy skill instead of overwriting the canonical one', () => {
    const root = legacyConsumer();
    write(root, '.agents/skills/sprint-development/SKILL.md', 'canonical body\n');

    const result = applyHarnessMigration(root);

    expect(result.archivedSkills).toEqual(['sprint-development']);
    expect(result.movedSkills).toEqual(['acme-internal']);
    // Canonical wins...
    expect(readFileSync(join(root, '.agents/skills/sprint-development/SKILL.md'), 'utf8')).toBe('canonical body\n');
    // ...and the project's copy is preserved, never silently dropped.
    expect(readFileSync(join(root, MIGRATION_BACKUP_DIR, 'skills/sprint-development/SKILL.md'), 'utf8')).toBe('upstream body\n');
  });

  test('archives the Claude-only hook and removes its now-empty directory', () => {
    const root = legacyConsumer();
    const result = applyHarnessMigration(root);

    expect(result.archivedLegacyHook).toBe(true);
    expect(existsSync(join(root, LEGACY_CLAUDE_HOOK))).toBe(false);
    expect(existsSync(join(root, '.claude/hooks'))).toBe(false);
    expect(readFileSync(join(root, MIGRATION_BACKUP_DIR, 'hooks/personality-reinject.js'), 'utf8')).toBe('console.log("legacy hook");\n');
  });

  test('keeps .claude/hooks when something else still lives there', () => {
    const root = legacyConsumer();
    write(root, '.claude/hooks/custom.js', 'mine\n');

    applyHarnessMigration(root);
    expect(existsSync(join(root, LEGACY_CLAUDE_HOOK))).toBe(false);
    expect(readFileSync(join(root, '.claude/hooks/custom.js'), 'utf8')).toBe('mine\n');
  });

  test('drops per-skill symlinks without treating them as content', () => {
    const root = temporaryRoot();
    write(root, 'AGENTS.md', '# canonical\n');
    write(root, '.agents/skills/playwright-cli/SKILL.md', 'body\n');
    mkdirSync(join(root, '.claude/skills'), { recursive: true });
    symlinkSync('../../.agents/skills/playwright-cli', join(root, '.claude/skills/playwright-cli'), 'dir');

    const plan = planHarnessMigration(root);
    expect(plan.skillsShimLinks).toEqual(['playwright-cli']);
    expect(plan.skillsToMove).toEqual([]);
    expect(plan.skillsToArchive).toEqual([]);

    applyHarnessMigration(root, plan);
    expect(existsSync(join(root, '.claude/skills'))).toBe(false);
    expect(readFileSync(join(root, '.agents/skills/playwright-cli/SKILL.md'), 'utf8')).toBe('body\n');
  });

  test('unindexes the legacy skill tree so git still works behind the alias', () => {
    // Once `.claude/skills` is a symlink, git refuses every index entry beneath it
    // ("beyond a symbolic link"), which breaks git add / stash / lint-staged on the
    // consumer's first commit after the update.
    const root = legacyConsumer();
    git(root, ['init', '-q']);
    git(root, ['config', 'user.email', 'test@example.com']);
    git(root, ['config', 'user.name', 'test']);
    git(root, ['add', '-A']);
    git(root, ['commit', '-qm', 'claude-era layout']);
    expect(git(root, ['ls-files', '--', '.claude/skills']).trim().split('\n')).toHaveLength(3);

    const result = applyHarnessMigration(root);
    expect(result.unindexedFiles).toBe(3);
    expect(git(root, ['ls-files', '--', '.claude/skills']).trim()).toBe('');
    // The bodies are untouched on disk: only the index changed.
    expect(readFileSync(join(root, '.agents/skills/acme-internal/SKILL.md'), 'utf8')).toBe('work nobody else has\n');
    // The alias the compatibility hook writes next is then a plain new entry.
    symlinkSync('../.agents/skills', join(root, '.claude/skills'), 'dir');
    const add = spawnSync('git', ['-C', root, 'add', '-A'], { encoding: 'utf8' });
    expect(add.status).toBe(0);
    expect(add.stderr).not.toContain('beyond a symbolic link');
  });

  test('is a silent no-op outside a git repository', () => {
    const root = legacyConsumer();
    expect(applyHarnessMigration(root).unindexedFiles).toBe(0);
  });

  test('ignores the generated alias and the backup before either can be committed', () => {
    const root = legacyConsumer();
    write(root, '.gitignore', 'node_modules/\n.env\n');

    const result = applyHarnessMigration(root);
    expect(result.ignoredEntriesAdded).toEqual(['.claude/skills', `${MIGRATION_BACKUP_DIR}/`]);
    const gitignore = readFileSync(join(root, '.gitignore'), 'utf8');
    expect(gitignore).toContain('node_modules/');
    expect(gitignore).toContain('# ===== Cross-harness generated artifacts =====');
    expect(gitignore).toContain('\n.claude/skills\n');
    expect(gitignore).toContain(`\n${MIGRATION_BACKUP_DIR}/\n`);
  });

  test('does not duplicate .gitignore entries that already exist', () => {
    const root = legacyConsumer();
    write(root, '.gitignore', `node_modules/\n.claude/skills\n${MIGRATION_BACKUP_DIR}/\n`);

    expect(applyHarnessMigration(root).ignoredEntriesAdded).toEqual([]);
    const occurrences = readFileSync(join(root, '.gitignore'), 'utf8')
      .split('\n')
      .filter(line => line.trim() === '.claude/skills');
    expect(occurrences).toHaveLength(1);
  });

  test('is idempotent: a second pass plans and does nothing', () => {
    const root = legacyConsumer();
    applyHarnessMigration(root);
    // Re-create the alias the way the compatibility hook does, then re-run.
    symlinkSync('../.agents/skills', join(root, '.claude/skills'), 'dir');

    expect(planHarnessMigration(root)).toMatchObject({ needed: false, blockers: [], instructions: 'none' });
    expect(applyHarnessMigration(root).applied).toBe(false);
    expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toBe(PROJECT_MEMORY);
    expect(lstatSync(join(root, '.claude/skills')).isSymbolicLink()).toBe(true);
  });
});
