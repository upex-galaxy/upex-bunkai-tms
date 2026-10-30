import type { ParityFinding, ParityInput, ParityMeta } from './updater-parity.ts';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';
import {
  ABORTED_OUTRO,
  archivedSkillsToReport,
  browserProfileDrift,
  browserProfileSitesIn,
  buildParityFileBody,
  buildParityPrompt,
  collectParityFindings,
  compatErrorSuggestion,
  compatErrorSurface,
  CONFIG_BLOCK_READERS,
  configEntries,
  configKeyDelta,
  configKeys,
  describeWatchedFile,
  diffNoIndex,
  diffStats,
  frameworkGatesNote,
  harnessLevelMcpNote,
  markdownSectionDelta,
  missingConfigBlocks,
  PATH_PREREQUISITES,
  persistArchivedSkillMarkers,
  prerequisiteFor,
  protectNote,
  readGitStrategyStamp,
  renderParityReport,
  RETIRED_HARNESS_LAUNCHER,
  retiredMcpNote,
  runVerdict,
  strictVerdict,
  structuralEvidence,
  SURFACE_ORDER,
  watchedFileEvidence,
} from './updater-parity.ts';

const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'parity '));
  temporaryRoots.push(root);
  return root;
}

function write(root: string, relativePath: string, contents: string): void {
  const destination = join(root, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, contents);
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root) { rmSync(root, { recursive: true, force: true }); }
  }
});

const META: ParityMeta = {
  templateRepo: 'upex-galaxy/agentic-dev-boilerplate',
  upstreamSha: 'abcdef1234567890',
  lockSha: '1234567abcdef',
  promptFile: '.agents/prompts/parity-plan.md',
};

const SHADOW_ERROR = 'Command shadows skill acli: .claude/commands/acli.md; a command with a skill\'s name hides the skill\'s instructions (`bun run agents:compat` moves it to .backups/shadowing-commands/)';

/** A project + upstream pair with every finding type present. */
function fixture(): { root: string, upstream: string, input: ParityInput } {
  const root = temporaryRoot();
  const upstream = temporaryRoot();

  // Instructions: upstream added a section, changed one, project has its own.
  write(root, 'AGENTS.md', '# Memory\n\n## 1. RULES\n\nold rule\n\n## 9. ACME ONLY\n\nours\n');
  write(upstream, 'AGENTS.md', '# Memory\n\n## 1. RULES\n\nnew rule\n\n## 5.5 MULTI-HARNESS\n\nthree hosts\n');

  // Hooks/config: project keeps its own permission entries, upstream added a key.
  write(root, '.claude/settings.json', JSON.stringify({ permissions: { allow: ['Bash(bun *)'] }, hooks: {} }, null, 2));
  write(upstream, '.claude/settings.json', JSON.stringify({ permissions: { allow: [], deny: [] }, hooks: {}, env: {} }, null, 2));

  // MCP: the Codex registry drifted (upstream added n8n) AND fails the set contract.
  write(root, '.codex/config.toml', '[mcp_servers.context7]\ncommand = "x"\n\n[mcp_servers.acme]\ncommand = "y"\n');
  write(upstream, '.codex/config.toml', '[mcp_servers.context7]\ncommand = "x"\n\n[mcp_servers.n8n]\ncommand = "z"\n');

  // Commands: the retired alias overlay is still on disk, its command is the
  // project's own now; one command carries a skill's name and fails the
  // contract, another was already moved aside by the compat hook this run.
  write(root, '.agents/compatibility/command-aliases.project.json', JSON.stringify({ version: 1, aliases: [{ alias: 'acme-deploy' }] }));
  write(root, '.claude/commands/acme-deploy.md', 'project command\n');
  write(root, '.claude/commands/acli.md', 'shadows the acli skill\n');

  // Skills: the migration archived a colliding copy.
  write(root, '.agents/skills/acli/SKILL.md', '---\nname: acli\n---\nupstream body\n');
  write(root, '.template/pre-agents-migration/skills/acli/SKILL.md', '---\nname: acli\n---\nproject body\n');

  // Git: shipped default nobody chose.
  write(root, '.agents/project.yaml', 'git_strategy:\n  strategy: solo-main\n  meta:\n    strategy_source: inherited\n');

  const input: ParityInput = {
    root,
    upstreamDir: upstream,
    drift: [
      { path: 'AGENTS.md', reason: 'memory' },
      { path: '.claude/settings.json', reason: 'permissions' },
      { path: '.codex/config.toml', reason: 'codex mcp registry' },
    ],
    compatErrors: [
      'MCP n8n missing from codex: declared in .mcp.json, absent from .codex/config.toml',
      'MCP acme present in codex only: declare it in .mcp.json or remove it from .codex/config.toml',
      SHADOW_ERROR,
      'claude hook command must be exactly: node "$CLAUDE_PROJECT_DIR/.agents/hooks/personality-reinject.mjs"',
    ],
    archivedSkills: ['acli'],
    archivedSkillsDir: join(root, '.template/pre-agents-migration/skills'),
    heldBack: [{ component: 'cli', lockCommit: 'deadbeefcafe' }, { component: 'docs', lockCommit: null }],
    envNewKeys: ['N8N_API_KEY', 'RESEND_API_KEY'],
    shadowingCommandsMoved: ['.opencode/commands/acli.md'],
  };
  return { root, upstream, input };
}

describe('section-level evidence', () => {
  test('markdown delta reports headings added upstream, changed, and project-only', () => {
    const delta = markdownSectionDelta(
      '# T\n\n## A\n\nsame\n\n## B\n\nmine\n\n## C\n\nours\n',
      '# T\n\n## A\n\nsame\n\n## B\n\ntheirs\n\n## D\n\nnew\n',
    );
    expect(delta.added).toEqual(['D']);
    expect(delta.changed).toEqual(['B']);
    expect(delta.removed).toEqual(['C']);
  });

  test('a heading changed only by punctuation counts as unchanged; hunk counts still come from the real diff', () => {
    // Em dash, en dash, spaced hyphen and colon are interchangeable separators.
    const sameBody = markdownSectionDelta(
      `# T\n\n## A ${'—'} B\n\nsame\n`,
      '# T\n\n## A: B\n\nsame\n',
    );
    expect(sameBody).toEqual({ added: [], removed: [], changed: [] });
    const alsoUnchanged = markdownSectionDelta(
      '# T\n\n## A - B\n\nsame\n',
      `# T\n\n## A ${'–'} B\n\nsame\n`,
    );
    expect(alsoUnchanged).toEqual({ added: [], removed: [], changed: [] });
    // A genuine body change under a punctuation-only heading rename is still caught.
    const changedBody = markdownSectionDelta(
      '# T\n\n## A - B\n\nmine\n',
      `# T\n\n## A ${'–'} B\n\ntheirs\n`,
    );
    expect(changedBody).toEqual({ added: [], removed: [], changed: [`A ${'–'} B`] });
    // A heading that is genuinely different (not just punctuation) still reports.
    const genuinelyDifferent = markdownSectionDelta('# T\n\n## A: B\n\nx\n', '# T\n\n## A: C\n\nx\n');
    expect(genuinelyDifferent).toEqual({ added: ['A: C'], removed: ['A: B'], changed: [] });
    // Hunk counts are a separate path from heading evidence: unaffected.
    const diff = '--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new\n';
    expect(describeWatchedFile('AGENTS.md', `## A ${'—'} B\n\nsame\n`, '## A: B\n\nsame\n', diff))
      .toBe('same headings and bodies; formatting or comments differ; 1 hunk (+1/-1)');
  });

  test('config keys go two levels deep for JSON, JSONC, TOML and YAML', () => {
    expect(configKeys('{"mcpServers":{"n8n":{}},"x":1}', '.mcp.json')).toEqual(['mcpServers', 'mcpServers.n8n', 'x']);
    expect(configKeys('{\n  // c\n  "mcp": { "n8n": {}, },\n}', 'opencode.jsonc')).toEqual(['mcp', 'mcp.n8n']);
    expect(configKeys('[mcp_servers.n8n]\ncommand = "x"\n', '.codex/config.toml')).toEqual(['mcp_servers', 'mcp_servers.n8n']);
    expect(configKeys('testing:\n  default_env: staging\ngit_strategy:\n  strategy: solo-main\n', '.agents/project.yaml'))
      .toEqual(['testing', 'testing.default_env', 'git_strategy', 'git_strategy.strategy']);
    expect(configKeys('export default {}', 'eslint.config.js')).toBeNull();
  });

  test('key delta separates upstream additions from project-only keys', () => {
    expect(configKeyDelta(['a', 'b.x'], ['a', 'b.y'])).toEqual({ added: ['b.y'], projectOnly: ['b.x'], changed: [], changedDetail: {}, changedArrays: [] });
    // With values (Maps) the shared keys whose values differ are named; a top
    // key with object children is judged through its children only.
    const mine = configEntries('{"a":1,"b":{"x":1,"y":[1]},"c":{"z":1}}', 'x.json')!;
    const theirs = configEntries('{"a":2,"b":{"x":1,"y":[2]},"c":{"z":1}}', 'x.json')!;
    expect(configKeyDelta(mine, theirs)).toEqual({ added: [], projectOnly: [], changed: ['a', 'b.y'], changedDetail: { 'b.y': 'added: ["2"], removed: ["1"]' }, changedArrays: ['b.y'] });
  });

  // An appended entry is not a changed value: `.claude/settings.json` used to
  // read "values differ at permissions.allow" when upstream had only appended
  // `Skill(...)` permissions. The array delta names the elements instead.
  test('an array on both sides reports its added and removed elements', () => {
    const mine = configEntries('{"permissions":{"allow":["Read","Skill(acli)","mcp__tavily__*"]}}', '.claude/settings.json')!;
    const theirs = configEntries('{"permissions":{"allow":["Read","Skill(acli)","Skill(vercel-cli)"]}}', '.claude/settings.json')!;
    const { evidence } = watchedFileEvidence('.claude/settings.json', '{"permissions":{"allow":["Read","Skill(acli)","mcp__tavily__*"]}}', '{"permissions":{"allow":["Read","Skill(acli)","Skill(vercel-cli)"]}}', '');
    expect(configKeyDelta(mine, theirs).changedArrays).toEqual(['permissions.allow']);
    expect(evidence).toContain('"permissions.allow": added: ["Skill(vercel-cli)"], removed: ["mcp__tavily__*"]');
    expect(evidence).not.toContain('values differ at');
  });

  test('watched-file evidence names sections for markdown and keys for config, plus hunk counts', () => {
    const diff = '--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new\n@@ -5 +5 @@\n+added\n';
    expect(diffStats(diff)).toEqual({ hunks: 2, added: 2, removed: 1 });
    const md = describeWatchedFile('AGENTS.md', '## A\n\nx\n', '## A\n\ny\n\n## B\n\nz\n', diff);
    expect(md).toBe('port upstream additions only: "B"; keep project bodies at: "A"; 2 hunks (+2/-1)');
    const json = describeWatchedFile('.mcp.json', '{"mcpServers":{"a":{}}}', '{"mcpServers":{"a":{},"b":{}}}', diff);
    expect(json).toBe('upstream added 1 key: "mcpServers.b"; nothing project-only; 2 hunks (+2/-1)');
    expect(describeWatchedFile('eslint.config.js', 'a', 'b', diff)).toBe('content differs (no key structure): review the hunks in the saved file; 2 hunks (+2/-1)');
  });

  test('cost signal: the verb follows what porting upstream adds and what it costs the project', () => {
    // Live finding (Bunkai): tsconfig.json read `merge` with no cost signal,
    // while applying upstream literally would have dropped the Next.js keys.
    const diff = '--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new\n';
    const row = (project: string, upstream: string, file = 'x.json'): [string, string] => {
      const e = watchedFileEvidence(file, project, upstream, diff);
      return [e.suggested, e.evidence.replace(/; 1 hunk \(\+1\/-1\)$/, '')];
    };
    // Both: port the additions, keep the project's own keys.
    expect(row('{"compilerOptions":{"jsx":"preserve","paths":{}}}', '{"compilerOptions":{"paths":{},"allowJs":true},"include":[]}'))
      .toEqual(['merge', 'port upstream additions only: "compilerOptions.allowJs", "include"; keep project-only key: "compilerOptions.jsx"']);
    // Only upstream additions, nothing else differs: nothing to lose.
    expect(row('{"a":{"x":1}}', '{"a":{"x":1,"y":2}}')).toEqual(['take upstream', 'upstream added 1 key: "a.y"; nothing project-only']);
    // Upstream additions next to project values at shared keys: port the additions only.
    expect(row('{"a":{"x":1}}', '{"a":{"x":2,"y":2}}')).toEqual(['merge', 'port upstream additions only: "a.y"; keep project values at: "a.x"']);
    // Only project-only keys: nothing to port.
    expect(row('{"a":{"x":1},"mine":{}}', '{"a":{"x":1}}')).toEqual(['keep project', 'project-only key: "mine"; upstream adds nothing']);
    expect(row('{"a":{"x":1},"mine":{}}', '{"a":{"x":2}}')).toEqual(['merge', 'keep project-only key: "mine"; values differ at: "a.x" (port what you want)']);
    // Same keys: the changed values are named, never a bare merge.
    expect(row('{"a":{"x":1}}', '{"a":{"x":2}}')).toEqual(['merge', 'same keys, values differ at: "a.x" (port what you want, keep the rest)']);
    expect(row('{"a":{"x":1}}', '{ "a": { "x": 1 } }')).toEqual(['keep project', 'same keys and values; formatting or comments differ']);
    // Markdown: the same table over headings.
    expect(row('## A\n\nx\n\n## MINE\n\nm\n', '## A\n\nx\n\n## B\n\nb\n', 'AGENTS.md'))
      .toEqual(['merge', 'port upstream additions only: "B"; keep project-only heading: "MINE"']);
    expect(row('## A\n\nx\n', '## A\n\nx\n\n## B\n\nb\n', 'AGENTS.md')).toEqual(['take upstream', 'upstream added 1 heading: "B"; nothing project-only']);
    expect(row('## A\n\nx\n\n## MINE\n\nm\n', '## A\n\nx\n', 'AGENTS.md')).toEqual(['keep project', 'project-only heading: "MINE"; upstream adds nothing']);
    expect(row('## A\n\nx\n', '## A\n\ny\n', 'AGENTS.md')).toEqual(['merge', 'same headings, body differs in 1: "A" (port what you want, keep the rest)']);
    // TOML and YAML carry values too.
    expect(row('[a]\nx = 1\n', '[a]\nx = 2\n', 'c.toml')[1]).toBe('same keys, values differ at: "a.x" (port what you want, keep the rest)');
    expect(row('a:\n  x: 1\n', 'a:\n  x: 1\n  y: 2\n', 'p.yaml')).toEqual(['take upstream', 'upstream added 1 key: "a.y"; nothing project-only']);
  });

  test('structural (identity) files: a row only for upstream additions, labelled informational; values are never compared', () => {
    expect(structuralEvidence('.agents/project.yaml', 'project:\n  name: acme\n', 'project:\n  name: null\n')).toBeNull();
    expect(structuralEvidence('.agents/project.yaml', 'project:\n  name: acme\n  extra: 1\n', 'project:\n  name: null\n')).toBeNull();
    expect(structuralEvidence('.agents/project.yaml', 'project:\n  name: acme\n', 'project:\n  name: null\nupdater:\n  protected_paths: []\n'))
      .toBe('informational: upstream added 2 keys: "updater", "updater.protected_paths"; merge = add the new keys, values are project identity and never compared');
    expect(structuralEvidence('x.md', '## A\n\nmine\n', '## A\n\ntheirs\n')).toBeNull();
    expect(structuralEvidence('x.md', '## A\n', '## A\n\n## B\n')).toBe('informational: upstream added 1 heading: "B"; merge = add the new headings, values are project identity and never compared');
  });
});

describe('compat error classification', () => {
  test('surface and suggestion follow the wording', () => {
    // A command with a skill's name is a skills problem, and the repair moves it.
    expect(compatErrorSurface(SHADOW_ERROR)).toBe('skills');
    expect(compatErrorSuggestion(SHADOW_ERROR)).toBe('run agents:compat');
    expect(compatErrorSurface('Claude skills alias missing: .claude/skills')).toBe('skills');
    expect(compatErrorSuggestion('Claude skills alias missing: .claude/skills')).toBe('run agents:compat');
    expect(compatErrorSurface('codex hook command must be exactly: …')).toBe('hooks');
    expect(compatErrorSuggestion('codex hook command must be exactly: …')).toBe('take upstream');
    expect(compatErrorSurface('opencode MCP n8n mismatch: expected {…}, found {…}')).toBe('mcp');
  });

  // On an adopted app the consumer is the synced tooling config: restoring
  // upstream's copy is the fix, and the row names that file.
  test('an unwired block in eslint.config.tooling.mjs is a take-upstream row on that file', () => {
    const root = temporaryRoot();
    const error = 'eslint.config.tooling.mjs does not wire CLI_IMPORT_CLOSURE from eslint.config.base.js: the rule ships but enforces nothing. Add it to the import and to the antfu(...) call.';
    expect(compatErrorSuggestion(error)).toBe('take upstream');
    const findings = collectParityFindings({
      root,
      upstreamDir: temporaryRoot(),
      drift: [],
      compatErrors: [error],
      archivedSkills: [],
      archivedSkillsDir: join(root, 'archive'),
      heldBack: [],
      envNewKeys: [],
    });
    expect(findings.find(f => f.evidence.includes('does not wire'))?.path).toBe('eslint.config.tooling.mjs');
  });

  // The base is synced, `eslint.config.js` is watched: an unwired block is a
  // merge into the project file, and it folds onto that file's drift row.
  test('an unwired eslint block lands on eslint.config.js as a blocking merge, folded with its drift', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    write(root, 'eslint.config.js', 'export default antfu({});\n');
    write(upstream, 'eslint.config.js', 'import { CLI_IMPORT_CLOSURE } from \'./eslint.config.base.js\';\nexport default antfu({}, CLI_IMPORT_CLOSURE);\n');
    const error = 'eslint.config.js does not wire CLI_IMPORT_CLOSURE from eslint.config.base.js: the rule ships but enforces nothing. Add it to the import and to the antfu(...) call.';
    expect(compatErrorSurface(error)).toBe('gates');
    expect(compatErrorSuggestion(error)).toBe('merge');
    const findings = collectParityFindings({
      root,
      upstreamDir: upstream,
      drift: [{ path: 'eslint.config.js', reason: 'project-owned overrides' }],
      compatErrors: [error],
      archivedSkills: [],
      archivedSkillsDir: join(root, 'archive'),
      heldBack: [],
      envNewKeys: [],
    });
    const rows = findings.filter(f => f.path === 'eslint.config.js');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ surface: 'gates', suggested: 'merge', blocking: true });
    expect(rows[0].evidence).toContain('does not wire CLI_IMPORT_CLOSURE');
  });
});

describe('diffNoIndex', () => {
  test('relabels the two absolute paths as project/ and upstream/, forward slashes included', () => {
    const root = temporaryRoot();
    write(root, 'a/AGENTS.md', '# one\n');
    write(root, 'b/AGENTS.md', '# two\n');
    const diff = diffNoIndex(join(root, 'a', 'AGENTS.md'), join(root, 'b', 'AGENTS.md'));
    expect(diff).toContain('--- a/project/AGENTS.md');
    expect(diff).toContain('+++ b/upstream/AGENTS.md');
    expect(diff).not.toContain(root);
    // A Windows-style caller path is normalized before the relabel, so the
    // forward-slash header git prints still matches it.
    const windowsStyle = diffNoIndex(join(root, 'a', 'AGENTS.md').replace(/\//g, '\\'), join(root, 'b', 'AGENTS.md').replace(/\//g, '\\'));
    if (windowsStyle !== '') { expect(windowsStyle).not.toContain(root); }
  });
});

describe('collectParityFindings', () => {
  test('produces one finding per type, sequential ids, evidence on every row', () => {
    const { input } = fixture();
    const findings = collectParityFindings(input);

    expect(findings.map(f => f.id)).toEqual(findings.map((_, i) => i + 1));
    for (const f of findings) { expect(f.evidence.length).toBeGreaterThan(0); }

    const byPath = (p: string): ParityFinding => {
      const f = findings.find(x => x.path === p);
      if (!f) { throw new Error(`no finding for ${p}: ${findings.map(x => x.path).join(', ')}`); }
      return f;
    };

    const agents = byPath('AGENTS.md');
    expect(agents.surface).toBe('instructions');
    expect(agents.blocking).toBe(false);
    expect(agents.suggested).toBe('merge');
    expect(agents.evidence).toContain('port upstream additions only: "5.5 MULTI-HARNESS"');
    expect(agents.evidence).toContain('keep project-only heading: "9. ACME ONLY"');
    expect(agents.evidence).toContain('body differs in 1: "1. RULES"');
    expect(agents.evidence).toMatch(/\d+ hunks? \(\+\d+\/-\d+\)$/);
    expect(agents.diff).toContain('@@');

    const settings = byPath('.claude/settings.json');
    expect(settings.surface).toBe('hooks');
    expect(settings.evidence).toContain('port upstream additions only: "permissions.deny", "env"; keep project values at: "permissions.allow"');
    expect(settings.suggested).toBe('merge');
    expect(settings.diff).toContain('-      "Bash(bun *)"');

    // MCP set errors fold into one row per host, and the watched-file drift on
    // the same path folds into THAT row: compat evidence first, drift evidence
    // appended, the full diff kept, upstream's shape suggested.
    const codex = byPath('.codex/config.toml');
    expect(codex.surface).toBe('mcp');
    expect(codex.blocking).toBe(true);
    expect(codex.evidence).toMatch(/^missing: n8n \(declared in \.mcp\.json\); only here: acme \(not in \.mcp\.json\): declare them in \.mcp\.json and opencode\.jsonc, or remove them; port upstream additions only: "mcp_servers\.n8n"; keep project-only key: "mcp_servers\.acme"; \d+ hunks? \(\+\d+\/-\d+\)$/);
    // Following `take upstream` literally would delete `acme`, the project's own
    // server: a row naming project-only content always suggests `merge`.
    expect(codex.suggested).toBe('merge');
    expect(codex.diff).toContain('+[mcp_servers.n8n]');
    expect(findings.filter(f => f.path === '.codex/config.toml')).toHaveLength(1);
    expect(findings.filter(f => f.surface === 'mcp')).toHaveLength(1);

    const shadow = byPath('.claude/commands/acli.md');
    expect(shadow.surface).toBe('skills');
    expect(shadow.blocking).toBe(true);
    expect(shadow.suggested).toBe('run agents:compat');

    const hook = findings.find(f => f.surface === 'hooks' && f.blocking);
    expect(hook?.suggested).toBe('take upstream');

    const archived = byPath('.template/pre-agents-migration/skills/acli');
    expect(archived.surface).toBe('skills');
    expect(archived.evidence).toMatch(/^archived collision vs \.agents\/skills\/acli: 1 hunk \(\+1\/-1\)$/);
    expect(archived.suggested).toBe('decide');
    expect(archived.diff).toContain('project body');

    // The command the hook moved this run: informational, names the backup.
    const moved = byPath('.opencode/commands/acli.md');
    expect(moved.surface).toBe('skills');
    expect(moved.blocking).toBe(false);
    expect(moved.evidence).toContain('moved to .backups/shadowing-commands/.opencode/commands/acli.md');

    // The retired overlay: ONE informational row; the command it declared is
    // the project's own file now and never a row.
    const overlay = byPath('.agents/compatibility/command-aliases.project.json');
    expect(overlay.surface).toBe('components');
    expect(overlay.blocking).toBe(false);
    expect(overlay.evidence).toMatch(/^informational: command aliases are retired/);
    expect(findings.some(f => f.path === '.claude/commands/acme-deploy.md')).toBe(false);

    const held = byPath('.template/boilerplate.lock.json');
    expect(held.surface).toBe('components');
    expect(held.evidence).toBe('held back: cli@deadbee, docs@no lock');

    const env = byPath('.env');
    expect(env.surface).toBe('env');
    expect(env.evidence).toBe('upstream .env.example added 2 key(s): N8N_API_KEY, RESEND_API_KEY');

    const git = byPath('.agents/project.yaml');
    expect(git.surface).toBe('git');
    expect(git.evidence).toContain('strategy_source: inherited');
    expect(git.blocking).toBe(false);
  });

  test('a fully aligned project yields zero findings', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    write(root, '.claude/commands/acme-deploy.md', 'a project command with its own name\n');
    write(root, '.agents/project.yaml', 'git_strategy:\n  strategy: solo-main\n  meta:\n    strategy_source: chosen\n');
    const findings = collectParityFindings({
      root,
      upstreamDir: upstream,
      drift: [],
      compatErrors: [],
      archivedSkills: [],
      archivedSkillsDir: join(root, '.template/pre-agents-migration/skills'),
      heldBack: [],
      envNewKeys: [],
    });
    expect(findings).toEqual([]);
  });

  test('a project skill that opens a browser on a disk profile gets one informational row per file, every line named, the file untouched', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    write(root, '.agents/project.yaml', 'git_strategy:\n  strategy: solo-main\n  meta:\n    strategy_source: chosen\n');
    const skill = [
      '# Sprint development',
      'playwright-cli -s=TK-{n} open --profile=.playwright/profiles/TK-{n}',
      'Add `--persistent` only if you need it: `playwright-cli -s=TK-1 open https://app --persistent`',
      '',
    ].join('\n');
    write(root, '.agents/skills/sprint-development/SKILL.md', skill);
    write(root, 'AGENTS.md', `Open \`playwright-cli -s=W1 open --profile="${join(root, '.playwright/profiles/W1')}"\`.\n`);
    const findings = (): ReturnType<typeof collectParityFindings> => collectParityFindings({
      root,
      upstreamDir: upstream,
      drift: [],
      compatErrors: [],
      archivedSkills: [],
      archivedSkillsDir: join(root, '.template/pre-agents-migration/skills'),
      heldBack: [],
      envNewKeys: [],
    });

    expect(browserProfileDrift(root)).toEqual([
      { file: 'AGENTS.md', line: 1, flag: `--profile=${join(root, '.playwright/profiles/W1')}`, reason: 'profile inside the repo' },
      { file: '.agents/skills/sprint-development/SKILL.md', line: 2, flag: '--profile=.playwright/profiles/TK-{n}', reason: 'relative profile' },
      { file: '.agents/skills/sprint-development/SKILL.md', line: 3, flag: '--persistent', reason: 'persistent' },
    ]);
    const rows = findings();
    expect(rows).toHaveLength(2);
    expect(rows.find(r => r.path === '.agents/skills/sprint-development/SKILL.md')).toMatchObject({ surface: 'skills', blocking: false, suggested: 'keep project' });
    expect(rows.find(r => r.path === 'AGENTS.md')).toMatchObject({ surface: 'instructions', blocking: false });
    const evidence = rows.find(r => r.path === '.agents/skills/sprint-development/SKILL.md')!.evidence;
    expect(evidence).toStartWith('informational: line 2 --profile=.playwright/profiles/TK-{n} (relative profile); line 3 --persistent (persistent)');
    expect(evidence).toContain('live-ui-validation.md');
    expect(readFileSync(join(root, '.agents/skills/sprint-development/SKILL.md'), 'utf8')).toBe(skill);
  });

  test('the disk-profile detector ignores the doctrine, placeholders, other CLIs and the vendor flag docs', () => {
    const root = '/work/repo';
    const quiet = [
      '2. **Never `--persistent`, never `--profile`.** Both put a browser profile on disk.',
      'every session is `-s=<name>` (never the default), never `--persistent` or `--profile`',
      'a named session per worker (`-s=<label>`); never `--persistent`',
      'nunca --persistent: `playwright-cli list` vacío',
      'only `--browser --config --headed --persistent --profile` (confirmed via `playwright-cli open --help`)',
      'playwright-cli -s=loom open <url> --profile=<abs root>/loom --browser=chrome',
      'playwright-cli -s=loom open <url> --profile=~/.browser-profiles/loom',
      'playwright-cli -s=loom open <url> --profile="$HOME/.browser-profiles/loom"',
      'playwright-cli -s=loom open <url> --profile=/Users/me/.browser-profiles/loom',
      String.raw`playwright-cli -s=loom open <url> --profile=%USERPROFILE%\.browser-profiles\loom`,
      'bun run api:login staging --profile W1',
      'resend emails list --profile staging',
      'docker compose --profile test up --abort-on-container-exit',
      '`--profile <name>`: writes tokens under `.auth/profiles/<name>/`',
    ].join('\n');
    expect(browserProfileSitesIn('.agents/skills/x/SKILL.md', quiet, root)).toEqual([]);

    // The vendor playwright-cli skill documents its own flag; a relative profile in it is still a project edit.
    const vendor = 'playwright-cli open --persistent\nplaywright-cli open --profile=/path/to/profile\nplaywright-cli -s=TK-1 open --profile=.playwright/profiles/TK-1\n';
    expect(browserProfileSitesIn('.claude/skills/playwright-cli/SKILL.md', vendor, root)).toEqual([
      { file: '.claude/skills/playwright-cli/SKILL.md', line: 3, flag: '--profile=.playwright/profiles/TK-1', reason: 'relative profile' },
    ]);

    // Repo-root spellings and a bare relative name on a browser line.
    const loud = [
      'playwright-cli -s=K open --profile=<repo>/.playwright/profiles/K',
      'playwright-cli -s=K open --profile="$PWD/profiles/K"',
      'playwright-cli -s=K open --profile=TK-1',
      'pw open --persistent >/dev/null 2>&1',
    ].join('\n');
    expect(browserProfileSitesIn('scripts.sh', loud, root).map(s => s.reason)).toEqual([
      'profile inside the repo',
      'profile inside the repo',
      'relative profile',
      'persistent',
    ]);
  });

  test('the shipped skills and instructions carry no disk-profile line', () => {
    expect(browserProfileDrift(join(import.meta.dir, '..', '..'))).toEqual([]);
  });

  test('archived skills nudge once: this run, plus unreported archive entries, until their marker exists', () => {
    const root = temporaryRoot();
    const archive = join(root, '.template/pre-agents-migration/skills');
    write(root, '.template/pre-agents-migration/skills/acli/SKILL.md', 'old\n');
    write(root, '.template/pre-agents-migration/skills/old-one/SKILL.md', 'older\n');

    // The migration archived `acli` this run; `old-one` sits there from an
    // earlier run that never reported it. Both get their one nudge.
    expect(archivedSkillsToReport(root, archive, ['acli'])).toEqual(['acli', 'old-one']);
    persistArchivedSkillMarkers(root, ['acli', 'old-one']);
    expect(existsSync(join(root, '.template/upstream-sha/archived-skill-acli.marker'))).toBe(true);

    // Next run: the archive dir is still on disk, no migration result, no row.
    expect(archivedSkillsToReport(root, archive, [])).toEqual([]);
    // A fresh archive of the same name (marker present) stays quiet; a new name does not.
    write(root, '.template/pre-agents-migration/skills/newer/SKILL.md', 'x\n');
    expect(archivedSkillsToReport(root, archive, ['acli', 'newer'])).toEqual(['newer']);
    // No archive dir at all: only this run's names.
    expect(archivedSkillsToReport(temporaryRoot(), join(root, 'nope'), ['x'])).toEqual(['x']);
  });

  test('git strategy stamp reads block presence, strategy and provenance', () => {
    expect(readGitStrategyStamp(null)).toEqual({ present: false, strategy: null, source: null });
    expect(readGitStrategyStamp('name: x\n')).toEqual({ present: false, strategy: null, source: null });
    expect(readGitStrategyStamp('git_strategy:\n  strategy: gitflow # c\n  meta:\n    strategy_source: chosen\n'))
      .toEqual({ present: true, strategy: 'gitflow', source: 'chosen' });
  });
});

describe('renderParityReport', () => {
  test('table has every surface with ok / warn / blocked, prompt carries the WAIT contract, file body carries the diffs', () => {
    const { input } = fixture();
    const findings = collectParityFindings(input);
    const report = renderParityReport(findings, META);

    expect(report.surfaces.map(r => r.surface)).toEqual(SURFACE_ORDER);
    const state = Object.fromEntries(report.surfaces.map(r => [r.surface, r.state]));
    expect(state).toEqual({
      instructions: 'warn',
      skills: 'blocked',
      hooks: 'blocked',
      mcp: 'blocked',
      env: 'warn',
      components: 'warn',
      package: 'ok',
      git: 'warn',
      gates: 'ok',
    });
    expect(report.surfaces.map(r => r.label)).toEqual(['Instrucciones y config', 'Skills', 'Hooks', 'MCP', 'Env', 'Componentes', 'package.json', 'Git', 'Verificación']);
    expect(report.surfaces.find(r => r.surface === 'mcp')?.cell).toBe('1 hallazgo: .codex/config.toml');

    const prompt = report.prompt;
    expect(prompt.startsWith('Parity review after `bun sync` (upstream upex-galaxy/agentic-dev-boilerplate@abcdef1, project lock 1234567).')).toBe(true);
    expect(prompt).toContain('WAIT for a decision per row');
    expect(prompt).toContain('(keep project | take upstream | merge) BEFORE editing anything');
    expect(prompt).toContain('| # | Surface | File | What differs (evidence) | Suggested |');
    expect(prompt).toContain('| 1 | Instructions | AGENTS.md | port upstream additions only: "5.5 MULTI-HARNESS"');
    expect(prompt).toMatch(/\| MCP \| \.codex\/config\.toml \| missing: n8n \(declared in \.mcp\.json\); only here: acme \(not in \.mcp\.json\): declare them in \.mcp\.json and opencode\.jsonc, or remove them; port upstream additions only: "mcp_servers\.n8n"[^|]* \| merge \(BLOCKING\) \|/);
    expect(prompt).toContain('`take upstream` is suggested only where the project lacks the content entirely');
    expect(prompt.trimEnd().endsWith('Post-merge: bun run agents:compat && bun run agents:compat:check && bun run repo:check')).toBe(true);
    // Scannable: never the diff itself, never rule numbers.
    expect(prompt).not.toContain('@@');
    expect(prompt).not.toMatch(/Rule #\d/);

    const body = report.fileBody;
    expect(body).toContain('AUTO-GENERATED, SINGLE-USE');
    expect(body).toContain('### 1. AGENTS.md');
    expect(body).toContain('### 2. .claude/settings.json');
    expect(body).toContain('```diff');
    expect(body).toContain('+## 5.5 MULTI-HARNESS');
    expect(buildParityFileBody(findings, META)).toBe(body);
  });

  test('the raw-URL hint appears for a GitHub handle only, never for a local upstream path', () => {
    expect(buildParityPrompt([], META)).toContain('https://raw.githubusercontent.com/upex-galaxy/agentic-dev-boilerplate/main/<path>');
    expect(buildParityPrompt([], { ...META, templateRepo: '/tmp/upstream' })).not.toContain('raw.githubusercontent.com');
  });

  test('zero findings render an all-ok table and an empty prompt table', () => {
    const report = renderParityReport([], META);
    expect(report.surfaces.every(r => r.state === 'ok' && r.cell === 'sin diferencias')).toBe(true);
    expect(buildParityPrompt([], META)).not.toContain('| 1 |');
  });

  test('pipes and newlines inside evidence never break the markdown table', () => {
    const prompt = buildParityPrompt([{
      id: 1,
      surface: 'hooks',
      path: '.claude/settings.json',
      evidence: 'a | b\nc',
      suggested: 'merge',
      blocking: false,
    }], META);
    expect(prompt).toContain('| 1 | Hooks | .claude/settings.json | a \\| b c | merge |');
  });
});

describe('strictVerdict', () => {
  const blocking: ParityFinding = { id: 1, surface: 'mcp', path: '.codex/config.toml', evidence: 'missing: n8n', suggested: 'take upstream', blocking: true };
  const drift: ParityFinding = { id: 2, surface: 'instructions', path: 'AGENTS.md', evidence: 'changed 1: "x"', suggested: 'merge', blocking: false };

  test('default mode never fails, whatever the findings', () => {
    expect(strictVerdict(false, [blocking, drift])).toEqual({ exitCode: 0, reason: null });
  });

  test('--strict fails only on blocking findings; watched-file drift alone passes', () => {
    expect(strictVerdict(true, [drift])).toEqual({ exitCode: 0, reason: null });
    expect(strictVerdict(true, [])).toEqual({ exitCode: 0, reason: null });
    const verdict = strictVerdict(true, [blocking, drift]);
    expect(verdict.exitCode).toBe(1);
    expect(verdict.reason).toContain('1 hallazgo(s) bloqueante(s)');
    expect(verdict.reason).toContain('.codex/config.toml');
    expect(verdict.reason?.split('\n')).toHaveLength(1);
  });

  test('an aborted run exits 1 with `Abortado.` in every mode, and never reads as completed', () => {
    for (const mode of [{ dryRun: false, strict: false }, { dryRun: false, strict: true }, { dryRun: true, strict: false }]) {
      const verdict = runVerdict({ aborted: true, ...mode }, [blocking]);
      expect(verdict).toEqual({ exitCode: 1, reason: null, outro: ABORTED_OUTRO });
      expect(verdict.outro).toBe('Abortado.');
    }
  });

  test('a completed run keeps the strict semantics and names its mode in the outro', () => {
    expect(runVerdict({ aborted: false, dryRun: false, strict: false }, [blocking]))
      .toEqual({ exitCode: 0, reason: null, outro: 'Sincronizacion completada.' });
    expect(runVerdict({ aborted: false, dryRun: true, strict: false }, []))
      .toEqual({ exitCode: 0, reason: null, outro: 'Dry-run completado.' });
    const strict = runVerdict({ aborted: false, dryRun: false, strict: true }, [blocking, drift]);
    expect(strict.exitCode).toBe(1);
    expect(strict.reason).toContain('--strict');
    expect(strict.outro).toBe('Sincronizacion completada con contratos rotos (--strict).');
    expect(runVerdict({ aborted: false, dryRun: false, strict: true }, [drift]).exitCode).toBe(0);
  });
});

describe('never a destructive default for project-only content', () => {
  // Live finding (Bunkai): row 8 said `take upstream (BLOCKING)` for an
  // opencode.jsonc holding four working project servers; applied literally it
  // would have deleted them. `take upstream` is only for content the project
  // lacks entirely.
  function base(root: string, upstream: string): ParityInput {
    return { root, upstreamDir: upstream, drift: [], compatErrors: [], archivedSkills: [], archivedSkillsDir: join(root, 'x'), heldBack: [], envNewKeys: [] };
  }

  test('an MCP host with project-only servers suggests merge and names the other two registries; missing-only still takes upstream', () => {
    const root = temporaryRoot();
    const findings = collectParityFindings({
      ...base(root, temporaryRoot()),
      compatErrors: [
        'MCP n8n missing from codex: declared in .mcp.json, absent from .codex/config.toml',
        'MCP dbhub present in opencode only: declare it in .mcp.json or remove it from opencode.jsonc',
        'MCP postman present in opencode only: declare it in .mcp.json or remove it from opencode.jsonc',
      ],
    });
    const codex = findings.find(f => f.path === '.codex/config.toml')!;
    expect(codex.suggested).toBe('take upstream');
    expect(codex.blocking).toBe(true);
    const opencode = findings.find(f => f.path === 'opencode.jsonc')!;
    expect(opencode.suggested).toBe('merge');
    expect(opencode.blocking).toBe(true);
    expect(opencode.evidence).toBe('only here: dbhub, postman (not in .mcp.json): declare them in .mcp.json and .codex/config.toml, or remove them');
  });

  test('a watched file folded into a compat row keeps take upstream only when the project has nothing of its own there', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    // Same keys, upstream added one: nothing project-only.
    write(root, '.codex/config.toml', '[mcp_servers.context7]\ncommand = "x"\n');
    write(upstream, '.codex/config.toml', '[mcp_servers.context7]\ncommand = "x"\n\n[mcp_servers.n8n]\ncommand = "z"\n');
    // Project-only key next to the upstream addition.
    write(root, 'opencode.jsonc', '{"mcp":{"context7":{},"dbhub":{}}}');
    write(upstream, 'opencode.jsonc', '{"mcp":{"context7":{},"n8n":{}}}');
    const findings = collectParityFindings({
      ...base(root, upstream),
      drift: [{ path: '.codex/config.toml', reason: 'r' }, { path: 'opencode.jsonc', reason: 'r' }],
      compatErrors: [
        'MCP n8n missing from codex: declared in .mcp.json, absent from .codex/config.toml',
        'MCP n8n missing from opencode: declared in .mcp.json, absent from opencode.jsonc',
      ],
    });
    expect(findings.find(f => f.path === '.codex/config.toml')?.suggested).toBe('take upstream');
    const opencode = findings.find(f => f.path === 'opencode.jsonc')!;
    expect(opencode.suggested).toBe('merge');
    expect(opencode.evidence).toContain('keep project-only key: "mcp.dbhub"');
    expect(opencode.blocking).toBe(true);
    // Any other compat contract still takes upstream's shape (no project content involved).
    expect(collectParityFindings({ ...base(root, upstream), compatErrors: ['claude hook command must be exactly: node x'] })[0].suggested).toBe('take upstream');
    expect(findings.every(f => f.suggested !== 'decide' || f.surface === 'git')).toBe(true);
  });
});

describe('rows the diff-based table could not see before', () => {
  function base(root: string, upstream: string): ParityInput {
    return { root, upstreamDir: upstream, drift: [], compatErrors: [], archivedSkills: [], archivedSkillsDir: join(root, 'x'), heldBack: [], envNewKeys: [] };
  }

  test('an overwritten project edit: one row on skills or components, backup named, hunks vs applied, full diff in the file', () => {
    const root = temporaryRoot();
    write(root, '.agents/skills/acli/SKILL.md', 'upstream body\n');
    write(root, '.backups/update-1/.agents/skills/acli/SKILL.md', 'project body\n');
    write(root, 'scripts/x.ts', 'upstream\n');
    write(root, '.backups/update-1/scripts/x.ts', 'ours\n');
    write(root, 'docs/gone.md', 'upstream\n');
    const findings = collectParityFindings({
      ...base(root, temporaryRoot()),
      localEdits: [
        { path: '.agents/skills/acli/SKILL.md', component: 'agent-compatibility', backupPath: join(root, '.backups/update-1/.agents/skills/acli/SKILL.md') },
        { path: 'scripts/x.ts', component: 'scripts', backupPath: join(root, '.backups/update-1/scripts/x.ts') },
        { path: 'docs/gone.md', component: 'docs', backupPath: null },
      ],
    });
    const skill = findings.find(f => f.path === '.agents/skills/acli/SKILL.md')!;
    expect(skill.surface).toBe('skills');
    expect(skill.suggested).toBe('merge');
    expect(skill.blocking).toBe(false);
    expect(skill.evidence).toBe('project edit overwritten; backup: .backups/update-1/.agents/skills/acli/SKILL.md; 1 hunk (+1/-1) vs applied; add the path to updater.protected_paths in .agents/project.yaml so the next sync keeps your merge; after restoring, run bun run skills:registry');
    expect(skill.note).toBe(protectNote('.agents/skills/acli/SKILL.md'));
    expect(skill.diff).toContain('-project body');
    expect(skill.diff).toContain('+upstream body');
    expect(findings.find(f => f.path === 'scripts/x.ts')?.surface).toBe('components');
    expect(findings.find(f => f.path === 'docs/gone.md')?.evidence).toBe('project edit overwritten; backup: none; backup unavailable; add the path to updater.protected_paths in .agents/project.yaml so the next sync keeps your merge');
    const body = buildParityFileBody(findings, META);
    expect(body).toContain('### 1. .agents/skills/acli/SKILL.md');
    expect(body).toContain('-project body');
    // The saved file repeats the fix under every overwritten-edit row, as the YAML to paste.
    expect(body).toContain('    updater:\n      protected_paths:\n        - .agents/skills/acli/SKILL.md');
    expect(body).toContain('### 3. docs/gone.md');
    expect(body).toContain('        - docs/gone.md');
  });

  test('a structural drift entry: informational row for upstream additions only, no row for value differences', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    write(root, '.agents/project.yaml', 'project:\n  project_name: acme\ngit_strategy:\n  strategy: solo-main\n  meta:\n    strategy_source: chosen\n');
    write(upstream, '.agents/project.yaml', 'project:\n  project_name: null\ngit_strategy:\n  strategy: solo-main\n  meta:\n    strategy_source: inherited\n');
    write(root, '.agents/jira-required.yaml', 'required:\n  severity:\n    type: option\n');
    write(upstream, '.agents/jira-required.yaml', 'required:\n  severity:\n    type: option\n  priority:\n    type: option\n');
    const findings = collectParityFindings({
      ...base(root, upstream),
      drift: [{ path: '.agents/project.yaml', reason: 'identity', structural: true }, { path: '.agents/jira-required.yaml', reason: 'manifest', structural: true }],
    });
    // project.yaml differs only in values (and the git stamp is `chosen`): nothing at all.
    expect(findings.filter(f => f.path === '.agents/project.yaml')).toEqual([]);
    const jira = findings.find(f => f.path === '.agents/jira-required.yaml')!;
    expect(jira.surface).toBe('instructions');
    expect(jira.suggested).toBe('merge');
    expect(jira.blocking).toBe(false);
    expect(jira.evidence).toBe('informational: upstream added 1 key: "required.priority"; merge = add the new keys, values are project identity and never compared');
    expect(jira.diff).toContain('+  priority:');
  });

  test('retired harness launchers: one informational row for the scripts, one for the launcher, nothing is touched', () => {
    const root = temporaryRoot();
    const findings = (): ParityFinding[] => collectParityFindings({
      root,
      upstreamDir: temporaryRoot(),
      drift: [],
      compatErrors: [],
      archivedSkills: [],
      archivedSkillsDir: join(root, 'archive'),
      heldBack: [],
      envNewKeys: [],
    }).filter(f => f.evidence.includes('ADR-0016') || f.evidence.includes('harness launch scripts'));

    // A project's own `claude` script that loads nothing is not the retired launcher.
    const pkg = { scripts: { claude: 'claude --model x', dev: 'next dev' } };
    write(root, 'package.json', `${JSON.stringify(pkg, null, 2)}\n`);
    expect(findings()).toEqual([]);

    const legacy = {
      scripts: {
        claude: 'bun --no-env-file scripts/launch.ts claude',
        codex: 'dotenv -o -e .env -- codex',
        opencode: 'bash -c \'set -a; . ./.env; set +a; exec opencode "$@"\' --',
        dev: 'next dev',
      },
    };
    const legacyText = `${JSON.stringify(legacy, null, 2)}\n`;
    write(root, 'package.json', legacyText);
    write(root, RETIRED_HARNESS_LAUNCHER, '// the old launcher\n');
    const rows = findings();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ surface: 'package', path: 'package.json', blocking: false, suggested: 'keep project' });
    expect(rows[0].evidence).toContain('scripts.claude, scripts.codex, scripts.opencode');
    expect(rows[0].evidence).toContain('Left untouched');
    expect(rows[1]).toMatchObject({ surface: 'components', path: RETIRED_HARNESS_LAUNCHER, blocking: false, suggested: 'keep project' });
    expect(rows[1].evidence).toContain('vars:env:check');
    expect(readFileSync(join(root, 'package.json'), 'utf8')).toBe(legacyText);
    expect(readFileSync(join(root, RETIRED_HARNESS_LAUNCHER), 'utf8')).toBe('// the old launcher\n');
  });

  test('a context map skill with a placeholder map and an old markdown map beside it gets one informational row', () => {
    const root = temporaryRoot();
    write(root, '.agents/skills/business-data-context/references/business-data-map.html', '<!-- placeholder: run project-context mode data to generate this map -->\n<html></html>\n');
    write(root, '.context/business/business-data-map.md', '# Business Data Map: Acme\n');
    write(root, '.agents/skills/business-api-context/references/business-api-map.html', '<!-- generated by project-context mode api; edited in place by business-api-context refresh; do not hand-edit -->\n<html></html>\n');
    const findings = collectParityFindings(base(root, temporaryRoot()));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ surface: 'skills', path: '.agents/skills/business-data-context/references/business-data-map.html', suggested: 'keep project', blocking: false });
    expect(findings[0].evidence).toBe('informational: `business-data-context` holds a placeholder map; your old `.context/business/business-data-map.md` is kept and will be read as input: run `project-context mode data`');
  });

  test('a drifted file without key structure (a husky hook) reads its hunks; the row is never blocking', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    // Both copies already source the gates file, so the gates-split note stays out of the evidence.
    write(root, '.husky/pre-push', '. "$(dirname -- "$0")/framework-gates.sh"\nframework_gates_pre_push\nbun run e2e\n');
    write(upstream, '.husky/pre-push', '. "$(dirname -- "$0")/framework-gates.sh"\nframework_gates_pre_push\n');
    const findings = collectParityFindings({ ...base(root, upstream), drift: [{ path: '.husky/pre-push', reason: 'project gates live here' }] });
    expect(findings).toHaveLength(1);
    expect(findings[0].surface).toBe('components');
    expect(findings[0].suggested).toBe('merge');
    expect(findings[0].blocking).toBe(false);
    expect(findings[0].evidence).toBe('content differs (no key structure): review the hunks in the saved file; 1 hunk (+0/-1)');
    expect(findings[0].diff).toContain('-bun run e2e');
    // A project-declared path sits on Skills (under .agents/skills/) or Componentes, never on Instrucciones.
    write(root, '.agents/skills/acli/SKILL.md', '## A\n\n## Project note\n');
    write(upstream, '.agents/skills/acli/SKILL.md', '## A\n');
    write(root, 'scripts/x.ts', 'mine\n');
    write(upstream, 'scripts/x.ts', 'theirs\n');
    const declared = collectParityFindings({ ...base(root, upstream), drift: [
      { path: '.agents/skills/acli/SKILL.md', reason: 'declared', source: 'project' },
      { path: 'scripts/x.ts', reason: 'declared', source: 'project' },
    ] });
    expect(declared.map(f => [f.path, f.surface, f.suggested])).toEqual([
      ['.agents/skills/acli/SKILL.md', 'skills', 'keep project'],
      ['scripts/x.ts', 'components', 'merge'],
    ]);
    expect(declared[0].evidence).toBe('project-only heading: "Project note"; upstream adds nothing; 1 hunk (+0/-2)');
  });

  test('a package.json key kept at the project value: one row per key, both values in the file body only', () => {
    const root = temporaryRoot();
    const findings = collectParityFindings({
      ...base(root, temporaryRoot()),
      packageJsonKept: [
        { file: 'package.json', section: 'scripts', key: 'repo:check', localValue: 'bun run a', upstreamValue: 'bun run a && bun run b' },
        { file: 'package.json', section: 'devDependencies', key: 'eslint', localValue: '^9.0.0', upstreamValue: '^9.30.0' },
      ],
    });
    expect(findings.map(f => [f.surface, f.path, f.evidence, f.suggested, f.blocking])).toEqual([
      ['package', 'package.json', 'scripts.repo:check: project value kept; upstream differs', 'decide', false],
      ['package', 'package.json', 'devDependencies.eslint: project value kept; upstream differs', 'decide', false],
    ]);
    const report = renderParityReport(findings, META);
    expect(report.surfaces.find(r => r.surface === 'package')).toMatchObject({ state: 'warn', cell: '2 hallazgos: package.json' });
    expect(report.prompt).not.toContain('bun run a && bun run b');
    expect(report.fileBody).toContain('```text\nproject (kept):\n  bun run a\nupstream:\n  bun run a && bun run b\n```');
  });

  test('a failed gate: informational row with exit code, first errors and the applied files it names; a passing gate is no row', () => {
    const root = temporaryRoot();
    const output = 'cli/lib/updater-core.test.ts(84,19): error TS2352: Conversion of type X may be a mistake.\ncli/other.ts(1,1): error TS1000: nope\n';
    const findings = collectParityFindings({
      ...base(root, temporaryRoot()),
      gates: [
        { script: 'types:check', status: 'fail', exitCode: 2, seconds: 9.4, errorCount: 2, firstErrors: output.trim().split('\n'), failingApplied: ['cli/lib/updater-core.test.ts'], output },
        { script: 'lint:check', status: 'pass', exitCode: 0, seconds: 3, errorCount: 0, firstErrors: [], failingApplied: [], output: '' },
        { script: 'test', status: 'timeout', exitCode: null, seconds: 120, errorCount: 0, firstErrors: [], failingApplied: [], output: '' },
      ],
    });
    expect(findings.map(f => [f.surface, f.path, f.suggested, f.blocking])).toEqual([
      ['gates', 'types:check', 'decide', false],
      ['gates', 'test', 'decide', false],
    ]);
    expect(findings[0].evidence).toBe(`exit 2; 2 error(s); first: ${output.trim().split('\n').join(' | ')}; applied this run: cli/lib/updater-core.test.ts`);
    expect(findings[1].evidence).toBe('skipped: no verdict within 120 s');
    const report = renderParityReport(findings, META);
    expect(report.surfaces.find(r => r.surface === 'gates')).toMatchObject({ label: 'Verificación', state: 'warn' });
    expect(report.fileBody).toContain('### 1. types:check');
    expect(report.fileBody).toContain('```text\ncli/lib/updater-core.test.ts(84,19)');
    // Never blocking: --strict does not fail on a gate.
    expect(strictVerdict(true, findings).exitCode).toBe(0);
  });
});

describe('MCP registries are compared per server, args and env included', () => {
  // Live finding (Bunkai, 8.2 port): `.codex/config.toml` read "same keys and
  // values; formatting or comments differ" while a server's args differed,
  // because the two-level view stopped at the server object.
  const diff = '--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new\n';
  const row = (project: string, upstream: string, file: string): [string, string] => {
    const e = watchedFileEvidence(file, project, upstream, diff);
    return [e.suggested, e.evidence.replace(/; 1 hunk \(\+1\/-1\)$/, '')];
  };

  test('a nested server object is compared whole; the evidence names the server and the fields that differ', () => {
    const mine = configEntries('{"mcpServers":{"context7":{"command":"npx","args":["-y","@upstash/context7-mcp@1"],"env":{"CONTEXT7_API_KEY":"ref"}}}}', '.mcp.json')!;
    const theirs = configEntries('{"mcpServers":{"context7":{"command":"npx","args":["-y","@upstash/context7-mcp@2"],"env":{"CONTEXT7_API_KEY":"ref"}}}}', '.mcp.json')!;
    expect(configKeyDelta(mine, theirs)).toEqual({ added: [], projectOnly: [], changed: ['mcpServers.context7'], changedDetail: { 'mcpServers.context7': 'args differ' }, changedArrays: [] });

    expect(row(
      '{"mcpServers":{"context7":{"command":"npx","args":["a"]},"supabase":{"command":"npx","args":["s"],"env":{"SUPABASE_ACCESS_TOKEN":"ref"}}}}',
      '{"mcpServers":{"context7":{"command":"npx","args":["b"]},"supabase":{"command":"npx","args":["s"],"env":{"SUPABASE_ACCESS_TOKEN":"ref","SUPABASE_PROJECT_REF":"ref"}}}}',
      '.mcp.json',
    )).toEqual(['merge', 'same keys, context7: args differ; supabase: env keys differ (port what you want, keep the rest)']);
    // Same env keys, different values; several fields at once.
    expect(row(
      '{"mcp":{"tavily":{"type":"remote","url":"https://a","headers":{"Authorization":"Bearer {env:TAVILY_API_KEY}"}}}}',
      '{"mcp":{"tavily":{"type":"remote","url":"https://b","headers":{"Authorization":"Bearer {env:TAVILY_KEY}"}}}}',
      'opencode.jsonc',
    )[1]).toBe('same keys, tavily: url and headers differ (port what you want, keep the rest)');
    expect(row('[mcp_servers.n8n]\ncommand = "npx"\n[mcp_servers.n8n.env]\nA = "1"\n', '[mcp_servers.n8n]\ncommand = "npx"\n[mcp_servers.n8n.env]\nA = "2"\n', '.codex/config.toml')[1])
      .toBe('same keys, n8n: env values differ (port what you want, keep the rest)');
    // Truly identical registries still read as identical.
    expect(row('{"mcpServers":{"a":{"args":[1]}}}', '{ "mcpServers": { "a": { "args": [1] } } }', '.mcp.json')).toEqual(['keep project', 'same keys and values; formatting or comments differ']);
  });

  test('at most three servers are named, the rest counted; scalars keep their own phrase', () => {
    const servers = (v: string): string => `{"x":1,"mcpServers":{${['a', 'b', 'c', 'd', 'e'].map(s => `"${s}":{"args":["${v}"]}`).join(',')}}}`;
    expect(row(servers('1'), servers('2'), '.mcp.json')[1]).toBe('same keys, a: args differ; b: args differ; c: args differ; +2 more (port what you want, keep the rest)');
    expect(row('{"x":1,"mcpServers":{"a":{"args":["1"]}}}', '{"x":2,"mcpServers":{"a":{"args":["2"]}}}', '.mcp.json')[1])
      .toBe('same keys, values differ at: "x"; a: args differ (port what you want, keep the rest)');
  });
});

describe('a git-tracked .context/PBI/ cache is one row on Componentes', () => {
  test('the row carries the count and the recipe path; the path list stays in the file', () => {
    const root = temporaryRoot();
    const findings = collectParityFindings({
      root,
      upstreamDir: temporaryRoot(),
      drift: [],
      compatErrors: [],
      archivedSkills: [],
      archivedSkillsDir: join(root, 'x'),
      heldBack: [],
      envNewKeys: [],
      pbiCache: { tracked: 370, recipePath: '.agents/prompts/pbi-cache-migration.md' },
    });
    expect(findings.map(f => [f.surface, f.path, f.suggested, f.blocking])).toEqual([['components', '.context/PBI/', 'decide', false]]);
    expect(findings[0].evidence).toBe('370 tracked path(s) still in git (Jira cache, gitignored by design); migration recipe saved to .agents/prompts/pbi-cache-migration.md');
    expect(renderParityReport(findings, META).surfaces.find(s => s.surface === 'components')?.cell).toBe('1 hallazgo: .context/PBI/');
    // Nothing tracked: no row.
    expect(collectParityFindings({ root, upstreamDir: temporaryRoot(), drift: [], compatErrors: [], archivedSkills: [], archivedSkillsDir: join(root, 'x'), heldBack: [], envNewKeys: [], pbiCache: null })).toEqual([]);
  });
});

describe('retiredMcpNote', () => {
  const upstream = JSON.stringify({ mcpServers: { context7: { command: 'bunx' } } });
  test('names a retired server the project keeps, says why, and offers keep or remove', () => {
    const project = JSON.stringify({ mcpServers: { context7: { command: 'bunx' }, atlassian: { command: 'npx' } } });
    const note = retiredMcpNote('.mcp.json', project, upstream);
    expect(note).not.toBeNull();
    expect(note!.clause).toContain('upstream retired "atlassian"');
    expect(note!.note).toContain('/acli');
    expect(note!.note).toContain('keep project');
  });
  test('silent when the project dropped it too, when upstream still has it, and on a non-MCP file', () => {
    expect(retiredMcpNote('.mcp.json', upstream, upstream)).toBeNull();
    const both = JSON.stringify({ mcpServers: { atlassian: { command: 'npx' } } });
    expect(retiredMcpNote('.mcp.json', both, both)).toBeNull();
    expect(retiredMcpNote('AGENTS.md', '# a', '# b')).toBeNull();
  });
  test('reads the Codex and OpenCode registries too', () => {
    const codexProject = '[mcp_servers.atlassian]\ncommand = "npx"\n';
    const codexUpstream = '[mcp_servers.context7]\ncommand = "bunx"\n';
    expect(retiredMcpNote('.codex/config.toml', codexProject, codexUpstream)!.clause).toContain('atlassian');
    const ocProject = '{ "mcp": { "atlassian": { "type": "local" } } }';
    const ocUpstream = '{ "mcp": { "context7": { "type": "local" } } }';
    expect(retiredMcpNote('opencode.jsonc', ocProject, ocUpstream)!.clause).toContain('atlassian');
  });
});

describe('harnessLevelMcpNote', () => {
  const upstream = JSON.stringify({ mcpServers: { context7: { command: 'bunx' } } });
  test('names a server the project keeps that upstream moved to harness level, with its former key', () => {
    const project = JSON.stringify({ mcpServers: { context7: { command: 'bunx' }, tavily: { command: 'bunx', args: ['-y', 'mcp-remote', 'https://mcp.tavily.com/mcp/'] } } });
    const note = harnessLevelMcpNote('.mcp.json', project, upstream);
    expect(note).not.toBeNull();
    expect(note!.clause).toContain('"tavily" now run at harness level');
    expect(note!.clause).toContain('TAVILY_API_KEY');
    expect(note!.note).toContain('keep project');
    expect(note!.note).toContain('claude mcp add --scope user');
  });
  test('silent when the project declares none of them, when upstream still has them, and on a non-MCP file', () => {
    expect(harnessLevelMcpNote('.mcp.json', upstream, upstream)).toBeNull();
    const both = JSON.stringify({ mcpServers: { tavily: { command: 'bunx' } } });
    expect(harnessLevelMcpNote('.mcp.json', both, both)).toBeNull();
    expect(harnessLevelMcpNote('AGENTS.md', '# a', '# b')).toBeNull();
  });
  test('silent on a harness-level server upstream never committed: nothing moved, so there is nothing to migrate', () => {
    const project = JSON.stringify({ mcpServers: { context7: { command: 'bunx' }, exa: { type: 'http', url: 'https://mcp.exa.ai/mcp' } } });
    expect(harnessLevelMcpNote('.mcp.json', project, upstream)).toBeNull();
  });
  test('reads the Codex and OpenCode registries too', () => {
    const codexProject = '[mcp_servers.tavily]\nurl = "https://mcp.tavily.com/mcp/"\n';
    const codexUpstream = '[mcp_servers.context7]\ncommand = "bunx"\n';
    expect(harnessLevelMcpNote('.codex/config.toml', codexProject, codexUpstream)!.clause).toContain('tavily');
    const ocProject = '{ "mcp": { "tavily": { "type": "local", "command": ["bunx"], }, } }';
    const ocUpstream = '{ "mcp": { "context7": { "type": "local" } } }';
    expect(harnessLevelMcpNote('opencode.jsonc', ocProject, ocUpstream)!.clause).toContain('tavily');
  });
  test('a watched MCP file that keeps tavily gets a parity row with the clause and the note, never an overwrite', () => {
    const root = temporaryRoot();
    const upstreamDir = temporaryRoot();
    write(root, '.mcp.json', JSON.stringify({ mcpServers: { context7: { command: 'bunx' }, tavily: { command: 'bunx' } } }, null, 2));
    write(upstreamDir, '.mcp.json', JSON.stringify({ mcpServers: { context7: { command: 'bunx' } } }, null, 2));
    const findings = collectParityFindings({ root, upstreamDir, drift: [{ path: '.mcp.json', reason: 'r' }], compatErrors: [], archivedSkills: [], archivedSkillsDir: join(root, 'x'), heldBack: [], envNewKeys: [], pbiCache: null });
    const row = findings.find(f => f.path === '.mcp.json');
    expect(row).toBeDefined();
    expect(row!.surface).toBe('mcp');
    expect(row!.suggested).not.toBe('take upstream');
    expect(row!.evidence).toContain('now run at harness level');
    expect(row!.note).toContain('ADR-0005');
  });
});

function bareInput(root: string, upstream: string): ParityInput {
  return { root, upstreamDir: upstream, drift: [], compatErrors: [], archivedSkills: [], archivedSkillsDir: join(root, '.template/pre-agents-migration/skills'), heldBack: [], envNewKeys: [] };
}

describe('the husky hooks carry the gates split downstream', () => {
  // Every hook is bootstrap-only, so a gate added upstream never reached a
  // project scaffolded earlier. The gates upstream owns now live in the SYNCED
  // `.husky/framework-gates.sh`; a hook that does not source it still sees
  // nothing, and only this row can say so.
  test('the note fires only for a hook that does not source the gates file', () => {
    const pending = frameworkGatesNote('bunx lint-staged\nbun run types:check\n', '.husky/pre-commit');
    expect(pending).toContain('framework_gates_pre_commit');
    expect(pending).toContain('if [ -f "$GATES" ]; then');
    // Each hook is nudged towards its OWN function.
    expect(frameworkGatesNote('bun run lint:check\n', '.husky/pre-push')).toContain('framework_gates_pre_push');
    expect(frameworkGatesNote('bunx commitlint --edit "$1"\n', '.husky/commit-msg')).toContain('framework_gates_commit_msg "$1"');
    // Already adopted: silence.
    expect(frameworkGatesNote('. "$(dirname -- "$0")/framework-gates.sh"\nframework_gates_pre_push\n', '.husky/pre-push')).toBeNull();
    // A mention in a comment is not an adoption.
    expect(frameworkGatesNote('# see framework-gates.sh\nbun run types:check\n', '.husky/pre-commit')).toContain('Adopt the gates split');
  });

  test('a pre-split hook gets a non-blocking row with the block to paste', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    write(root, '.husky/pre-push', 'bun run format:check && bun run lint:check\n');
    write(upstream, '.husky/pre-push', 'GATES="$(dirname -- "$0")/framework-gates.sh"\nif [ -f "$GATES" ]; then\n  . "$GATES"\n  framework_gates_pre_push\nfi\n');
    const findings = collectParityFindings({ ...bareInput(root, upstream), drift: [{ path: '.husky/pre-push', reason: 'project gates live here' }] });
    const row = findings.find(f => f.path === '.husky/pre-push');
    expect(row!.evidence).toContain('does not source .husky/framework-gates.sh');
    expect(row!.note).toContain('framework_gates_pre_push');
    expect(row!.blocking).toBe(false);
  });

  test('the repo\'s own hooks all source the synced gates file', () => {
    const repo = join(import.meta.dir, '..', '..');
    for (const hook of ['.husky/pre-commit', '.husky/pre-push', '.husky/commit-msg']) {
      expect(frameworkGatesNote(readFileSync(join(repo, hook), 'utf8'), hook)).toBeNull();
    }
  });
});

describe('a kept file whose upstream hunk another file depends on blocks', () => {
  test('a declared prerequisite path escalates its drift row and names the gate', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    write(root, 'scripts/lint-skills.ts', 'const KINDS = [\'workflow\'];\n');
    write(upstream, 'scripts/lint-skills.ts', 'const KINDS = [\'workflow\', \'context\'];\n');
    const drift = [{ path: 'scripts/lint-skills.ts', reason: 'declared in updater.protected_paths', source: 'project' as const }];
    const [row] = collectParityFindings({ ...bareInput(root, upstream), drift });
    expect(row.blocking).toBe(true);
    expect(row.suggested).toBe('merge');
    expect(row.evidence).toContain('PREREQUISITE for this release');
    expect(row.evidence).toContain('`bun run skills:check`');

    // An undeclared path stays ordinary, non-blocking drift.
    const [plain] = collectParityFindings({ ...bareInput(root, upstream), drift, prerequisites: {} });
    expect(plain.blocking).toBe(false);
    expect(plain.evidence).not.toContain('PREREQUISITE');
  });

  test('the shipped manifest declares the skill vocabulary', () => {
    expect(prerequisiteFor('scripts/lint-skills.ts')?.gate).toBe('bun run skills:check');
    expect(prerequisiteFor('scripts\\lint-skills.ts')).toBe(PATH_PREREQUISITES['scripts/lint-skills.ts']);
    expect(prerequisiteFor('README.md')).toBeNull();
  });
});

describe('a missing config block a shipped skill reads blocks the run', () => {
  const READERS = {
    '.agents/project.yaml': {
      git_strategy: { skill: '/git-flow-master', requiredBy: 'the protected-branch list and the push policy' },
    },
  };

  function rows(projectYaml: string, upstreamYaml: string): ParityFinding[] {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    write(root, '.agents/project.yaml', projectYaml);
    write(upstream, '.agents/project.yaml', upstreamYaml);
    return collectParityFindings({
      ...bareInput(root, upstream),
      drift: [{ path: '.agents/project.yaml', reason: 'per-project identity', structural: true }],
      configBlockReaders: READERS,
    }).filter(f => f.path === '.agents/project.yaml');
  }

  test('the block is missing: the row blocks and names the skill that reads it', () => {
    const [row] = rows('project:\n  name: consumer\n', 'project:\n  name: upstream\ngit_strategy:\n  strategy: solo-main\n');
    expect(row.blocking).toBe(true);
    expect(row.suggested).toBe('merge');
    expect(row.evidence).toContain('BLOCKING');
    expect(row.evidence).toContain('/git-flow-master');
    expect(row.evidence).toContain('adapt its VALUES to this project');
  });

  test('a block the project HAS stays informational however much its values differ', () => {
    const found = rows('git_strategy:\n  strategy: main-integration\n', 'git_strategy:\n  strategy: solo-main\n');
    expect(found.every(f => !f.blocking)).toBe(true);
  });

  test('an undeclared block upstream added is informational, exactly as before', () => {
    const [row] = rows('project:\n  name: consumer\n', 'project:\n  name: upstream\nsome_new_block:\n  a: 1\n');
    expect(row.blocking).toBe(false);
    expect(row.evidence).toContain('informational');
    expect(row.evidence).not.toContain('BLOCKING');
  });

  test('missingConfigBlocks is top-level only and declaration-driven', () => {
    // `policy` is a CHILD of a block the project has: a value-shaped difference.
    expect(missingConfigBlocks('.agents/project.yaml', 'git_strategy:\n  strategy: solo-main\n', 'git_strategy:\n  strategy: solo-main\n  policy:\n    a: 1\n', READERS)).toEqual([]);
    expect(missingConfigBlocks('.mcp.json', '{}', '{"git_strategy":{}}', READERS)).toEqual([]);
  });

  test('every shipped declaration names a block the template has and a skill that ships', () => {
    const repo = join(import.meta.dir, '..', '..');
    const template = configEntries(readFileSync(join(repo, '.agents/project.yaml'), 'utf8'), '.agents/project.yaml')!;
    for (const [block, reader] of Object.entries(CONFIG_BLOCK_READERS['.agents/project.yaml'])) {
      expect(template.has(block)).toBe(true);
      expect(existsSync(join(repo, '.agents/skills', reader.skill.slice(1), 'SKILL.md'))).toBe(true);
    }
  });

  test('every shipped declaration names a block its skill actually mentions', () => {
    const repo = join(import.meta.dir, '..', '..');
    for (const [block, reader] of Object.entries(CONFIG_BLOCK_READERS['.agents/project.yaml'])) {
      const skillDir = join(repo, '.agents/skills', reader.skill.slice(1));
      const files = [join(skillDir, 'SKILL.md'), ...readdirSync(join(skillDir, 'references')).map(name => join(skillDir, 'references', name))];
      const mentions = files.some(file => new RegExp(`\\b${block}\\b`).test(readFileSync(file, 'utf8')));
      expect({ block, mentions }).toEqual({ block, mentions: true });
    }
  });

  test('a project lacking the stack block gets a blocking row naming project-context', () => {
    const upstream = 'git_strategy:\n  strategy: solo-main\nstack:\n  app_root: .\n';
    const missing = missingConfigBlocks('.agents/project.yaml', 'git_strategy:\n  strategy: solo-main\n', upstream);
    expect(missing.map(m => [m.block, m.reader.skill])).toEqual([['stack', '/project-context']]);
    expect(missingConfigBlocks('.agents/project.yaml', upstream.replace('app_root: .', 'app_root: apps/web'), upstream)).toEqual([]);
  });
});

describe('the doctrine ledger row', () => {
  test('with no AGENTS.md drift row of its own it stands alone on instructions', () => {
    const root = temporaryRoot();
    const row = collectParityFindings({ ...bareInput(root, temporaryRoot()), doctrineDebt: 'informational: 2 doctrine section(s) missing' })
      .find(f => f.path === 'AGENTS.md');
    expect(row!.surface).toBe('instructions');
    expect(row!.blocking).toBe(false);
    expect(row!.evidence).toContain('2 doctrine section(s) missing');
  });

  test('it folds onto the AGENTS.md drift row instead of raising a second one', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    write(root, 'AGENTS.md', '# Memory\n\n## 1. RULES\n\nmine\n');
    write(upstream, 'AGENTS.md', '# Memory\n\n## 1. RULES\n\nmine\n\n## 9. DOCTRINE\n\nnew\n');
    const found = collectParityFindings({
      ...bareInput(root, upstream),
      drift: [{ path: 'AGENTS.md', reason: 'per-project AI memory' }],
      doctrineDebt: 'informational: 1 doctrine section(s) unresolved for 4 run(s)',
    }).filter(f => f.path === 'AGENTS.md');
    expect(found).toHaveLength(1);
    expect(found[0].evidence).toContain('unresolved for 4 run(s)');
    // The fold appends, never replaces the ordinary drift evidence.
    expect(found[0].evidence).toContain('9. DOCTRINE');
  });

  test('no debt means no row', () => {
    const root = temporaryRoot();
    expect(collectParityFindings({ ...bareInput(root, temporaryRoot()), doctrineDebt: null }).find(f => f.path === 'AGENTS.md')).toBeUndefined();
  });
});

describe('the allow-list merge is reported, never silent', () => {
  test('an informational row names every permission the merge added', () => {
    const root = temporaryRoot();
    const row = collectParityFindings({ ...bareInput(root, temporaryRoot()), allowListAdded: ['Skill(vercel-cli)', 'Skill(autonomous-delivery)'] })
      .find(f => f.path === '.claude/settings.json');
    expect(row!.surface).toBe('components');
    expect(row!.blocking).toBe(false);
    expect(row!.evidence).toContain('2 permission(s) added');
    expect(row!.evidence).toContain('Skill(vercel-cli)');
    expect(row!.evidence).toContain('deny/ask/hooks/env untouched');
  });

  test('a run that added nothing raises no row at all', () => {
    const root = temporaryRoot();
    expect(collectParityFindings({ ...bareInput(root, temporaryRoot()), allowListAdded: [] }).find(f => f.path === '.claude/settings.json')).toBeUndefined();
    // A declined deny alone is the project's standing decision, not news.
    expect(collectParityFindings({ ...bareInput(root, temporaryRoot()), denyListDeclined: ['Bash(env)'] }).find(f => f.path === '.claude/settings.json')).toBeUndefined();
  });

  test('deny additions share the one settings row, with the declined entries named', () => {
    const root = temporaryRoot();
    const rows = collectParityFindings({
      ...bareInput(root, temporaryRoot()),
      allowListAdded: ['Skill(vercel-cli)'],
      denyListAdded: ['Read(.env)', 'Bash(printenv*)'],
      denyListDeclined: ['Bash(env)'],
    }).filter(f => f.path === '.claude/settings.json');
    expect(rows).toHaveLength(1);
    expect(rows[0].blocking).toBe(false);
    expect(rows[0].evidence).toContain('1 permission(s) added to permissions.allow: Skill(vercel-cli)');
    expect(rows[0].evidence).toContain('2 rule(s) added to permissions.deny: Read(.env), Bash(printenv*)');
    expect(rows[0].evidence).toContain('declined via updater.declined_denies: Bash(env)');
    expect(rows[0].evidence).toContain('ask/hooks/env untouched');
    expect(rows[0].evidence).not.toContain('deny/ask');
  });

  test('hook additions, skips and a folded key share the one settings row', () => {
    const root = temporaryRoot();
    const rows = collectParityFindings({
      ...bareInput(root, temporaryRoot()),
      hooksAdded: ['PostToolUse(*) node "$CLAUDE_PROJECT_DIR/.agents/hooks/personality-reinject.mjs"'],
      hooksDeclined: ['PostToolUse(Edit|Write|MultiEdit) node "$CLAUDE_PROJECT_DIR/.agents/hooks/doc-contracts.mjs"'],
      settingsDuplicatesFolded: ['hooks.PostToolUse'],
    }).filter(f => f.path === '.claude/settings.json');
    expect(rows).toHaveLength(1);
    expect(rows[0].blocking).toBe(false);
    expect(rows[0].evidence).toContain('1 hook command(s) added as new groups: PostToolUse(*)');
    expect(rows[0].evidence).toContain('declined via updater.declined_hooks: PostToolUse(Edit|Write|MultiEdit)');
    expect(rows[0].evidence).toContain('repeated key(s) folded into one list (JSON keeps only the last): hooks.PostToolUse');
    expect(rows[0].evidence).toContain('deny/ask/env untouched');
  });

  test('a hook skipped for a missing script raises the row alone; a declined hook alone does not', () => {
    const root = temporaryRoot();
    const skipped = collectParityFindings({ ...bareInput(root, temporaryRoot()), hooksSkipped: ['PostToolUse(*) node "$CLAUDE_PROJECT_DIR/.agents/hooks/gone.mjs"'] })
      .filter(f => f.path === '.claude/settings.json');
    expect(skipped).toHaveLength(1);
    expect(skipped[0].evidence).toContain('not added, the script they run is missing: PostToolUse(*)');
    expect(collectParityFindings({ ...bareInput(root, temporaryRoot()), hooksDeclined: ['PostToolUse(*) node x.mjs'] })
      .find(f => f.path === '.claude/settings.json')).toBeUndefined();
  });
});

describe('the opencode.jsonc deny gap is one paste row, never a rewrite', () => {
  const upstreamOpencode = '{\n  "permission": {\n    "bash": { "*": "ask", "printenv*": "deny", },\n    "read": { "*.env": "deny" },\n  },\n}\n';

  test('a project lacking upstream denies gets one mcp row with the block in its note', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    write(upstream, 'opencode.jsonc', upstreamOpencode);
    write(root, 'opencode.jsonc', '{ "permission": { "bash": { "*": "ask" } } }\n');
    const rows = collectParityFindings(bareInput(root, upstream)).filter(f => f.path === 'opencode.jsonc');
    expect(rows).toHaveLength(1);
    expect(rows[0].surface).toBe('mcp');
    expect(rows[0].blocking).toBe(false);
    expect(rows[0].suggested).toBe('merge');
    expect(rows[0].evidence).toContain('lacks 2 upstream deny rule(s) (bash: printenv*; read: *.env)');
    expect(rows[0].note).toContain('```jsonc');
    expect(rows[0].note).toContain('"printenv*": "deny",');
  });

  test('folds onto the file\'s existing drift row', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    write(upstream, 'opencode.jsonc', upstreamOpencode);
    write(root, 'opencode.jsonc', '{ "permission": {} }\n');
    const rows = collectParityFindings({ ...bareInput(root, upstream), drift: [{ path: 'opencode.jsonc', reason: 'watched' }] })
      .filter(f => f.path === 'opencode.jsonc');
    expect(rows).toHaveLength(1);
    expect(rows[0].evidence).toContain('upstream deny rule(s)');
    expect(rows[0].diff).toBeTruthy();
  });

  test('no gap, no row', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    write(upstream, 'opencode.jsonc', upstreamOpencode);
    write(root, 'opencode.jsonc', upstreamOpencode);
    expect(collectParityFindings(bareInput(root, upstream)).find(f => f.path === 'opencode.jsonc')).toBeUndefined();
  });
});
