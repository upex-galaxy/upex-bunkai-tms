import type { DocFinding } from './lint-docs';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { lintDocs, resolvePublishedLink, SEVERITY, sitePathOf } from './lint-docs';

let root: string;

function write(rel: string, content = ''): void {
  const full = join(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

const tag = (f: DocFinding): string => `${SEVERITY[f.kind]}:${f.file}:${f.line}:${f.kind}:${f.target}`;
const head = '<head><title>Setup</title><meta name="description" content="Guides." /></head>';

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'lint-docs-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('lint-docs references', () => {
  test('passes when every relative link and root path resolves', () => {
    write('docs/setup/guide.md', '# Guide');
    write('scripts/tool.ts', '');
    write('docs/README.md', '[guide](./setup/guide.md#install) and `scripts/tool.ts`');
    write('README.md', '<a href="docs/README.md">docs</a>');
    expect(lintDocs(root).findings).toEqual([]);
  });

  test('a dead link fails the gate; a missing root path is a warning', () => {
    write('docs/README.md', 'See [gone](./methodology/gone.md).\n\n`docs/nope/file.md`');
    write('docs/guide.html', `${head}<a href="setup/missing.html">x</a>`);
    expect(lintDocs(root).findings.map(tag)).toEqual([
      'error:docs/README.md:1:link:./methodology/gone.md',
      'warning:docs/README.md:3:path:docs/nope/file.md',
      'error:docs/guide.html:1:link:setup/missing.html',
    ]);
  });

  test('ignores external URLs, anchors, mailto, placeholders and fenced code', () => {
    write('docs/README.md', [
      '[a](https://example.com) [b](#section) [c](mailto:dev@example.com) [d](./{slug}.md)',
      '`docs/<name>/SKILL.md` `docs/**/*.md`',
      '```',
      '[e](./inside-a-fence.md) `docs/inside/fence.md`',
      '```',
    ].join('\n'));
    expect(lintDocs(root).findings).toEqual([]);
  });

  test('skips roots the checkout does not have (a scaffolded project has no packages/)', () => {
    write('docs/README.md', '`packages/decks/README.md` and [deck](../packages/decks/x.html)');
    expect(lintDocs(root).findings).toEqual([]);
  });

  test('checks deck links but not illustrative inline paths inside decks', () => {
    write('packages/decks/demo/deck.html', '<code>scripts/example.ts</code> <a href="../missing.html">x</a>');
    write('scripts/.keep', '');
    expect(lintDocs(root).findings.map(f => `${f.kind}:${f.target}`)).toEqual(['link:../missing.html']);
  });

  test('does not report a documented optional file', () => {
    write('.agents/README.md', '');
    write('README.md', '`.agents/compatibility/command-aliases.project.json`');
    expect(lintDocs(root).findings).toEqual([]);
  });

  test('an HTML page under docs/ needs a title and a description', () => {
    write('docs/onboarding.html', head);
    write('docs/setup/bare.html', '<head><title> </title></head><p>x</p>');
    expect(lintDocs(root).findings.map(f => `${SEVERITY[f.kind]}:${f.file}:${f.target}`)).toEqual([
      'error:docs/setup/bare.html:<title>',
      'error:docs/setup/bare.html:<meta name="description">',
    ]);
  });

  test('scans the nested READMEs under .context/ and packages/, not the PBI cache below them', () => {
    write('.context/README.md', 'Ten skills today.');
    write('.context/reports/README.md', 'See [gone](./gone.md).');
    write('.context/PBI/epics/EPIC-1-x/README.md', 'A synced cache file, today.');
    write('packages/create-agentic-dev/README.md', '**Last Updated**: 2026-04-26');
    expect(lintDocs(root).findings.map(f => `${f.file}:${f.line}:${f.kind}`)).toEqual([
      '.context/README.md:1:current-state',
      '.context/reports/README.md:1:link',
      'packages/create-agentic-dev/README.md:1:current-state',
    ]);
  });
});

describe('lint-docs agent-facing markdown links', () => {
  test('checks markdown links under .agents/, .context/ and .claude/ relative to the file', () => {
    write('.agents/skills/demo/references/ok.md', '');
    write('.agents/skills/demo/SKILL.md', 'See [ok](./references/ok.md#top) and [gone](./references/gone.md).');
    write('.context/ADR/ADR-0001-x.md', 'Superseded by [ADR-0002](./ADR-0002-y.md).');
    write('.claude/agents/helper.md', '[skill](../../.agents/skills/demo/SKILL.md)');
    expect(lintDocs(root).findings.map(tag)).toEqual([
      'error:.agents/skills/demo/SKILL.md:1:link:./references/gone.md',
      'error:.context/ADR/ADR-0001-x.md:1:link:./ADR-0002-y.md',
    ]);
  });

  test('skips URLs, anchors, placeholders, fenced and inline code, and the PBI cache', () => {
    write('.agents/skills/demo/SKILL.md', [
      '[a](https://example.com) [b](#section) [c](./{slug}.md) [d](<<TEMPLATE>>.md) idx_[table]([column])',
      'Write links as `[text](./relative.md)`.',
      '```',
      '[e](./inside-a-fence.md)',
      '```',
    ].join('\n'));
    write('.context/PBI/epics/EPIC-1-x/story.md', '[attachment](./missing.png)');
    expect(lintDocs(root).findings).toEqual([]);
  });

  test('reports only links there, not inline paths or volatile facts', () => {
    write('.agents/README.md', 'Ten skills today. `docs/nope/file.md`');
    expect(lintDocs(root).findings).toEqual([]);
  });
});

describe('lint-docs volatile facts (Critical Rule #17)', () => {
  test('both volatile families block the gate after the sweep', () => {
    expect(SEVERITY['file-line']).toBe('error');
    expect(SEVERITY['current-state']).toBe('error');
  });

  test('a path:line citation is a FILE-LINE error, not a missing path', () => {
    write('scripts/tool.ts', '');
    write('docs/README.md', 'See `scripts/tool.ts:12` for the shape.');
    expect(lintDocs(root).findings.map(tag)).toEqual(['error:docs/README.md:1:file-line:scripts/tool.ts:12']);
  });

  test('a claim about the present is a CURRENT-STATE error in markdown and HTML prose', () => {
    write('README.md', 'The store holds ten skills today.\nMeasured 2026-09-17 on a live project.');
    write('docs/onboarding.html', `${head}<p>El catálogo tiene hoy 24 entradas.</p>`);
    expect(lintDocs(root).findings.map(tag)).toEqual([
      'error:README.md:1:current-state:today',
      'error:README.md:2:current-state:Measured 2026-09-17',
      'error:docs/onboarding.html:1:current-state:hoy',
    ]);
  });

  test('fenced code, <pre>, <code class="block"> and a volatile-ok line are not volatile findings', () => {
    write('README.md', ['```', 'x.ts:12 today', '```', 'Teaching the word today <!-- volatile-ok: teaching example -->'].join('\n'));
    write('docs/onboarding.html', `${head}<pre>at route.ts:12 today</pre><code class="block">hoy</code>`);
    expect(lintDocs(root).findings).toEqual([]);
  });

  test('an ADR is a dated record and is never scanned', () => {
    write('.context/ADR/README.md', 'Index, measured 2026-08-21.');
    expect(lintDocs(root).findings).toEqual([]);
  });
});

describe('lint-docs roster and scripts', () => {
  const router = (slugs: string[]): string => [
    '## 5. SKILLS',
    '',
    '### Skills T1 (committed in `.agents/skills/`)',
    '',
    '| Skill | Trigger | Purpose |',
    '|---|---|---|',
    ...slugs.map(s => `| \`${s}\` | \`/${s}\` | x |`),
    '',
    '### Slash commands',
    '',
    'Mentions `ghost-flow` outside the router, which does not count.',
  ].join('\n');
  const skill = (slug: string): void => write(`.agents/skills/${slug}/SKILL.md`, `---\nname: ${slug}\n---\n`);

  test('a repo skill missing from the AGENTS.md router fails by name; a community install is exempt', () => {
    skill('alpha-flow');
    skill('ghost-flow');
    skill('shadcn');
    write('cli/install.ts', 'const PROJECT_LEVEL_SKILLS = [{ package: \'https://github.com/shadcn/ui\', skill: \'shadcn\' }];');
    write('AGENTS.md', router(['alpha-flow']));
    const findings = lintDocs(root).findings.filter(f => f.kind === 'roster');
    expect(findings.map(tag)).toEqual(['error:AGENTS.md:1:roster:ghost-flow']);
  });

  test('the skills section wins over AGENTS.md when it exists', () => {
    skill('alpha-flow');
    skill('ghost-flow');
    write('AGENTS.md', router(['alpha-flow', 'ghost-flow']));
    write('.agents/instructions/agent-skills-and-mcps.md', router(['alpha-flow']));
    const findings = lintDocs(root).findings.filter(f => f.kind === 'roster');
    expect(findings.map(tag)).toEqual(['error:.agents/instructions/agent-skills-and-mcps.md:1:roster:ghost-flow']);
  });

  test('a skill the project created counts when agent-project.md lists it or an AGENTS.md router row loads it', () => {
    skill('alpha-flow');
    skill('billing-context');
    skill('shop-context');
    skill('ghost-context');
    write('.agents/instructions/agent-skills-and-mcps.md', router(['alpha-flow']));
    write('.agents/instructions/agent-project.md', [
      '## Project context skills',
      '',
      '<!-- project-skills:start -->',
      '| Skill | Load when | Triggers | Loaded by |',
      '| --- | --- | --- | --- |',
      '| `billing-context` | invoices | `invoice` | - |',
      '<!-- project-skills:end -->',
      '',
      'Mentions `ghost-context` outside the table, which does not count.',
    ].join('\n'));
    write('AGENTS.md', '<!-- router:start -->\n| Kind | Load | Also |\n|---|---|---|\n| the shop | `.agents/skills/shop-context/SKILL.md` | - |\n<!-- router:end -->\n');
    const findings = lintDocs(root).findings.filter(f => f.kind === 'roster');
    expect(findings.map(tag)).toEqual(['error:.agents/instructions/agent-skills-and-mcps.md:1:roster:ghost-context']);
  });

  test('a bun run citation inside an instruction section is checked like AGENTS.md', () => {
    write('package.json', JSON.stringify({ scripts: { 'docs:check': 'y' } }));
    write('.agents/instructions/agent-git.md', 'Run `bun run docs:check`, never `bun run gone-script`.');
    const findings = lintDocs(root).findings.filter(f => f.kind === 'script');
    expect(findings.map(tag)).toEqual(['warning:.agents/instructions/agent-git.md:1:script:gone-script']);
  });

  test('a missing router table is one roster finding', () => {
    skill('alpha-flow');
    write('AGENTS.md', '# No router here');
    expect(lintDocs(root).findings.filter(f => f.kind === 'roster')).toHaveLength(1);
  });

  test('a quoted bun run script that package.json does not declare is reported; placeholders and file runs pass', () => {
    write('package.json', JSON.stringify({ scripts: { 'test': 'x', 'docs:check': 'y' } }));
    write('README.md', [
      'Run `bun run test` and `bun run --silent docs:check`.',
      '',
      '```bash',
      'bun run nope:gone',
      '```',
      '',
      'Placeholders: `bun run <script>`, `bun run {name}`, `bun run scripts/tool.ts`.',
    ].join('\n'));
    write('docs/onboarding.html', `${head}<code>bun run missing-one</code>`);
    write('AGENTS.md', 'Verify with `bun run docs:check`, never `bun run old-name`.');
    const findings = lintDocs(root).findings.filter(f => f.kind === 'script');
    expect(findings.map(tag)).toEqual([
      'warning:AGENTS.md:1:script:old-name',
      'warning:README.md:4:script:nope:gone',
      'warning:docs/onboarding.html:1:script:missing-one',
    ]);
  });

  test('a package README resolves its own scripts plus the root ones', () => {
    write('package.json', JSON.stringify({ scripts: { 'repo:check': 'x' } }));
    write('packages/create-agentic-dev/package.json', JSON.stringify({ scripts: { build: 'y' } }));
    write('packages/create-agentic-dev/README.md', '`bun run repo:check`, then `bun run build`, never `bun run gone`.');
    const findings = lintDocs(root).findings.filter(f => f.kind === 'script');
    expect(findings.map(f => `${f.file}:${f.target}`)).toEqual(['packages/create-agentic-dev/README.md:gone']);
  });
});

describe('lint-docs published site (Pages home and decks)', () => {
  test('maps a published file to its site path; markdown and unpublished files have none', () => {
    expect(sitePathOf('packages/pages-home/index.html')).toBe('index.html');
    expect(sitePathOf('packages/decks/a/how-it-works.es.html')).toBe('decks/a/how-it-works.es.html');
    expect(sitePathOf('docs/onboarding.html')).toBe('onboarding.html');
    expect(sitePathOf('docs/other.html')).toBeNull();
    expect(sitePathOf('docs/README.md')).toBeNull();
  });

  test('resolves a home-page link the way the site serves it', () => {
    expect(resolvePublishedLink('index.html', './decks/a/x.html')).toBe('packages/decks/a/x.html');
    expect(resolvePublishedLink('index.html', './harnesses.html')).toBe('packages/pages-home/harnesses.html');
    expect(resolvePublishedLink('decks/a/x.html', '../../index.html')).toBe('packages/pages-home/index.html');
    expect(resolvePublishedLink('decks/a/x.html', '../../../README.md')).toBe('outside');
    expect(resolvePublishedLink('index.html', './onboarding.html')).toBe('docs/onboarding.html');
    expect(resolvePublishedLink('decks/a/x.html', '../../onboarding.html')).toBe('docs/onboarding.html');
  });

  test('a dead home-page link fails; a live one and a link back from a deck pass', () => {
    write('packages/pages-home/index.html', [
      '<a href="./decks/a/x.html">ok</a>',
      '<a href="./decks/">deck index</a>',
      '<a href="./decks/gone/x.html">gone</a>',
      '<a href="./onboarding.html">start here</a>',
    ].join('\n'));
    write('packages/decks/a/x.html', '<a href="../../index.html">hub</a> <a href="../a/x.html">self</a>');
    write('docs/onboarding.html', `${head}<a href="./decks/a/x.html">deck</a>`);
    const findings = lintDocs(root).findings.filter(f => f.kind === 'link');
    expect(findings.map(f => `${f.file}:${f.line}:${f.target}`)).toEqual([
      'packages/pages-home/index.html:3:./decks/gone/x.html',
    ]);
  });
});
