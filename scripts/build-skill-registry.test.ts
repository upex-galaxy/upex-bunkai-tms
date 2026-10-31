/**
 * Regression tests for `scripts/build-skill-registry.ts`, run against fixture
 * repos. The script resolves its skills directory from `process.cwd()`, so each
 * fixture is a temp dir holding nothing but `.agents/skills/<slug>/SKILL.md`
 * and the script is spawned with that dir as its working directory.
 *
 * What they guard: the no-truncation contract on AUTHORED rules. A cap on an
 * authored `## Compact Rules` section drops the tail rules from every briefing
 * behind a marker no gate reads, so only the blind Strategy B scrape may be
 * capped. Frontmatter `compact_rules` stay verbatim and uncapped too.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

const BUILD_SCRIPT = resolve(import.meta.dir, 'build-skill-registry.ts');
const TRUNCATION_MARKER = '(truncated';

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

/** A temp repo carrying exactly one skill, whose frontmatter extras and body the caller supplies. */
function fixture(slug: string, body: string, frontmatterExtra: string[] = []): string {
  const root = mkdtempSync(join(tmpdir(), 'skill-registry-'));
  temporaryRoots.push(root);
  write(root, `.agents/skills/${slug}/SKILL.md`, [
    '---',
    `name: ${slug}`,
    `description: ${slug} fixture.`,
    ...frontmatterExtra,
    '---',
    '',
    `# ${slug}`,
    '',
    body,
    '',
  ].join('\n'));
  return root;
}

function render(root: string): string {
  const result = Bun.spawnSync({
    cmd: ['bun', BUILD_SCRIPT, '--dry-run'],
    cwd: root,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return `${result.stdout.toString()}${result.stderr.toString()}`;
}

const rules = Array.from({ length: 20 }, (_, index) => `- DO: authored rule number ${index + 1}.`);

describe('build-skill-registry authored rules are never truncated', () => {
  test('every bullet of a Compact Rules section longer than 15 reaches the registry', () => {
    const output = render(fixture('rich-skill', ['## Compact Rules', '', ...rules].join('\n')));

    expect(output).toContain('extraction strategy: A');
    expect(output).toContain('- DO: authored rule number 16.');
    expect(output).toContain('- DO: authored rule number 20.');
    expect(output).not.toContain(TRUNCATION_MARKER);
  });

  test('frontmatter compact_rules longer than 15 are carried verbatim', () => {
    const output = render(fixture('frontmatter-skill', '## Overview\n\nProse only.', [
      'compact_rules:',
      ...rules.map(rule => `  ${rule.replace('- DO:', '- "DO:')}"`),
    ]));

    expect(output).toContain('source: frontmatter `compact_rules` (verbatim)');
    expect(output).toContain('- DO: authored rule number 20.');
    expect(output).not.toContain(TRUNCATION_MARKER);
  });

  test('the blind Strategy B scrape stays capped at 15 and says so', () => {
    const output = render(fixture('long-scrape', ['## Notes', '', ...rules].join('\n')));

    expect(output).toContain('extraction strategy: B');
    expect(output).toContain('- DO: authored rule number 15.');
    expect(output).not.toContain('- DO: authored rule number 16.');
    expect(output).toContain(TRUNCATION_MARKER);
  });
});

/** Adds one more skill folder with a Compact Rules section to an existing fixture. */
function addSkill(root: string, slug: string): void {
  write(root, `.agents/skills/${slug}/SKILL.md`, [
    '---',
    `name: ${slug}`,
    `description: ${slug} fixture.`,
    '---',
    '',
    `# ${slug}`,
    '',
    '## Compact Rules',
    '',
    `- DO: ${slug} rule, see [the reference](references/${slug}.md).`,
    '',
  ].join('\n'));
}

function gitInit(root: string): void {
  Bun.spawnSync({ cmd: ['git', 'init', '-q'], cwd: root, stdout: 'ignore', stderr: 'ignore' });
}

describe('build-skill-registry indexes only skills git can commit', () => {
  test('a gitignored skill folder never reaches the registry', () => {
    const root = fixture('committed-skill', '## Compact Rules\n\n- DO: committed rule.');
    addSkill(root, 'local-community-skill');
    write(root, '.gitignore', '.agents/skills/local-community-skill/\n');
    gitInit(root);

    const output = render(root);

    expect(output).toContain('- DO: committed rule.');
    expect(output).not.toContain('local-community-skill');
  });

  test('outside a git work tree every skill on disk is indexed', () => {
    const root = fixture('committed-skill', '## Compact Rules\n\n- DO: committed rule.');
    addSkill(root, 'local-community-skill');
    write(root, '.gitignore', '.agents/skills/local-community-skill/\n');

    const output = render(root);

    expect(output).toContain('- DO: committed rule.');
    expect(output).toContain('- DO: local-community-skill rule');
  });
});
