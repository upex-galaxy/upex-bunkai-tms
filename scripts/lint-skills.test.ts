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
const VERCEL_CLI_FRONTMATTER = '---\nname: vercel-cli\nmetadata:\n  kind: utility\n---\n\n# vercel-cli\n';

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
    'metadata:',
    '  kind: workflow',
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
  write(root, '.agents/skills/vercel-cli/SKILL.md', VERCEL_CLI_FRONTMATTER);
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

describe('lint-skills volatile facts (Critical Rule #17, checks 16-17)', () => {
  test('a path:line citation and a dated claim in a T1 body are FILE-LINE / CURRENT-STATE errors that fail the gate', () => {
    const root = fixture('(T3)');
    write(root, '.agents/skills/vercel-cli/SKILL.md', `${VERCEL_CLI_FRONTMATTER}\nSee \`cli/install.ts:403\`.\nMeasured 2026-09-17 on a live deploy.\n`);
    const { exitCode, stdout } = runLint(root);

    expect(stdout).toContain('[ERROR/FILE-LINE] .agents/skills/vercel-cli/SKILL.md — line 9: `cli/install.ts:403`');
    expect(stdout).toContain('[ERROR/CURRENT-STATE] .agents/skills/vercel-cli/SKILL.md — line 10: `Measured 2026-09-17`');
    expect(exitCode).toBe(1);
  });

  test('AGENTS.md is scanned too; a fenced block, a volatile-ok line and a community skill are not', () => {
    const root = fixture('(T3)');
    write(root, 'AGENTS.md', [
      '# AGENTS',
      '',
      'Since 8.4 the updater does X.',
      '```',
      'x.ts:12 today',
      '```',
      'The bad form is `scripts/x.ts:1` <!-- volatile-ok: teaching example -->',
    ].join('\n'));
    write(root, '.agents/skills/shadcn/SKILL.md', '---\nname: shadcn\n---\n\n# shadcn\n\nUpdated today.\n');
    const { stdout } = runLint(root);

    expect(stdout).toContain('[ERROR/CURRENT-STATE] AGENTS.md — line 3: `Since 8.4`');
    expect(stdout).not.toContain('FILE-LINE]');
    expect(stdout).not.toContain('shadcn/SKILL.md');
  });
});

/** Writes a T1 skill whose frontmatter carries the given `metadata:` lines. */
function skill(root: string, slug: string, metadata: string[], body = ''): void {
  write(root, `.agents/skills/${slug}/SKILL.md`, ['---', `name: ${slug}`, 'metadata:', ...metadata.map(l => `  ${l}`), '---', '', `# ${slug}`, '', body].join('\n'));
}

describe('lint-skills purpose axis (checks 18-20)', () => {
  test('a T1 skill without `metadata.kind` is KIND-MISSING; a committed community skill is not', () => {
    const root = fixture('(T3)');
    write(root, '.agents/skills/git-flow-master/SKILL.md', '---\nname: git-flow-master\n---\n\n# git-flow-master\n');
    const { exitCode, stdout } = runLint(root);

    expect(stdout).toContain('[ERROR/KIND-MISSING] frontmatter must declare `metadata.kind`');
    expect(stdout.match(/KIND-MISSING/g)?.length).toBe(1);
    expect(exitCode).toBe(1);
  });

  test('a kind outside the vocabulary is KIND-VOCAB', () => {
    const root = fixture('(T3)');
    skill(root, 'git-flow-master', ['kind: procedure']);
    expect(runLint(root).stdout).toContain('[ERROR/KIND-VOCAB] `metadata.kind: procedure`');
  });

  test('the suffix binds both ways; grandfathered slugs skip it', () => {
    const root = fixture('(T3)');
    skill(root, 'billing-context', ['kind: workflow']);
    skill(root, 'deploy-notes', ['kind: utility']);
    skill(root, 'project-context', ['kind: workflow']);
    skill(root, 'acli', ['kind: utility']);
    const { stdout } = runLint(root);

    expect(stdout).toContain('[ERROR/KIND-SUFFIX] slug ends `-context` so `metadata.kind` must be `context`, found `workflow`');
    expect(stdout).toContain('[ERROR/KIND-SUFFIX] `metadata.kind: utility` requires a slug ending `-cli` / `-tool` / `-app`');
    expect(stdout.match(/KIND-SUFFIX/g)?.length).toBe(2);
  });
});

describe('lint-skills capabilities (checks 21-22)', () => {
  test('a capability outside the mcp-capabilities.md vocabulary is CAPABILITY-VOCAB', () => {
    const root = fixture('(T3)');
    skill(root, 'git-flow-master', ['kind: workflow', 'requires_capabilities: [db, tavily]']);
    const { exitCode, stdout } = runLint(root);

    expect(stdout).toContain('[ERROR/CAPABILITY-VOCAB] `metadata.requires_capabilities` names `tavily`');
    expect(stdout).not.toContain('names `db`');
    expect(exitCode).toBe(1);
  });

  test('a tag in the body without its capability is a CAPABILITY-UNDECLARED warning; a fenced tag and a core skill are not', () => {
    const root = fixture('(T3)');
    skill(root, 'git-flow-master', ['kind: workflow', 'requires_capabilities: [db]'], 'Run `[DB_TOOL]` then `[DOCS_TOOL]`.\n\n```\n[WEB_SEARCH_TOOL]\n```\n');
    skill(root, 'agentic-dev-core', ['kind: core'], 'The `[AUTOMATION_FLOWS_TOOL]` tag resolves to n8n.\n');
    const { exitCode, stdout } = runLint(root);

    expect(stdout).toContain('[WARN/CAPABILITY-UNDECLARED] body uses `[DOCS_TOOL]`');
    expect(stdout.match(/CAPABILITY-UNDECLARED/g)?.length).toBe(1);
    expect(exitCode).toBe(0);
  });
});

describe('lint-skills stage owners and context write scope (checks 23-25)', () => {
  test('a stage owner needs a dispatch section, in any of the three spellings', () => {
    const root = fixture('(T3)');
    skill(root, 'sprint-development', ['kind: workflow', 'stage_owner: true'], '## Stages\n');
    skill(root, 'product-management', ['kind: workflow', 'stage_owner: true'], '## Session & Dispatch\n');
    skill(root, 'project-bootstrap', ['kind: workflow', 'stage_owner: true'], '## Subagent dispatch\n');
    const { stdout } = runLint(root);

    expect(stdout).toContain('[ERROR/STAGE-OWNER-DISPATCH]');
    expect(stdout.match(/STAGE-OWNER-DISPATCH/g)?.length).toBe(1);
  });

  test('`metadata.writes` is only for a context skill, only under its own references/, with refresh.md and no tracker tag', () => {
    const root = fixture('(T3)');
    skill(root, 'git-flow-master', ['kind: workflow', 'writes: [references/]']);
    skill(root, 'billing-context', ['kind: context', 'writes: [references/, ../sprint-development/]'], 'Post the change with `[ISSUE_TRACKER_TOOL]`.\n');
    const { exitCode, stdout } = runLint(root);

    expect(stdout).toContain('[ERROR/CONTEXT-WRITES] `metadata.writes` is the context-kind amendment; a `workflow` skill');
    expect(stdout).toContain('[ERROR/CONTEXT-WRITES] `metadata.writes` names `../sprint-development/`');
    expect(stdout).toContain('[ERROR/CONTEXT-WRITES] a context skill that declares `metadata.writes` must carry `references/refresh.md`');
    expect(stdout).toContain('[ERROR/CONTEXT-WRITES] a context skill with a write scope carries `[ISSUE_TRACKER_TOOL]`');
    expect(exitCode).toBe(1);
  });

  test('a well-formed context skill passes; its `.context/` cites must exist, except the PBI cache', () => {
    const root = fixture('(T3)');
    write(root, '.context/business/business-data-map.md', '# map\n');
    skill(root, 'billing-context', ['kind: context', 'writes: [references/]'], 'Reads `.context/business/business-data-map.md` and `.context/PBI/epics/x.md`.\n');
    write(root, '.agents/skills/billing-context/references/refresh.md', '# refresh\n');
    expect(runLint(root).exitCode).toBe(0);

    skill(root, 'billing-context', ['kind: context', 'writes: [references/]'], 'Reads `.context/business/missing-map.md`.\n');
    const { exitCode, stdout } = runLint(root);
    expect(stdout).toContain('[ERROR/STALE-PATH] `.context/business/missing-map.md` cited by a context skill does not exist on disk');
    expect(exitCode).toBe(1);
  });
});

describe('lint-skills on an adopted app', () => {
  const APP_SKILL = '---\nname: app-email\n---\n\n# app-email\n\nSee `cli/install.ts:403`. Measured 2026-09-17.\n';

  test('the app\'s own skills are listed, not linted; the framework\'s still are', () => {
    const root = fixture('(T3)');
    write(root, '.agents/skills/app-email/SKILL.md', APP_SKILL);
    write(root, '.template/installer.lock.json', `${JSON.stringify({ adopted: true, upstreamOwned: { scripts: [], skills: ['unit-testing', 'vercel-cli', 'agentic-dev-core'] } })}\n`);
    const clean = runLint(root);
    expect(clean.stdout).toContain('(+ 1 skills of the adopted app, outside the framework\'s doctrine: not linted here)');
    expect(clean.stdout).not.toContain('app-email/SKILL.md');
    expect(clean.exitCode).toBe(0);

    write(root, '.agents/skills/vercel-cli/SKILL.md', `${VERCEL_CLI_FRONTMATTER}\nSee \`cli/install.ts:403\`.\n`);
    const red = runLint(root);
    expect(red.stdout).toContain('[ERROR/FILE-LINE] .agents/skills/vercel-cli/SKILL.md');
    expect(red.exitCode).toBe(1);
  });

  test('without the list (greenfield) the same skill is linted as before', () => {
    const root = fixture('(T3)');
    write(root, '.agents/skills/app-email/SKILL.md', APP_SKILL);
    const { exitCode, stdout } = runLint(root);
    expect(stdout).toContain('app-email/SKILL.md');
    expect(exitCode).toBe(1);
  });
});

describe('lint-skills: a framework skill still on the app\'s hand copy', () => {
  test('is listed as take-upstream pending, not linted, while upstream\'s copy waits in .agents/prompts/adopt-upstream/', () => {
    const root = fixture('(T3)');
    write(root, '.agents/skills/vercel-cli/SKILL.md', `${VERCEL_CLI_FRONTMATTER}\nSee \`cli/install.ts:403\`.\n`);
    write(root, '.template/installer.lock.json', `${JSON.stringify({ adopted: true, upstreamOwned: { scripts: [], skills: ['unit-testing', 'vercel-cli', 'agentic-dev-core'] } })}\n`);
    write(root, '.agents/prompts/adopt-upstream/vercel-cli/SKILL.md', VERCEL_CLI_FRONTMATTER);
    const pending = runLint(root);
    expect(pending.stdout).toContain('take-upstream pending');
    expect(pending.stdout).not.toContain('[ERROR/FILE-LINE] .agents/skills/vercel-cli/SKILL.md');
    expect(pending.exitCode).toBe(0);

    // Taken (the saved copy is gone): linted again.
    rmSync(join(root, '.agents/prompts/adopt-upstream'), { recursive: true, force: true });
    expect(runLint(root).exitCode).toBe(1);
  });
});

describe('lint-skills T4 loaders (check 26, T4-LOADER)', () => {
  /** The fixture repo with `slugs` as USER_LEVEL_SKILLS and, when `rows` is given, the onboard loader table. */
  function withUserLevel(slugs: string[], rows: Array<[slug: string, loader: string]> | null): string {
    const root = fixture('(T3)');
    write(root, 'cli/install.ts', [
      'const PROJECT_LEVEL_SKILLS: ReadonlyArray<CommunitySkill> = [',
      '  { package: \'https://github.com/shadcn/ui\', skill: \'shadcn\' },',
      '];',
      'const USER_LEVEL_SKILLS: ReadonlyArray<CommunitySkill> = [',
      ...slugs.map(slug => `  { package: 'https://example.com/${slug}', skill: '${slug}' },`),
      '];',
      '',
    ].join('\n'));
    if (rows !== null) {
      write(root, '.agents/skills/agentic-dev-onboard/SKILL.md', [
        '---',
        'name: agentic-dev-onboard',
        'metadata:',
        '  kind: core',
        '---',
        '',
        '## Community skills installed at user level',
        '',
        '| Skill | Source | Loaded by / when |',
        '| --- | --- | --- |',
        ...rows.map(([slug, loader]) => `| \`${slug}\` | example.com | ${loader} |`),
        '',
        '## Next steps',
        '',
        '| `late-skill` | example.com | `/sprint-development` |',
        '',
      ].join('\n'));
    }
    return root;
  }

  test('every user-level skill with a cited loader or "user-invoked only" passes', () => {
    const { exitCode, stdout } = runLint(withUserLevel(['deck-tool', 'slides-tool'], [
      ['deck-tool', 'any flow past the threshold in `/sprint-development`'],
      ['slides-tool', '**user-invoked only.**'],
    ]));

    expect(stdout).not.toContain('T4-LOADER');
    expect(exitCode).toBe(0);
  });

  test('a user-level skill with no row fails, and a row outside the section does not count', () => {
    const { exitCode, stdout } = runLint(withUserLevel(['deck-tool', 'late-skill'], [['deck-tool', '`/sprint-development`']]));

    expect(stdout).toMatch(/T4-LOADER\].*late-skill.*in USER_LEVEL_SKILLS but has no row/);
    expect(stdout).not.toMatch(/T4-LOADER\].*deck-tool/);
    expect(exitCode).toBe(1);
  });

  test('a row whose loader cell cites nothing fails', () => {
    const { exitCode, stdout } = runLint(withUserLevel(['deck-tool'], [['deck-tool', 'any flow that needs it']]));

    expect(stdout).toMatch(/T4-LOADER\].*deck-tool.*the "Loaded by \/ when" cell/);
    expect(exitCode).toBe(1);
  });

  test('user-level skills without the onboard skill fail once, naming the file', () => {
    const { exitCode, stdout } = runLint(withUserLevel(['deck-tool'], null));

    expect(stdout).toContain('.agents/skills/agentic-dev-onboard/SKILL.md is missing');
    expect(exitCode).toBe(1);
  });
});
