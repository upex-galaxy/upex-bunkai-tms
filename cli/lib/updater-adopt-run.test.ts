/**
 * `runUpdate` end to end against a LOCAL template repo and a fixture app repo:
 * the `--adopt` first run next to the greenfield first run it must not change.
 */

import type { AdoptOutcome } from './updater-adopt.ts';
import type { Component, ReportSink, RunSummary, SyncStateV7, UpdaterConfig } from './updater-types';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';
import { ADOPT_REPO_ONLY_PATTERNS, ADOPT_UPSTREAM_SKILLS_DIR, isAdopted, runAdopt } from './updater-adopt.ts';
import { runUpdate } from './updater-core.ts';
import { readProjectProtectedPaths } from './updater-drift.ts';

const roots: string[] = [];
const startCwd = process.cwd();
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'updater adopt run '));
  roots.push(root);
  return root;
}
afterEach(() => {
  process.chdir(startCwd);
  while (roots.length > 0) { rmSync(roots.pop()!, { recursive: true, force: true }); }
});

function git(root: string, args: string[]): string {
  const res = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  if (res.status !== 0) { throw new Error(`git ${args.join(' ')} failed: ${res.stderr}`); }
  return res.stdout;
}
function write(root: string, rel: string, text: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}
function read(root: string, rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}
function initRepo(root: string, files: Record<string, string>): void {
  git(root, ['init', '--quiet', '--initial-branch=main']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'test']);
  for (const [rel, text] of Object.entries(files)) { write(root, rel, text); }
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', 'baseline']);
}

const UPSTREAM_PKG = `${JSON.stringify({
  name: 'agentic-dev-boilerplate',
  scripts: { test: 'bun test cli/', up: 'bun cli/update-boilerplate.ts' },
  dependencies: { yaml: '^2.8.2' },
  devDependencies: { typescript: '^5.9.3' },
}, null, 2)}\n`;

const UPSTREAM: Record<string, string> = {
  'scripts/new-tool.ts': 'export const tool = 1;\n',
  'scripts/lint.ts': 'upstream lint\n',
  'scripts/same.ts': 'same\n',
  'docs/README.md': '# Boilerplate docs\n',
  '.context/ADR/README.md': '# ADRs\n',
  '.context/ADR/ADR-0002-multi-harness.md': '# boilerplate decision\n',
  '.context/ADR/ADR-NNNN-template.md': '# template\n',
  '.env.example': 'APP_URL=\nATLASSIAN_EMAIL=\n',
  '.agents/project.yaml': 'git_strategy:\n  meta:\n    strategy_source: chosen\n',
  '.agents/project.schema.yaml': '# GENERATED\n\nproject:\n  project_name: null\n\nupdater:\n  protected_paths: []\n',
  'AGENTS.md': '# AGENTS.md\n\n## 1. RULES\n',
  'package.json': UPSTREAM_PKG,
  '.gitignore': '.backups/\n/.agents/prompts/\n',
};

const APP_PKG = `${JSON.stringify({
  name: 'my-app',
  version: '3.1.0',
  scripts: { dev: 'next dev', test: 'vitest' },
  dependencies: { react: '19.0.0', typescript: '5.4.0' },
}, null, 2)}\n`;

const APP: Record<string, string> = {
  'scripts/lint.ts': 'the app lint script\n',
  'scripts/same.ts': 'same\n',
  'docs/README.md': '# App docs\n',
  '.env.example': 'APP_URL=https://app.example\n',
  'package.json': APP_PKG,
  '.gitignore': 'node_modules/\n',
  'src/app/page.tsx': 'export default function Page() { return null; }\n',
};

const COMPONENTS: Component[] = [
  { name: 'agents', type: 'file-list', paths: ['.agents'], files: ['project.schema.yaml', 'project.yaml'] },
  { name: 'scripts', type: 'directory', paths: ['scripts'] },
  { name: 'docs', type: 'directory', paths: ['docs'] },
  { name: 'context', type: 'directory', paths: ['.context'], bootstrapOnly: true, frameworkFiles: ['README.md'], frameworkFilesExcept: ['.context/ADR/README.md'] },
  { name: 'env-template', type: 'file-list', paths: ['.'], files: ['.env.example'] },
];

function config(template: string, extraBootstrapOnly: string[] = [], afterApply?: (summary: RunSummary) => Promise<void>, adopted = true): UpdaterConfig {
  return {
    templateRepo: template,
    cliVersion: 'test',
    tempDir: join(tempRoot(), 'upstream'),
    versionFile: '.template/boilerplate.lock.json',
    components: COMPONENTS,
    ignoreFiles: [{ path: '.gitignore', sentinel: '# ===== Synced from boilerplate' }],
    packageJsonSpecs: [{ path: 'package.json', sections: ['scripts', 'devDependencies', 'dependencies', 'lint-staged'] }],
    deprecatedFiles: [],
    bootstrapOnlyPaths: ['.agents/project.yaml', 'AGENTS.md', ...extraBootstrapOnly],
    agentsFrameworkFiles: ['project.schema.yaml'],
    excludePaths: ['CLAUDE.md'],
    repoOnlyPaths: [],
    // What the wrapper sets for an adopted app (the --adopt run and every run after it).
    ...(adopted ? { repoOnlyPatterns: ADOPT_REPO_ONLY_PATTERNS, adopted: true } : {}),
    sparseExtraPaths: ['AGENTS.md'],
    ...(afterApply ? { hooks: { afterApply } } : {}),
  };
}

function sink(messages: string[] = []): ReportSink {
  return {
    phase: () => {},
    subphase: () => {},
    step: (m) => { messages.push(m); },
    warn: (m) => { messages.push(m); },
    error: (m) => { messages.push(m); },
    spinner: () => ({ start: () => {}, stop: () => {} }),
    confirm: async () => false,
    pickScopes: async scopes => scopes.map(s => s.name),
    pickFiles: async (_scope, files) => files.map(f => f.entry),
    pickIgnoreLines: async (_file, lines) => lines.map(l => l.value),
    resolveDiverged: async () => 'skip',
    confirmDelete: async () => false,
  };
}

function setup(): { template: string, app: string } {
  const template = tempRoot();
  initRepo(template, UPSTREAM);
  const app = tempRoot();
  initRepo(app, APP);
  return { template, app };
}

/** Status of the files the app committed before adoption: `git diff --name-only`. */
function modifiedAppFiles(app: string): string[] {
  return git(app, ['diff', '--name-only']).trim().split('\n').filter(Boolean).sort();
}

describe('runUpdate --adopt on an existing app', () => {
  test('never overwrites an app file; delivers the rest; package.json append-only into devDependencies', async () => {
    const { template, app } = setup();
    process.chdir(app);
    let adopt: AdoptOutcome | null = null;
    const cfg = config(template, [], async (summary) => {
      adopt = await runAdopt({
        root: app,
        upstreamDir: cfg.tempDir,
        dryRun: false,
        nonInteractive: true,
        appliedPaths: summary.applied.filter(a => a.resolution === 'theirs').map(a => a.entry.path),
        collisions: summary.adoptCollisions ?? [],
        packageJsonKept: summary.packageJsonKept ?? [],
        backupDir: summary.backupDir ?? null,
        confirm: async () => false,
        step: () => {},
        warn: () => {},
      });
    });
    const summary = await runUpdate(cfg, sink(), { auto: true, dryRun: false, rollback: false, adopt: true });

    expect(summary.aborted).toBeUndefined();
    expect((summary.adoptCollisions ?? []).map(c => c.path).sort()).toEqual(['.env.example', 'docs/README.md', 'scripts/lint.ts']);
    // Of everything the app committed, only the append-only merges changed.
    expect(modifiedAppFiles(app)).toEqual(['.env.example', '.gitignore', 'package.json']);
    for (const rel of ['scripts/lint.ts', 'scripts/same.ts', 'docs/README.md', 'src/app/page.tsx']) {
      expect(read(app, rel)).toBe(APP[rel]);
    }
    // Absent upstream paths are delivered; the boilerplate's own ADR is not.
    expect(read(app, 'scripts/new-tool.ts')).toBe(UPSTREAM['scripts/new-tool.ts']);
    expect(existsSync(join(app, '.context/ADR/README.md'))).toBe(true);
    expect(existsSync(join(app, '.context/ADR/ADR-NNNN-template.md'))).toBe(true);
    expect(existsSync(join(app, '.context/ADR/ADR-0002-multi-harness.md'))).toBe(false);

    const pkg = JSON.parse(read(app, 'package.json')) as { name: string, version: string, scripts: Record<string, string>, dependencies: Record<string, string>, devDependencies?: Record<string, string> };
    expect(pkg.name).toBe('my-app');
    expect(pkg.version).toBe('3.1.0');
    expect(pkg.scripts).toEqual({ dev: 'next dev', test: 'vitest', up: 'bun cli/update-boilerplate.ts' });
    expect(pkg.dependencies).toEqual({ react: '19.0.0', typescript: '5.4.0' });
    expect(pkg.devDependencies).toEqual({ yaml: '^2.8.2' });
    expect(summary.packageJsonKept).toEqual([{ file: 'package.json', section: 'scripts', key: 'test', localValue: 'vitest', upstreamValue: 'bun test cli/', resolution: 'mine' }]);

    // The lock remembers the redirected package, so a later plain `bun sync` does not add it to `dependencies`.
    const lock = JSON.parse(read(app, '.template/boilerplate.lock.json')) as SyncStateV7;
    expect(lock.packageJsonSync?.['package.json']?.dependencies?.appliedKeys).toContain('yaml');
    expect(lock.packageJsonSync?.['package.json']?.devDependencies?.appliedKeys).toEqual(expect.arrayContaining(['yaml', 'typescript']));

    // The adopt hook: yaml seeded with every collision protected, lock marked adopted.
    expect(adopt).not.toBeNull();
    expect(read(app, '.agents/project.yaml')).not.toContain('strategy_source: chosen');
    expect(readProjectProtectedPaths(app).paths.sort()).toEqual(['.env.example', 'docs/README.md', 'scripts/lint.ts']);
    expect(read(app, '.env.example')).toBe(`${APP['.env.example']}\n# ===== Synced from boilerplate: variables the agentic tooling reads =====\n# Empty on purpose: the values go in .env (see bun setup).\nATLASSIAN_EMAIL=\n`);
    expect(isAdopted(app)).toBe(true);
    expect(read(app, 'AGENTS.md')).toBe(UPSTREAM['AGENTS.md']);
  });

  test('a later plain run keeps every protected app file', async () => {
    const { template, app } = setup();
    process.chdir(app);
    const first = config(template, [], async (summary) => {
      await runAdopt({ root: app, upstreamDir: first.tempDir, dryRun: false, nonInteractive: true, appliedPaths: summary.applied.map(a => a.entry.path), collisions: summary.adoptCollisions ?? [], packageJsonKept: [], backupDir: null, confirm: async () => false, step: () => {}, warn: () => {} });
    });
    await runUpdate(first, sink(), { auto: true, dryRun: false, rollback: false, adopt: true });
    git(app, ['add', '-A']);
    git(app, ['commit', '--quiet', '-m', 'adopt']);

    // Upstream moves on: every colliding file changes again.
    write(template, 'scripts/lint.ts', 'upstream lint v2\n');
    write(template, 'docs/README.md', '# Boilerplate docs v2\n');
    git(template, ['commit', '--quiet', '-am', 'next release']);

    // What the wrapper does: the project's protected paths join bootstrapOnlyPaths.
    const second = config(template, readProjectProtectedPaths(app).paths);
    const summary = await runUpdate(second, sink(), { auto: true, dryRun: false, rollback: false });
    expect(summary.aborted).toBeUndefined();
    expect(read(app, 'scripts/lint.ts')).toBe(APP['scripts/lint.ts']);
    expect(read(app, 'docs/README.md')).toBe(APP['docs/README.md']);
    const pkg = JSON.parse(read(app, 'package.json')) as { dependencies: Record<string, string> };
    expect(pkg.dependencies).toEqual({ react: '19.0.0', typescript: '5.4.0' });
    // The boilerplate's own ADRs stay out on every run of an adopted app, not only the first.
    expect(existsSync(join(app, '.context/ADR/ADR-0002-multi-harness.md'))).toBe(false);
  });

  test('an app file at a path upstream retired is kept and protected, never deleted', async () => {
    const { template, app } = setup();
    write(app, '.claude/commands/old-alias.md', 'the app copy of a retired alias\n');
    git(app, ['add', '-A']);
    git(app, ['commit', '--quiet', '-m', 'alias']);
    process.chdir(app);
    let adopt: AdoptOutcome | null = null;
    const retired = [{ path: '.claude/commands/old-alias.md', component: 'retired-aliases', reason: 'retired', deprecatedSince: '1.0' }];
    const cfg = { ...config(template, [], async (summary: RunSummary) => {
      adopt = await runAdopt({ root: app, upstreamDir: cfg.tempDir, dryRun: false, nonInteractive: true, appliedPaths: summary.applied.map(a => a.entry.path), collisions: summary.adoptCollisions ?? [], packageJsonKept: [], backupDir: null, confirm: async () => false, step: () => {}, warn: () => {} });
    }), deprecatedFiles: retired };
    const summary = await runUpdate(cfg, sink(), { auto: true, dryRun: false, rollback: false, adopt: true });

    expect(summary.aborted).toBeUndefined();
    expect(read(app, '.claude/commands/old-alias.md')).toBe('the app copy of a retired alias\n');
    expect(summary.adoptCollisions).toContainEqual({ path: '.claude/commands/old-alias.md', component: 'retired-aliases', retired: true });
    expect(readProjectProtectedPaths(app).paths).toContain('.claude/commands/old-alias.md');
    const row = (adopt as AdoptOutcome | null)?.findings.find(f => f.path === '.claude/commands/old-alias.md');
    expect(row?.evidence).toContain('path upstream retired');
    expect(row?.blocking).toBe(false);
  });

  test('a delivered file the app\'s own .gitignore hides gets an informational row, never an edit', async () => {
    const { template, app } = setup();
    write(app, '.gitignore', 'node_modules/\nnew-tool.ts\n');
    git(app, ['add', '-A']);
    git(app, ['commit', '--quiet', '-m', 'ignore']);
    process.chdir(app);
    let adopt: AdoptOutcome | null = null;
    const cfg = config(template, [], async (summary: RunSummary) => {
      adopt = await runAdopt({ root: app, upstreamDir: cfg.tempDir, dryRun: false, nonInteractive: true, appliedPaths: summary.applied.map(a => a.entry.path), collisions: summary.adoptCollisions ?? [], packageJsonKept: [], backupDir: null, confirm: async () => false, step: () => {}, warn: () => {} });
    });
    await runUpdate(cfg, sink(), { auto: true, dryRun: false, rollback: false, adopt: true });
    const row = (adopt as AdoptOutcome | null)?.findings.find(f => f.path === 'scripts/new-tool.ts');
    expect(row?.evidence).toContain('`new-tool.ts` (.gitignore:2)');
    expect(row?.blocking).toBe(false);
    expect(read(app, '.gitignore').startsWith('node_modules/\nnew-tool.ts\n')).toBe(true);
  });

  test('the app\'s hand copy of a framework skill is kept, not protected, and upstream\'s copy is saved for take-upstream', async () => {
    const { template, app } = setup();
    write(template, '.agents/skills/acli/SKILL.md', '---\nname: acli\n---\n\n# acli v2\n');
    write(template, '.agents/skills/acli/references/new.md', 'new upstream reference\n');
    write(template, '.agents/skills/acli/scripts/md-to-adf.test.ts', 'test("x", () => {});\n');
    git(template, ['add', '-A']);
    git(template, ['commit', '--quiet', '-m', 'skill']);
    write(app, '.agents/skills/acli/SKILL.md', '---\nname: acli\n---\n\n# acli v1 (hand copy)\n');
    write(app, '.agents/skills/acli/references/app-notes.md', 'app-only notes\n');
    git(app, ['add', '-A']);
    git(app, ['commit', '--quiet', '-m', 'hand-copied skill']);
    process.chdir(app);
    let adopt: AdoptOutcome | null = null;
    const cfg = { ...config(template, [], async (summary: RunSummary) => {
      adopt = await runAdopt({ root: app, upstreamDir: cfg.tempDir, dryRun: false, nonInteractive: true, appliedPaths: summary.applied.map(a => a.entry.path), collisions: summary.adoptCollisions ?? [], packageJsonKept: [], backupDir: null, confirm: async () => false, step: () => {}, warn: () => {} });
    }), components: [...COMPONENTS, { name: 'skills', type: 'directory' as const, paths: ['.agents/skills'] }] };
    await runUpdate(cfg, sink(), { auto: true, dryRun: false, rollback: false, adopt: true });

    // Kept this run, the missing upstream file delivered beside it.
    expect(read(app, '.agents/skills/acli/SKILL.md')).toContain('v1 (hand copy)');
    expect(read(app, '.agents/skills/acli/references/new.md')).toBe('new upstream reference\n');
    // Not frozen: no protected path inside the framework skill.
    expect(readProjectProtectedPaths(app).paths.filter(p => p.startsWith('.agents/skills/'))).toEqual([]);
    // Upstream's copy saved for project-adoption.
    expect(read(app, `${ADOPT_UPSTREAM_SKILLS_DIR}/acli/SKILL.md`)).toContain('v2');
    // The skill's own tests never reach an adopted app, saved copy included.
    expect(existsSync(join(app, ADOPT_UPSTREAM_SKILLS_DIR, 'acli/scripts/md-to-adf.test.ts'))).toBe(false);
    const outcome = adopt as AdoptOutcome | null;
    expect(outcome?.frameworkSkills.map(f => ({ name: f.name, differing: f.differing, appOnly: f.appOnly }))).toEqual([
      { name: 'acli', differing: ['SKILL.md'], appOnly: ['references/app-notes.md'] },
    ]);
    const row = outcome?.findings.find(f => f.path === '.agents/skills/acli/');
    expect(row?.suggested).toBe('take upstream');
    expect(row?.evidence).toContain('1 file(s) differ from upstream, 1 only in the app\'s copy');
    expect(row?.blocking).toBe(false);
  });

  test('an upstream ignore line that matches files the app tracks is withheld, the rest appended', async () => {
    const { template, app } = setup();
    write(template, '.gitignore', '.backups/\nbuild/\n');
    git(template, ['commit', '--quiet', '-am', 'ignore build output']);
    write(app, 'app/build/page.tsx', 'export default function Build() { return null; }\n');
    git(app, ['add', '-A']);
    git(app, ['commit', '--quiet', '-m', 'a /build route']);
    process.chdir(app);
    let adopt: AdoptOutcome | null = null;
    const cfg = config(template, [], async (summary: RunSummary) => {
      adopt = await runAdopt({ root: app, upstreamDir: cfg.tempDir, dryRun: false, nonInteractive: true, appliedPaths: summary.applied.map(a => a.entry.path), collisions: summary.adoptCollisions ?? [], packageJsonKept: [], backupDir: null, ignoreLinesWithheld: summary.ignoreLinesWithheld ?? [], confirm: async () => false, step: () => {}, warn: () => {} });
    });
    const summary = await runUpdate(cfg, sink(), { auto: true, dryRun: false, rollback: false, adopt: true });

    expect(summary.ignoreLinesWithheld).toEqual([{ file: '.gitignore', line: 'build/', tracked: ['app/build/page.tsx'] }]);
    const ignore = read(app, '.gitignore');
    expect(ignore).toContain('.backups/');
    expect(ignore.split('\n')).not.toContain('build/');
    const row = (adopt as AdoptOutcome | null)?.findings.find(f => f.path === '.gitignore' && f.evidence.includes('`build/`'));
    expect(row?.evidence).toContain('app/build/page.tsx');
  });

  test('--dry-run writes nothing and still reports the collisions', async () => {
    const { template, app } = setup();
    process.chdir(app);
    const summary = await runUpdate(config(template), sink(), { auto: true, dryRun: true, rollback: false, adopt: true });
    expect((summary.adoptCollisions ?? []).map(c => c.path).sort()).toEqual(['.env.example', 'docs/README.md', 'scripts/lint.ts']);
    expect(git(app, ['status', '--porcelain', '--untracked-files=all']).trim()).toBe('');
  });

  test('refused on a repo that already has a lock', async () => {
    const { template, app } = setup();
    const lock: SyncStateV7 = { schemaVersion: 7, templateRepo: template, templateCommit: 'abc', perComponentCommit: { scripts: 'abc' }, syncedComponents: ['scripts'], ignoreFileSync: {}, cliVersion: 'test', lastSyncedAt: '2026-10-01T00:00:00.000Z', variableSystemVersion: 1 };
    write(app, '.template/boilerplate.lock.json', `${JSON.stringify(lock, null, 2)}\n`);
    git(app, ['add', '-A']);
    git(app, ['commit', '--quiet', '-m', 'lock']);
    process.chdir(app);
    const messages: string[] = [];
    const summary = await runUpdate(config(template), sink(messages), { auto: true, dryRun: false, rollback: false, adopt: true });
    expect(summary.aborted).toBe(true);
    expect(messages.some(m => m.includes('--adopt es solo para la primera corrida'))).toBe(true);
    expect(read(app, 'scripts/lint.ts')).toBe(APP['scripts/lint.ts']);
  });

  test('refused when the app has its own file where the updater itself lives', async () => {
    const { template, app } = setup();
    write(template, 'cli/update-boilerplate.ts', 'updater\n');
    git(template, ['add', '-A']);
    git(template, ['commit', '--quiet', '-m', 'cli']);
    write(app, 'cli/update-boilerplate.ts', 'the app own cli\n');
    git(app, ['add', '-A']);
    git(app, ['commit', '--quiet', '-m', 'cli']);
    process.chdir(app);
    const cfg = { ...config(template), components: [...COMPONENTS, { name: 'cli', type: 'directory' as const, paths: ['cli'] }], selfUpdateComponent: 'cli' };
    const messages: string[] = [];
    const summary = await runUpdate(cfg, sink(messages), { auto: true, dryRun: false, rollback: false, adopt: true });
    expect(summary.aborted).toBe(true);
    expect(messages.some(m => m.includes('cli/update-boilerplate.ts'))).toBe(true);
    expect(read(app, 'cli/update-boilerplate.ts')).toBe('the app own cli\n');
  });
});

describe('the greenfield first run is unchanged (no --adopt)', () => {
  test('the same fixture still gets upstream\'s copy of every synced path', async () => {
    const { template, app } = setup();
    process.chdir(app);
    const summary = await runUpdate(config(template, [], undefined, false), sink(), { auto: true, dryRun: false, rollback: false });
    expect(summary.adoptCollisions).toBeUndefined();
    expect(read(app, 'scripts/lint.ts')).toBe(UPSTREAM['scripts/lint.ts']);
    expect(read(app, 'docs/README.md')).toBe(UPSTREAM['docs/README.md']);
    expect(read(app, '.env.example')).toBe(UPSTREAM['.env.example']);
    expect(read(app, '.context/ADR/ADR-0002-multi-harness.md')).toBe(UPSTREAM['.context/ADR/ADR-0002-multi-harness.md']);
    const pkg = JSON.parse(read(app, 'package.json')) as { dependencies: Record<string, string> };
    expect(pkg.dependencies).toEqual({ react: '19.0.0', typescript: '5.4.0', yaml: '^2.8.2' });
  });
});
