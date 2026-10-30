/**
 * @fileoverview The delivery skills (`sprint-development`, `autonomous-delivery`)
 * read the app's stack and branches instead of hardcoding them.
 *
 * Two guards. (1) No app command, branch literal or package-manager literal is
 * left hardcoded in their prose, so an adopted app with other script names, no
 * integration branch or its own CI is driven by its own values. (2) Greenfield
 * is unchanged: with the `stack:` defaults the schema ships, every
 * parametrized app command resolves to the exact command the skills ran
 * before they were parametrized.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { generateSchema, SCHEMA_SOURCE } from '../cli/lib/agents-schema.ts';
import { readStack, STACK_FIELDS } from '../cli/lib/stack-descriptor.ts';

const REPO_ROOT = join(import.meta.dir, '..');
const SKILLS = ['sprint-development', 'autonomous-delivery'];

interface Doc { path: string, lines: string[] }

function markdownUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { return markdownUnder(full); }
    return name.endsWith('.md') ? [full] : [];
  });
}

const docs: Doc[] = SKILLS.flatMap(skill => markdownUnder(join(REPO_ROOT, '.agents/skills', skill)))
  .map(full => ({ path: relative(REPO_ROOT, full), lines: readFileSync(full, 'utf8').split('\n') }));

/** Every line matching `re`, as `path:line: text`. */
function hits(re: RegExp): string[] {
  return docs.flatMap(doc => doc.lines.flatMap((text, i) => (re.test(text) ? [`${doc.path}:${i + 1}: ${text.trim()}`] : [])));
}

const greenfield = readStack(generateSchema(readFileSync(join(REPO_ROOT, SCHEMA_SOURCE), 'utf8')).schema).values;

/** Resolves every `{{stack.<path>}}` in `text` against `values`; an unknown path stays visible. */
function resolve(text: string, values: Record<string, string | null>): string {
  return text.replace(/\{\{stack\.([a-z_][a-z0-9_.]*)\}\}/g, (whole, path: string) => values[path] ?? whole);
}

describe('the delivery skills read the stack', () => {
  test('no app script is invoked by a hardcoded name or package manager', () => {
    // The agentic tooling (`bun run jira:*`, `skills:*`, `context:map`, `agents:setup`) is NOT app code and stays literal.
    const appCommand = /\b(?:npm (?:run|ci|install)\b|(?:bun|pnpm|yarn) run (?:dev|build|lint|lint:check|types:check|typecheck|test|db:types)(?![\w:-])|tsc --noEmit)/;
    expect(hits(appCommand)).toEqual([]);
  });

  test('no git command or CI trigger names a literal integration or production branch', () => {
    const literalBranch = /--base (?:main|staging|develop)\b|origin\/(?:staging|develop)\b|refs\/heads\/(?:main|staging|develop)\b|branches: \[[^\]]*\b(?:main|staging|develop)\b|git (?:checkout|pull origin|merge) (?:main|staging|develop)\b/;
    expect(hits(literalBranch)).toEqual([]);
  });

  test('every {{stack.*}} reference names a leaf of the block', () => {
    const declared = new Set<string>(STACK_FIELDS.map(f => f.path));
    const unknown = docs.flatMap(doc => [...doc.lines.join('\n').matchAll(/\{\{stack\.([a-z_][a-z0-9_.]*)\}\}/g)]
      .map(m => m[1])
      .filter(path => !declared.has(path))
      .map(path => `${doc.path}: {{stack.${path}}}`));
    expect(unknown).toEqual([]);
  });

  test('greenfield is unchanged: with the schema defaults every app command resolves to the command the skills always ran', () => {
    const appCommands = docs.flatMap(doc => [...doc.lines.join('\n').matchAll(/\{\{stack\.package_manager\}\} run \{\{stack\.scripts\.[a-z_]+\}\}/g)]
      .map(m => resolve(m[0], greenfield)));
    expect(appCommands.length).toBeGreaterThan(0);
    const before = new Set(['bun run dev', 'bun run build', 'bun run lint:check', 'bun run types:check', 'bun run test', 'bun run db:types']);
    expect(appCommands.filter(cmd => !before.has(cmd))).toEqual([]);
  });

  test('greenfield applies schema changes through the DB MCP with no migration files', () => {
    expect(greenfield['database.migrations_tool']).toBe('supabase-mcp');
    expect(greenfield['database.migrations_dir']).toBeNull();
    expect(greenfield.package_manager).toBe('bun');
    expect(greenfield.app_root).toBe('.');
  });
});
