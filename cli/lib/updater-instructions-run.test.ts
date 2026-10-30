/**
 * `runUpdate` end to end for the `instructions` component, against a LOCAL
 * template repo: a project scaffolded from the release before progressive
 * disclosure, a greenfield project of this release, and a project that edited
 * a synced section.
 */

import type { Component, ReportSink, RunSummary, SyncStateV7, UpdaterConfig } from './updater-types';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';
import { RETIRED_SECTION_FILES, COMPONENTS as WRAPPER_COMPONENTS } from '../update-boilerplate.ts';
import { runUpdate } from './updater-core.ts';
import { deliverProjectInstructionsStub, INSTRUCTIONS_DIR, LEGACY_PROJECT_INSTRUCTIONS_FILE, migrateLegacyProjectInstructions, PROJECT_INSTRUCTIONS_FILE, PROJECT_INSTRUCTIONS_TEMPLATE } from './updater-instructions.ts';
import { collectParityFindings } from './updater-parity.ts';

const REPO = join(import.meta.dir, '..', '..');
const readRepo = (rel: string): string => readFileSync(join(REPO, rel), 'utf8');

const roots: string[] = [];
const startCwd = process.cwd();
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'updater instructions run '));
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
function commit(root: string, files: Record<string, string | null>, message: string): string {
  for (const [rel, text] of Object.entries(files)) {
    if (text === null) { rmSync(join(root, rel), { force: true }); }
    else { write(root, rel, text); }
  }
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', message]);
  return git(root, ['rev-parse', 'HEAD']).trim();
}
function initRepo(root: string): void {
  git(root, ['init', '--quiet', '--initial-branch=main']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'test']);
}
/** Every tracked-or-not file under root, minus `.git` and the updater's own state. */
function tree(root: string, dir = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = dir === '' ? item.name : `${dir}/${item.name}`;
    if (rel === '.git' || rel === '.template' || rel === '.backups') { continue; }
    if (item.isDirectory()) { Object.assign(out, tree(root, rel)); }
    else { out[rel] = read(root, rel); }
  }
  return out;
}

const INSTRUCTIONS = WRAPPER_COMPONENTS.find(c => c.name === 'instructions')!;
const COMPONENTS: Component[] = [
  { name: 'scripts', type: 'directory', paths: ['scripts'] },
  INSTRUCTIONS,
];
const VERSION_FILE = '.template/boilerplate.lock.json';

/** The boilerplate's own overlay: what must never reach a project. */
const OWN_PROJECT_MD = readRepo(PROJECT_INSTRUCTIONS_FILE);
const STUB = readRepo(PROJECT_INSTRUCTIONS_TEMPLATE);
const LEGACY_AGENTS = '# AGENTS.md: AI Persistent Memory\n\n## 1. CRITICAL RULES: ALWAYS APPLY\n\nrules\n\n## 9. LOCAL CONTEXT (PBI)\n\npbi\n\n## 13. ACME RULES\n\nours\n';

/** Release N-1: the single-file AGENTS.md, no sections. */
const PREVIOUS_RELEASE: Record<string, string> = {
  'AGENTS.md': LEGACY_AGENTS,
  'scripts/tool.ts': 'export const v = 1;\n',
};
/** Release N: the L0 plus the sections, the boilerplate's own agent-project.md and the stub. */
const THIS_RELEASE: Record<string, string> = {
  'AGENTS.md': readRepo('AGENTS.md'),
  [`${INSTRUCTIONS_DIR}/README.md`]: readRepo(`${INSTRUCTIONS_DIR}/README.md`),
  [`${INSTRUCTIONS_DIR}/agent-critical-rules.md`]: readRepo(`${INSTRUCTIONS_DIR}/agent-critical-rules.md`),
  [`${INSTRUCTIONS_DIR}/agent-git.md`]: readRepo(`${INSTRUCTIONS_DIR}/agent-git.md`),
  [PROJECT_INSTRUCTIONS_FILE]: OWN_PROJECT_MD,
  [PROJECT_INSTRUCTIONS_TEMPLATE]: STUB,
};

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
    resolveDiverged: async () => 'theirs',
    confirmDelete: async () => false,
  };
}

/** The wrapper's shape for this component: agent-project.md excluded, AGENTS.md watched, the stub hook after apply. */
function config(template: string, dryRun: boolean, onSummary: (s: RunSummary) => void = () => {}, protectedPaths: string[] = []): UpdaterConfig {
  const tempDir = join(tempRoot(), 'upstream');
  return {
    templateRepo: template,
    cliVersion: 'test',
    tempDir,
    versionFile: VERSION_FILE,
    components: COMPONENTS,
    ignoreFiles: [],
    deprecatedFiles: [],
    bootstrapOnlyPaths: ['AGENTS.md', ...protectedPaths],
    excludePaths: ['CLAUDE.md', PROJECT_INSTRUCTIONS_FILE],
    repoOnlyPaths: [],
    sparseExtraPaths: ['AGENTS.md'],
    hooks: {
      afterApply: async (summary) => {
        deliverProjectInstructionsStub(process.cwd(), tempDir, { dryRun });
        onSummary(summary);
      },
    },
  };
}

function lock(template: string, sha: string, components: string[]): string {
  const state: SyncStateV7 = {
    schemaVersion: 7,
    templateRepo: template,
    templateCommit: sha,
    perComponentCommit: Object.fromEntries(components.map(c => [c, sha])),
    syncedComponents: components,
    ignoreFileSync: {},
    cliVersion: 'test',
    lastSyncedAt: '2026-10-01T00:00:00.000Z',
    variableSystemVersion: 1,
  };
  return `${JSON.stringify(state, null, 2)}\n`;
}

describe('a project scaffolded from the release before the split', () => {
  function setup(): { template: string, app: string } {
    const template = tempRoot();
    initRepo(template);
    const previous = commit(template, PREVIOUS_RELEASE, 'release N-1');
    commit(template, THIS_RELEASE, 'release N');
    const app = tempRoot();
    initRepo(app);
    commit(app, { ...PREVIOUS_RELEASE, [VERSION_FILE]: lock(template, previous, ['scripts']) }, 'scaffold N-1');
    return { template, app };
  }

  test('a dry run writes nothing', async () => {
    const { template, app } = setup();
    process.chdir(app);
    const before = tree(app);
    const summary = await runUpdate(config(template, true), sink(), { auto: true, dryRun: true, rollback: false });
    expect(summary.aborted).not.toBe(true);
    expect(tree(app)).toEqual(before);
    expect(git(app, ['status', '--porcelain']).trim()).toBe('');
  });

  test('receives every section and the generic stub, never the boilerplate\'s own agent-project.md, and keeps its AGENTS.md', async () => {
    const { template, app } = setup();
    process.chdir(app);
    let applied: string[] = [];
    let findingsEvidence = '';
    const cfg = config(template, false, (summary) => {
      applied = summary.applied.map(a => a.entry.path).sort();
      // What the wrapper's parity hook sees for the watched AGENTS.md.
      const findings = collectParityFindings({
        root: app,
        upstreamDir: cfg.tempDir,
        drift: [{ path: 'AGENTS.md', reason: 'per-project AI memory', structural: false }],
        compatErrors: [],
        archivedSkills: [],
        archivedSkillsDir: join(app, 'archive'),
        heldBack: [],
        envNewKeys: [],
        contextMaps: [],
      });
      findingsEvidence = findings.find(f => f.path === 'AGENTS.md')?.evidence ?? '';
    });
    const summary = await runUpdate(cfg, sink(), { auto: true, dryRun: false, rollback: false });
    expect(summary.aborted).not.toBe(true);

    // The new component bootstraps; agent-project.md is not among the synced files.
    expect(applied).toEqual([
      `${INSTRUCTIONS_DIR}/README.md`,
      `${INSTRUCTIONS_DIR}/agent-critical-rules.md`,
      `${INSTRUCTIONS_DIR}/agent-git.md`,
      PROJECT_INSTRUCTIONS_TEMPLATE,
    ]);
    for (const rel of applied) { expect(read(app, rel)).toBe(THIS_RELEASE[rel]); }
    // The overlay is the stub, delivered once by the hook.
    expect(read(app, PROJECT_INSTRUCTIONS_FILE)).toBe(STUB);
    expect(read(app, PROJECT_INSTRUCTIONS_FILE)).not.toBe(OWN_PROJECT_MD);
    // The protected L0 is never rewritten; the row maps its headings instead.
    expect(read(app, 'AGENTS.md')).toBe(LEGACY_AGENTS);
    expect(findingsEvidence).toContain('legacy single-file AGENTS.md: 1 heading(s) now ship as synced sections');
    expect(findingsEvidence).toContain('"13. ACME RULES"');
    // The lock now carries a cursor for the new component.
    const state = JSON.parse(read(app, VERSION_FILE)) as SyncStateV7;
    expect(Object.keys(state.perComponentCommit)).toContain('instructions');
  });

  test('a second run keeps the project\'s own agent-project.md, whatever it says', async () => {
    const { template, app } = setup();
    process.chdir(app);
    await runUpdate(config(template, false), sink(), { auto: true, dryRun: false, rollback: false });
    write(app, PROJECT_INSTRUCTIONS_FILE, `${STUB}\n## ACME\n\nour rule\n`);
    git(app, ['add', '-A']);
    git(app, ['commit', '--quiet', '-m', 'adopt sections']);
    await runUpdate(config(template, false), sink(), { auto: true, dryRun: false, rollback: false });
    expect(read(app, PROJECT_INSTRUCTIONS_FILE)).toContain('our rule');
  });
});

describe('a greenfield project of this release', () => {
  test('its first run leaves every file byte-identical, the stub overlay included', async () => {
    const template = tempRoot();
    initRepo(template);
    commit(template, { ...PREVIOUS_RELEASE, ...THIS_RELEASE }, 'release N');
    const app = tempRoot();
    initRepo(app);
    // What the scaffolder writes: the release, with the stub in place of the boilerplate's overlay.
    commit(app, { ...PREVIOUS_RELEASE, ...THIS_RELEASE, [PROJECT_INSTRUCTIONS_FILE]: STUB }, 'scaffold N');
    process.chdir(app);
    const before = tree(app);
    let applied: string[] = [];
    const summary = await runUpdate(config(template, false, (s) => { applied = s.applied.map(a => a.entry.path); }), sink(), { auto: true, dryRun: false, rollback: false });
    expect(summary.aborted).not.toBe(true);
    // A first run bootstraps every component (same bytes rewritten); agent-project.md is never one of them.
    expect(applied).toContain(`${INSTRUCTIONS_DIR}/agent-git.md`);
    expect(applied).not.toContain(PROJECT_INSTRUCTIONS_FILE);
    expect(tree(app)).toEqual(before);
  });
});

describe('a project that edited a synced section', () => {
  function setup(): { template: string, app: string } {
    const template = tempRoot();
    initRepo(template);
    const release = commit(template, { ...PREVIOUS_RELEASE, ...THIS_RELEASE }, 'release N');
    commit(template, {
      [`${INSTRUCTIONS_DIR}/agent-git.md`]: `${THIS_RELEASE[`${INSTRUCTIONS_DIR}/agent-git.md`]}\nupstream addition\n`,
      [`${INSTRUCTIONS_DIR}/agent-critical-rules.md`]: `${THIS_RELEASE[`${INSTRUCTIONS_DIR}/agent-critical-rules.md`]}\nupstream addition\n`,
    }, 'release N+1');
    const app = tempRoot();
    initRepo(app);
    commit(app, {
      ...PREVIOUS_RELEASE,
      ...THIS_RELEASE,
      [PROJECT_INSTRUCTIONS_FILE]: STUB,
      [`${INSTRUCTIONS_DIR}/agent-git.md`]: `${THIS_RELEASE[`${INSTRUCTIONS_DIR}/agent-git.md`]}\nproject edit\n`,
      [`${INSTRUCTIONS_DIR}/agent-critical-rules.md`]: `${THIS_RELEASE[`${INSTRUCTIONS_DIR}/agent-critical-rules.md`]}\nproject edit\n`,
      [VERSION_FILE]: lock(template, release, ['scripts', 'instructions']),
    }, 'scaffold N + edits');
    return { template, app };
  }

  test('an edit is overwritten with a backup and reported; a path in updater.protected_paths is kept', async () => {
    const { template, app } = setup();
    process.chdir(app);
    const protectedSection = `${INSTRUCTIONS_DIR}/agent-critical-rules.md`;
    const summary = await runUpdate(config(template, false, () => {}, [protectedSection]), sink(), { auto: true, dryRun: false, rollback: false });
    expect(summary.aborted).not.toBe(true);

    const edited = `${INSTRUCTIONS_DIR}/agent-git.md`;
    expect(read(app, edited)).toContain('upstream addition');
    expect(read(app, edited)).not.toContain('project edit');
    expect(summary.localEditsOverwritten).toEqual([{ path: edited, component: 'instructions' }]);
    expect(summary.backupDir).toBeTruthy();
    expect(existsSync(join(summary.backupDir!, edited))).toBe(true);
    expect(read(summary.backupDir!, edited)).toContain('project edit');

    expect(read(app, protectedSection)).toContain('project edit');
    expect(read(app, protectedSection)).not.toContain('upstream addition');
  });
});

describe('an existing app adopted with --adopt', () => {
  test('gets the sections and the generic stub, and its own files stay untouched', async () => {
    const template = tempRoot();
    initRepo(template);
    commit(template, { ...PREVIOUS_RELEASE, ...THIS_RELEASE }, 'release N');
    const app = tempRoot();
    initRepo(app);
    commit(app, { 'scripts/tool.ts': 'the app tool\n', 'src/index.ts': 'export const a = 1;\n' }, 'app');
    process.chdir(app);
    const summary = await runUpdate({ ...config(template, false), adopted: true }, sink(), { auto: true, dryRun: false, rollback: false, adopt: true });
    expect(summary.aborted).not.toBe(true);
    expect(read(app, `${INSTRUCTIONS_DIR}/agent-git.md`)).toBe(THIS_RELEASE[`${INSTRUCTIONS_DIR}/agent-git.md`]);
    expect(read(app, PROJECT_INSTRUCTIONS_FILE)).toBe(STUB);
    expect(read(app, 'scripts/tool.ts')).toBe('the app tool\n');
  });
});

describe('a project scaffolded with the numbered section names', () => {
  const OLD = (name: string): string => `${INSTRUCTIONS_DIR}/${name}`;
  const NUMBERED_AGENTS = THIS_RELEASE['AGENTS.md']
    .replaceAll('agent-critical-rules.md', '01-critical-rules.md')
    .replaceAll('agent-git.md', '80-git.md')
    .replaceAll('agent-project.md', 'project.md');
  /** Release N-1: the same sections under their numbered names, the overlay as `project.md`. */
  const NUMBERED_RELEASE: Record<string, string> = {
    ...PREVIOUS_RELEASE,
    'AGENTS.md': NUMBERED_AGENTS,
    [OLD('README.md')]: THIS_RELEASE[OLD('README.md')],
    [OLD('01-critical-rules.md')]: THIS_RELEASE[OLD('agent-critical-rules.md')],
    [OLD('80-git.md')]: THIS_RELEASE[OLD('agent-git.md')],
    [OLD('project.md')]: OWN_PROJECT_MD,
    [OLD('project.md.template')]: STUB,
  };
  const ACME_OVERLAY = `${STUB}\n## ACME\n\nour own rule, kept byte for byte\n`;

  /** The wrapper's shape after the rename: the numbered copies retired, the legacy overlay excluded and moved. */
  function renameConfig(template: string, dryRun: boolean): UpdaterConfig {
    const base = config(template, dryRun);
    return {
      ...base,
      deprecatedFiles: RETIRED_SECTION_FILES,
      excludePaths: [...(base.excludePaths ?? []), LEGACY_PROJECT_INSTRUCTIONS_FILE],
      hooks: {
        afterApply: async () => {
          migrateLegacyProjectInstructions(process.cwd(), { dryRun });
          deliverProjectInstructionsStub(process.cwd(), base.tempDir, { dryRun });
        },
      },
    };
  }

  function setup(): { template: string, app: string } {
    const template = tempRoot();
    initRepo(template);
    const previous = commit(template, NUMBERED_RELEASE, 'release N-1');
    commit(template, { ...Object.fromEntries(Object.keys(NUMBERED_RELEASE).map(k => [k, null])), ...PREVIOUS_RELEASE, ...THIS_RELEASE }, 'release N');
    const app = tempRoot();
    initRepo(app);
    const { [OLD('project.md')]: _own, ...synced } = NUMBERED_RELEASE;
    commit(app, {
      ...synced,
      [OLD('80-git.md')]: `${NUMBERED_RELEASE[OLD('80-git.md')]}\nproject edit\n`,
      [OLD('project.md')]: ACME_OVERLAY,
      [VERSION_FILE]: lock(template, previous, ['scripts', 'instructions']),
    }, 'scaffold N-1');
    return { template, app };
  }

  test('a dry run writes nothing', async () => {
    const { template, app } = setup();
    process.chdir(app);
    const before = tree(app);
    const summary = await runUpdate(renameConfig(template, true), sink(), { auto: true, dryRun: true, rollback: false });
    expect(summary.aborted).not.toBe(true);
    expect(tree(app)).toEqual(before);
  });

  test('retires the numbered copies with a backup, moves project.md byte for byte, and flags the AGENTS.md paths', async () => {
    const { template, app } = setup();
    process.chdir(app);
    const summary = await runUpdate(renameConfig(template, false), sink(), { auto: true, dryRun: false, rollback: false });
    expect(summary.aborted).not.toBe(true);

    for (const name of ['01-critical-rules.md', '80-git.md', 'project.md.template', 'project.md']) {
      expect(existsSync(join(app, OLD(name)))).toBe(false);
    }
    expect(read(app, OLD('agent-critical-rules.md'))).toBe(THIS_RELEASE[OLD('agent-critical-rules.md')]);
    expect(read(app, OLD('agent-git.md'))).toBe(THIS_RELEASE[OLD('agent-git.md')]);
    expect(read(app, PROJECT_INSTRUCTIONS_TEMPLATE)).toBe(STUB);
    // The overlay moved, never regenerated from the template.
    expect(read(app, PROJECT_INSTRUCTIONS_FILE)).toBe(ACME_OVERLAY);

    // The edited numbered copy survives in the run's backup folder.
    const backups = readdirSync(join(app, '.backups')).map(d => join(app, '.backups', d, OLD('80-git.md'))).filter(f => existsSync(f));
    expect(backups.length).toBe(1);
    expect(readFileSync(backups[0], 'utf8')).toContain('project edit');

    // The protected L0 is never rewritten; the drift row names each stale path.
    expect(read(app, 'AGENTS.md')).toBe(NUMBERED_AGENTS);
    const evidence = collectParityFindings({
      root: app,
      upstreamDir: join(template),
      drift: [{ path: 'AGENTS.md', reason: 'per-project AI memory', structural: false }],
      compatErrors: [],
      archivedSkills: [],
      archivedSkillsDir: join(app, 'archive'),
      heldBack: [],
      envNewKeys: [],
      contextMaps: [],
    }).find(f => f.path === 'AGENTS.md')?.evidence ?? '';
    expect(evidence).toContain('pre-rename name: rename 01-critical-rules.md -> agent-critical-rules.md, 80-git.md -> agent-git.md, project.md -> agent-project.md');
  });
});
