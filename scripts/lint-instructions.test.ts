import type { InstructionFinding } from './lint-instructions';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { parseProjectSkillRows } from '../.agents/hooks/personality-reinject.mjs';
import { coreBytes, parseL0Rules, parseProjectSkills, parseRouter, readmeSectionRows, routerFingerprint, routerLock, skillTableSource, withRouterLock } from './lib/instructions';
import { acceptRouter, isPendingMigration, L0_BUDGET, L0_PROJECT_BUDGET, L0_TARGET, lintBinding, lintBudget, lintInstructions } from './lint-instructions';

let root: string;

function write(rel: string, content = ''): void {
  const full = join(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

const tag = (f: InstructionFinding): string => `${f.severity}:${f.kind}:${f.file}:${f.message}`;

const RULES = [
  '---',
  'id: critical-rules',
  'title: "Critical rules"',
  'load_when: "about to break a rule"',
  'triggers: ["critical rule"]',
  'paths: []',
  '---',
  '',
  '# Critical rules',
  '',
  '## 1. CREDENTIALS',
  '',
  'ALWAYS read from `.env`. NEVER hardcode/guess. Example keys live in `.env.example`.',
  '',
  '## 2. GIT HISTORY',
  '',
  'NEVER rewrite pushed history. NEVER force-push to shared branches. Long rationale here.',
  '',
].join('\n');

const GIT = [
  '---',
  'id: git',
  'title: "Git"',
  'load_when: "any git intent"',
  'triggers: ["\\\\bgit\\\\b", "\\\\bcommit"]',
  'paths: [".husky/"]',
  '---',
  '',
  '# Git',
  '',
  'Commits follow `git-flow-master`. NEVER push without reading the policy (Rule #2).',
  '',
].join('\n');

function l0(extra = ''): string {
  return [
    '# AGENTS.md',
    '',
    '## LOAD PROTOCOL + ROUTER',
    '',
    '<!-- router:start -->',
    '| Kind | Load | Also |',
    '|---|---|---|',
    '| unsure about a Critical Rule | `.agents/instructions/agent-critical-rules.md` | - |',
    '| git work | `.agents/instructions/agent-git.md` | `git-flow-master` |',
    '| scripts: whenever any of these apply, read it fresh | @package.json | Rule 10 |',
    '<!-- router:end -->',
    '',
    extra,
    '## 1. CRITICAL RULES: ALWAYS APPLY',
    '',
    '1. **CREDENTIALS**: ALWAYS read from `.env`. NEVER hardcode/guess. Full: agent-critical-rules.md#1',
    '2. **GIT HISTORY**: NEVER rewrite pushed history. … NEVER force-push to shared branches. Full: agent-critical-rules.md#2',
    '',
    '## 2. BEHAVIOR',
    '',
    'Mention `@AGENTS.md` in code, never bare.',
    '',
  ].join('\n');
}

function scaffold(): void {
  write('package.json', '{}');
  write('AGENTS.md', l0());
  write('.agents/instructions/agent-critical-rules.md', RULES);
  write('.agents/instructions/agent-git.md', GIT);
  write('.agents/instructions/README.md', '# Sections\n');
  write('.agents/skills/git-flow-master/SKILL.md', '---\nname: git-flow-master\n---\n\n## Compact Rules\n\n- x\n');
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'lint-instructions-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('lint-instructions', () => {
  test('a consistent L0 + sections layout passes', () => {
    scaffold();
    expect(lintInstructions(root)).toEqual([]);
  });

  test('agent-project.md skill rows: an existing skill with compiling triggers passes, each defect fails by name', () => {
    scaffold();
    write('AGENTS.md', l0().replace('<!-- router:end -->', '| this project | `.agents/instructions/agent-project.md` | - |\n<!-- router:end -->'));
    write('.agents/skills/billing-context/SKILL.md', '---\nname: billing-context\n---\n');
    const project = (rows: string[]): string => [
      '---',
      'id: project',
      'title: "Project"',
      'load_when: "project facts"',
      'triggers: []',
      'paths: []',
      '---',
      '',
      '<!-- project-skills:start -->',
      '| Skill | Load when | Triggers | Loaded by |',
      '| --- | --- | --- | --- |',
      ...rows,
      '<!-- project-skills:end -->',
      '',
    ].join('\n');
    write('.agents/instructions/agent-project.md', project(['| `billing-context` | invoices | `\\binvoice`, `pay(?:out\\|ment)` | `sprint-development` |']));
    expect(lintInstructions(root)).toEqual([]);
    write('.agents/instructions/agent-project.md', project([
      '| `gone-context` | x | `gone` | - |',
      '| `billing-context` |  |  | - |',
      '| `billing-context` | x | `(unclosed` | - |',
      '| Billing | x | `b` | - |',
    ]));
    expect(lintInstructions(root).map(tag)).toEqual([
      'error:router:.agents/instructions/agent-project.md:project skill row: .agents/skills/gone-context/SKILL.md does not exist',
      'error:router:.agents/instructions/agent-project.md:project skill row `billing-context` has no Load when',
      'error:router:.agents/instructions/agent-project.md:project skill row `billing-context` has no trigger: the hook can never route to it',
      'error:router:.agents/instructions/agent-project.md:project skill row `billing-context`: trigger does not compile: (unclosed',
      'error:router:.agents/instructions/agent-project.md:project skill row: `Billing` is not a skill slug (write it backticked, e.g. `billing-context`)',
    ]);
  });

  test('a section no router row loads fails by name', () => {
    scaffold();
    write('.agents/instructions/agent-code-quickref.md', GIT.replace('id: git', 'id: code-quickref'));
    expect(lintInstructions(root).map(tag)).toEqual([
      'error:router:.agents/instructions/agent-code-quickref.md:section is not the load target of any router row',
    ]);
  });

  test('a router target that does not resolve fails', () => {
    scaffold();
    write('AGENTS.md', l0().replace('agent-git.md` | `git', 'agent-gone.md` | `git'));
    const tags = lintInstructions(root).map(tag);
    expect(tags).toContain('error:router:AGENTS.md:load target does not resolve: .agents/instructions/agent-gone.md');
    expect(tags).toContain('error:router:.agents/instructions/agent-git.md:section is not the load target of any router row');
  });

  test('frontmatter: id must match the file stem and triggers must compile', () => {
    scaffold();
    write('.agents/instructions/agent-git.md', GIT.replace('id: git', 'id: gitflow'));
    expect(lintInstructions(root).map(tag)).toEqual(['error:frontmatter:.agents/instructions/agent-git.md:`id` must be `git` (the file stem without `agent-`)']);
    write('.agents/instructions/agent-git.md', GIT.replace('"\\\\bcommit"', '"(unclosed"'));
    expect(lintInstructions(root).map(tag)).toEqual(['error:frontmatter:.agents/instructions/agent-git.md:trigger does not compile: (unclosed']);
  });

  test('every file but README.md carries the agent- prefix: a numbered name fails', () => {
    scaffold();
    write('.agents/instructions/80-git.md', GIT);
    write('AGENTS.md', l0().replace('<!-- router:end -->', '| old git | `.agents/instructions/80-git.md` | - |\n<!-- router:end -->'));
    expect(lintInstructions(root).map(tag)).toEqual(['error:frontmatter:.agents/instructions/80-git.md:file name must be `agent-<id>.md` (every file but README.md carries the `agent-` prefix)']);
  });

  test('agent-project.md may leave triggers empty, no other section may; README carries no frontmatter', () => {
    scaffold();
    write('.agents/instructions/agent-project.md', '---\nid: project\ntitle: "P"\nload_when: "project things"\ntriggers: []\npaths: []\n---\n');
    write('AGENTS.md', l0().replace('<!-- router:end -->', '| this project | `.agents/instructions/agent-project.md` | - |\n<!-- router:end -->'));
    expect(lintInstructions(root)).toEqual([]);
    write('.agents/instructions/agent-git.md', GIT.replace('triggers: ["\\\\bgit\\\\b", "\\\\bcommit"]', 'triggers: []'));
    write('.agents/instructions/README.md', '---\nid: readme\n---\n');
    expect(lintInstructions(root).map(tag)).toEqual([
      'error:frontmatter:.agents/instructions/README.md:README.md carries no frontmatter',
      'error:frontmatter:.agents/instructions/agent-git.md:`triggers` is empty: the hook can never route here (only agent-project.md may leave it empty)',
    ]);
  });

  test('a project that received the sections but still runs its pre-split AGENTS.md is pending, not broken', () => {
    scaffold();
    write('AGENTS.md', `# AGENTS.md\n\n## 9. LOCAL CONTEXT (PBI)\n\n${'x'.repeat(L0_PROJECT_BUDGET * 2)}\n`);
    expect(isPendingMigration(root)).toBe(true);
    expect(lintInstructions(root)).toEqual([]);
    // The maintainers' copy never gets that pass: a missing router there is a defect.
    write('.agents/project.yaml', '# MAINTAINER COPY: the boilerplate\'s own file.\nproject: {}\n');
    expect(isPendingMigration(root)).toBe(false);
    expect(lintInstructions(root).map(f => f.kind)).toContain('router');
  });

  test('an adopted app whose AGENTS.md waits for its saved merge is pending; without the saved file it is missing', () => {
    scaffold();
    rmSync(join(root, 'AGENTS.md'));
    write('.template/installer.lock.json', '{"adopted":true}\n');
    expect(lintInstructions(root).map(tag)).toEqual(['error:router:AGENTS.md:AGENTS.md missing']);
    write('.agents/prompts/adopt-instructions.md', l0());
    expect(isPendingMigration(root)).toBe(true);
    expect(lintInstructions(root)).toEqual([]);
  });

  test('an L0 rule excerpt that is not verbatim in the full text fails', () => {
    scaffold();
    write('AGENTS.md', l0().replace('NEVER hardcode/guess.', 'NEVER hardcode or guess.'));
    expect(lintInstructions(root).map(tag)).toEqual([
      'error:rules:AGENTS.md:rule 1 excerpt is not verbatim in agent-critical-rules.md: "ALWAYS read from `.env`. NEVER hardcode or guess.…"',
    ]);
  });

  test('a full-text rule with no L0 line, and a renamed rule, fail', () => {
    scaffold();
    write('.agents/instructions/agent-critical-rules.md', `${RULES.replace('## 2. GIT HISTORY', '## 2. HISTORY')}## 3. EXTRA\n\nNEVER x.\n`);
    expect(lintInstructions(root).map(tag)).toEqual([
      'error:rules:AGENTS.md:rule 2 is `GIT HISTORY` in L0 but `HISTORY` in agent-critical-rules.md',
      'error:rules:.agents/instructions/agent-critical-rules.md:rule 3 has no binding line in L0',
    ]);
  });

  test('a bare @ import other than the two data files fails; code spans are not imports', () => {
    scaffold();
    write('AGENTS.md', l0('See @README.md for more.\n'));
    expect(lintInstructions(root).map(tag)).toEqual([
      'error:import:AGENTS.md:bare `@README.md` is a Claude Code import; only @package.json, @.agents/project.yaml may appear (wrap other mentions in backticks)',
    ]);
  });

  test('the router reads backticked targets and bare imports', () => {
    const rows = parseRouter(l0());
    expect(rows?.map(r => r.targets)).toEqual([
      ['.agents/instructions/agent-critical-rules.md'],
      ['.agents/instructions/agent-git.md'],
      ['package.json'],
    ]);
    expect(parseRouter('# no markers')).toBeNull();
  });

  test('L0 rules parse with their excerpts', () => {
    expect(parseL0Rules(l0()).map(r => [r.n, r.name, r.excerpts])).toEqual([
      [1, 'CREDENTIALS', ['ALWAYS read from `.env`. NEVER hardcode/guess.']],
      [2, 'GIT HISTORY', ['NEVER rewrite pushed history.', 'NEVER force-push to shared branches.']],
    ]);
  });
});

describe('lint-instructions binding carriers', () => {
  const ctx = { ruleNumbers: new Set([1, 2]), skills: new Set(['git-flow-master']), l0: '**EPHEMERAL CONTRACT**: x' };
  const lines = (text: string): number[] => lintBinding('s.md', text, ctx).map(f => f.line);

  test('a NEVER/MUST line needs a rule, a compact-rule skill, an L0 contract or an explicit scope marker', () => {
    expect(lines([
      'NEVER do x (Rule #2).',
      'NEVER do y, see `git-flow-master`.',
      '**EPHEMERAL CONTRACT**: the agent MUST clean up.',
      'NEVER do z. <!-- binds-in-section: only z work routes here -->',
      'NEVER do w.',
      'You MUST do v (Rule #9).',
      '```',
      'NEVER inside a fence is not prose',
      '```',
      'a `NEVER` in a code span is not a rule',
    ].join('\n'))).toEqual([5, 6]);
  });
});

describe('lint-instructions budget', () => {
  test('target warns, ceiling fails, project additions are measured apart', () => {
    expect(lintBudget('x'.repeat(L0_TARGET))).toEqual([]);
    expect(lintBudget('x'.repeat(L0_TARGET + 1)).map(f => f.severity)).toEqual(['warning']);
    expect(lintBudget('x'.repeat(L0_BUDGET + 1)).map(f => f.severity)).toEqual(['error']);
    const app = `# A\n\n## 0. Project instructions (pre-adoption)\n\n${'y'.repeat(6000)}\n\n## 1. CRITICAL RULES\n\nr\n`;
    expect(coreBytes(app)).toBeLessThan(100);
    expect(lintBudget(app)).toEqual([]);
    const huge = `# A\n\n## 0. Project instructions (pre-adoption)\n\n${'y'.repeat(L0_PROJECT_BUDGET)}\n\n## 1. CRITICAL RULES\n`;
    expect(lintBudget(huge).map(tag)[0]).toStartWith('error:budget:AGENTS.md:L0 with project additions');
  });
});

describe('skillTableSource', () => {
  test('section first, AGENTS.md fallback, null when neither exists', () => {
    expect(skillTableSource(root)).toBeNull();
    write('AGENTS.md', 'a');
    expect(skillTableSource(root)?.file).toBe('AGENTS.md');
    write('.agents/instructions/agent-skills-and-mcps.md', 's');
    expect(skillTableSource(root)?.file).toBe('.agents/instructions/agent-skills-and-mcps.md');
  });
});

describe('parseProjectSkills', () => {
  const table = (rows: string[]): string => ['<!-- project-skills:start -->', '| Skill | Load when | Triggers | Loaded by |', '| --- | --- | --- | --- |', ...rows, '<!-- project-skills:end -->', ''].join('\n');

  test('the hook parser and the lint parser read the same rows (escaped pipe included)', () => {
    const text = table([
      '| `billing-context` | invoices | `\\bbilling\\b`, `invoice`, `pay(?:out\\|ment)s?` | `sprint-development` |',
      '| `/auth-context` | sessions | `\\bsso\\b` | - |',
    ]);
    const hook = (parseProjectSkillRows(text) as Array<{ slug: string, triggers: string[] }>).map(r => ({ slug: r.slug, triggers: r.triggers }));
    const lint = (parseProjectSkills(text) ?? []).map(r => ({ slug: r.slug, triggers: r.triggers }));
    expect(hook).toEqual(lint);
    expect(lint[0].triggers).toEqual(['\\bbilling\\b', 'invoice', 'pay(?:out|ment)s?']);
    expect(lint[1].slug).toBe('auth-context');
  });

  test('no markers is null; the shipped stub carries the table, empty', () => {
    expect(parseProjectSkills('# no table\n')).toBeNull();
    const stub = readFileSync(resolve(import.meta.dir, '..', '.agents/instructions/agent-project.md.template'), 'utf8');
    expect(parseProjectSkills(stub)).toEqual([]);
  });
});

describe('lint-instructions: the three locks (ADR-0014)', () => {
  const MAINTAINER_YAML = '# MAINTAINER COPY: the boilerplate\'s own file.\nproject: {}\n';
  const README = ['# Sections', '', '## Sections', '', '| File | Holds |', '|---|---|', '| `agent-critical-rules.md` | rules |', '| `agent-git.md` | git |', ''].join('\n');
  const evalSet = (extra: Array<{ prompt: string, expect: string[] }> = []): string => JSON.stringify({
    targets: { recall: 0.95, precision: 0.8 },
    prompts: [
      { prompt: 'what does this critical rule say', expect: ['critical-rules'] },
      { prompt: 'explain the critical rule on pushes', expect: ['critical-rules'] },
      { prompt: 'is this against a critical rule?', expect: ['critical-rules'] },
      { prompt: 'git status', expect: ['git'] },
      { prompt: 'commit this', expect: ['git'] },
      { prompt: 'git log please', expect: ['git'] },
      ...extra,
    ],
  });
  const ROW = '| a new kind | `.agents/instructions/agent-git.md` | - |';
  const withRow = (text: string): string => text.replace('<!-- router:end -->', `${ROW}\n<!-- router:end -->`);
  const locked = (text: string, adr = 'ADR-0001'): string => withRouterLock(text, routerFingerprint(text)!, adr);
  const kinds = (): string[] => lintInstructions(root).filter(f => f.severity === 'error').map(f => `${f.kind}:${f.file}`);
  const warnings = (): string[] => lintInstructions(root).filter(f => f.severity === 'warning' && f.kind !== 'budget').map(f => `${f.kind}:${f.file}`);
  const current = (): string => readFileSync(join(root, 'AGENTS.md'), 'utf8');

  /** The maintainers' copy: every lock's input present and consistent. */
  function maintainer(): void {
    scaffold();
    write('.agents/project.yaml', MAINTAINER_YAML);
    write('.agents/instructions/README.md', README);
    write('cli/lib/fixtures/instruction-router-eval.json', evalSet());
    write('.context/ADR/ADR-0001-router.md', `# ADR-0001\n\nRouter fingerprint ${routerFingerprint(l0())}.\n`);
    write('AGENTS.md', locked(l0()));
  }

  test('the maintainers\' copy with every lock input in place passes', () => {
    maintainer();
    expect(lintInstructions(root).filter(f => f.severity === 'error')).toEqual([]);
  });

  test('lock: a router edit without a decision fails; a whitespace reflow does not', () => {
    maintainer();
    write('AGENTS.md', withRow(current()));
    expect(kinds()).toEqual(['lock:AGENTS.md']);
    expect(lintInstructions(root).find(f => f.kind === 'lock')?.message).toContain('--accept-router ADR-NNNN');
    write('AGENTS.md', locked(l0()).replace('| git work | `.agents/instructions/agent-git.md` |', '|  git   work |   `.agents/instructions/agent-git.md`  |'));
    expect(kinds()).toEqual([]);
  });

  test('lock: required in the maintainers\' copy; the ADR must exist and cite the fingerprint', () => {
    maintainer();
    write('AGENTS.md', l0());
    expect(kinds()).toEqual(['lock:AGENTS.md']);
    write('AGENTS.md', locked(l0(), 'ADR-0042'));
    expect(kinds()).toEqual(['lock:AGENTS.md']);
    write('AGENTS.md', locked(l0()));
    write('.context/ADR/ADR-0001-router.md', '# ADR-0001\n\nNo fingerprint here.\n');
    expect(kinds()).toEqual(['lock:.context/ADR/ADR-0001-router.md']);
  });

  test('lock: --accept-router refuses a missing ADR, re-locks, and the gate holds until the ADR cites the new fingerprint', () => {
    maintainer();
    write('AGENTS.md', withRow(current()));
    expect(acceptRouter(root, 'ADR-0002').ok).toBe(false);
    expect(acceptRouter(root, 'adr-2').ok).toBe(false);
    write('.context/ADR/ADR-0002-new-kind.md', '# ADR-0002\n');
    const fingerprint = routerFingerprint(withRow(l0()))!;
    expect(acceptRouter(root, 'ADR-0002')).toEqual({ ok: false, message: expect.stringContaining(fingerprint) });
    expect(current()).toContain(`<!-- router:lock ${fingerprint} ADR-0002 -->`);
    expect(kinds()).toEqual(['lock:.context/ADR/ADR-0002-new-kind.md']);
    write('.context/ADR/ADR-0002-new-kind.md', `# ADR-0002\n\nRouter fingerprint ${fingerprint}.\n`);
    expect(acceptRouter(root, 'ADR-0002').ok).toBe(true);
    expect(kinds()).toEqual([]);
  });

  test('lock: a project that never locked opted out; a project lock that drifts only warns', () => {
    scaffold();
    expect(kinds()).toEqual([]);
    write('AGENTS.md', withRow(locked(l0())));
    expect(kinds()).toEqual([]);
    expect(warnings()).toEqual(['lock:AGENTS.md']);
  });

  test('eval: a triggers edit that loses routes, or one that floods them, fails the gate', () => {
    maintainer();
    write('.agents/instructions/agent-git.md', GIT.replace('triggers: ["\\\\bgit\\\\b", "\\\\bcommit"]', 'triggers: ["\\\\bnever-matches\\\\b"]'));
    expect(kinds()).toEqual(['eval:cli/lib/fixtures/instruction-router-eval.json']);
    expect(lintInstructions(root).find(f => f.kind === 'eval')?.message).toContain('recall');
    write('.agents/instructions/agent-git.md', GIT.replace('triggers: ["\\\\bgit\\\\b", "\\\\bcommit"]', 'triggers: ["\\\\bgit\\\\b", "\\\\bcommit", "\\\\w"]'));
    expect(lintInstructions(root).find(f => f.kind === 'eval')?.message).toContain('precision');
  });

  test('eval: a label naming no routed section fails; a missing fixture fails only the maintainers\' copy', () => {
    maintainer();
    write('cli/lib/fixtures/instruction-router-eval.json', evalSet([{ prompt: 'git again', expect: ['git', 'ghost'] }]));
    expect(lintInstructions(root).filter(f => f.kind === 'eval').map(f => f.message).join(' ')).toContain('ghost');
    rmSync(join(root, 'cli/lib/fixtures/instruction-router-eval.json'));
    expect(kinds()).toEqual(['eval:cli/lib/fixtures/instruction-router-eval.json']);
    write('.agents/project.yaml', 'project: {}\n');
    expect(kinds()).toEqual([]);
  });

  test('complete: a new section with frontmatter and a row but no labelled prompts and no README row fails twice', () => {
    maintainer();
    write('.agents/instructions/agent-tools.md', '---\nid: tools\ntitle: "Tools"\nload_when: "a CLI"\ntriggers: ["\\\\bacli\\\\b"]\npaths: []\n---\n\n# Tools\n');
    const withTools = l0().replace('<!-- router:end -->', '| tools | `.agents/instructions/agent-tools.md` | - |\n<!-- router:end -->');
    write('AGENTS.md', locked(withTools));
    write('.context/ADR/ADR-0001-router.md', `# ADR-0001\n\n${routerFingerprint(withTools)}\n`);
    expect(kinds()).toEqual(['complete:.agents/instructions/agent-tools.md', 'complete:.agents/instructions/agent-tools.md']);
    write('cli/lib/fixtures/instruction-router-eval.json', evalSet(['run acli view', 'acli transition', 'acli login'].map(prompt => ({ prompt, expect: ['tools'] }))));
    write('.agents/instructions/README.md', `${README}| \`agent-tools.md\` | tools |\n`);
    expect(kinds()).toEqual([]);
  });

  test('complete: a README row naming a gone file fails; a missing table fails the maintainers\' copy, a project only warns', () => {
    maintainer();
    write('.agents/instructions/README.md', `${README}| \`agent-gone.md\` | old |\n`);
    expect(kinds()).toEqual(['complete:.agents/instructions/README.md']);
    write('.agents/instructions/README.md', '# Sections\n');
    expect(kinds()).toEqual(['complete:.agents/instructions/README.md']);
    write('.agents/project.yaml', 'project: {}\n');
    write('.agents/instructions/README.md', README.replace('| `agent-git.md` | git |\n', ''));
    expect(kinds()).toEqual([]);
    expect(warnings()).toEqual(['complete:.agents/instructions/agent-git.md']);
  });

  test('the README index parses its rows and stops at the next heading', () => {
    expect(readmeSectionRows(`${README}\n## Editing\n\n| \`agent-x.md\` | not an index row |\n`)?.map(r => r.name)).toEqual(['agent-critical-rules.md', 'agent-git.md']);
    expect(readmeSectionRows('# none\n')).toBeNull();
  });

  test('the real repo: the router is locked by the ADR that cites its fingerprint', () => {
    const real = resolve(import.meta.dir, '..');
    const text = readFileSync(join(real, 'AGENTS.md'), 'utf8');
    expect(routerLock(text)?.fingerprint).toBe(routerFingerprint(text)!);
  });
});
