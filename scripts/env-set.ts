#!/usr/bin/env bun
/**
 * env-set.ts — the one sanctioned way for an agent to write a value into `.env`.
 *
 *   bun run env:set KEY=value [KEY2=value2 ...]
 *
 * Critical Rule #1 keeps secrets by NAME: the agent never opens `.env`, and the
 * harness deny rules (`Read(.env)` in `.claude/settings.json`) also refuse any
 * edit of the file. The owner still allows the agent to write a NON-sensitive
 * value (a URL, a project key, a flag, a port) when asked, so that one write
 * path lives here instead of in ad-hoc shell:
 *
 *   - A key is accepted only when the committed env schema (`.env.schema` +
 *     `.env.core.schema`, varlock) declares it and does NOT mark it
 *     `@sensitive`, and the manifest (`cli/lib/variables-manifest.ts`) neither
 *     marks it `secret` nor sources it outside `.env`. Everything else is
 *     refused, unknown keys included: the default is refuse. A project variable
 *     declared in `.env.schema` is writable only once it is declared there
 *     without `@sensitive`. With no schema at all (an install that predates
 *     it) the manifest alone decides, as before.
 *   - The file is read and rewritten inside this process. Nothing is printed
 *     but key NAMES: not the new value, not any other line.
 *   - Every active `KEY=` line of the key is replaced in place; a key with no
 *     active line is appended. Comments and every other line stay untouched.
 *
 * A secret is the human's to type, in a terminal or the secret manager.
 *
 * Exit code: 0 when every pair was written, 1 when any was refused (nothing is
 * written in that case), 2 on a usage error.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { schemaClassification } from '../cli/lib/env-schema.ts';
import { valueSourceOf, VAR_MANIFEST } from '../cli/lib/variables-manifest.ts';

const KEY_RE = /^[A-Z_][A-Z0-9_]*$/;
const REPO_ROOT = join(import.meta.dir, '..');

/** Why a key may not be written, or null when it may. `root` locates the schema pair. */
export function refusalFor(name: string, root: string = REPO_ROOT): string | null {
  if (!KEY_RE.test(name)) { return `'${name}' is not an UPPER_SNAKE_CASE variable name`; }
  const spec = VAR_MANIFEST.find(s => s.name === name);
  if (spec && valueSourceOf(spec) !== 'env-file') {
    return `'${name}' is not read from .env (value source: ${valueSourceOf(spec)}); write it where that source lives`;
  }
  const secret = `'${name}' is a secret: the human types it into .env (or the secret manager), never the agent`;
  if (spec?.secret) { return secret; }
  const schema = schemaClassification(root);
  if (schema === null) {
    if (!spec) {
      return `'${name}' is not declared in cli/lib/variables-manifest.ts, so it cannot be shown to be non-sensitive. Declare it there (secret: false) or let the human set it`;
    }
    return null;
  }
  if (!schema.declared.has(name)) {
    return `'${name}' is not declared in .env.schema / .env.core.schema, so it cannot be shown to be non-sensitive. Declare it in .env.schema (without @sensitive) or let the human set it`;
  }
  if (schema.sensitive.has(name)) { return `${secret} (@sensitive in the env schema)`; }
  return null;
}

/** Renders a value as a `.env` line value, quoting it when a loader would split or strip it. */
export function formatValue(value: string): string {
  if (value === '' || /^[\w.:/@+,=-]+$/.test(value)) { return value; }
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * The trailing ` # comment` of a `.env` line's value part (everything after the
 * `=`), whitespace included, or '' when it has none. A `#` inside a quoted value,
 * or glued to an unquoted one (`a#b`), is part of the value, not a comment.
 */
export function inlineComment(rest: string): string {
  const quoted = /^\s*(["'])/.exec(rest);
  if (quoted !== null) {
    const quote = quoted[1];
    for (let i = quoted[0].length; i < rest.length; i++) {
      if (quote === '"' && rest[i] === '\\') { i++; continue; }
      if (rest[i] === quote) { return /^\s+#.*$/.exec(rest.slice(i + 1))?.[0] ?? ''; }
    }
    return '';
  }
  return /\s+#.*$/.exec(rest)?.[0] ?? '';
}

/**
 * Upserts `name` in `.env` content. Replaces every active (uncommented) line of
 * the key, keeping an `export ` prefix and an inline ` # comment`; appends one
 * line when none exists.
 */
export function upsertEnvLine(content: string, name: string, value: string): string {
  const line = `${name}=${formatValue(value)}`;
  const active = new RegExp(`^(\\s*export\\s+)?${name}\\s*=`);
  let replaced = false;
  const lines = content.split('\n').map((raw) => {
    const m = active.exec(raw);
    if (m === null) { return raw; }
    replaced = true;
    return `${m[1] ?? ''}${line}${inlineComment(raw.slice(m[0].length))}`;
  });
  if (replaced) { return lines.join('\n'); }
  const base = content === '' || content.endsWith('\n') ? content : `${content}\n`;
  return `${base}${line}\n`;
}

/** Parses `KEY=value` arguments. The value may itself contain `=`. */
export function parsePairs(args: string[]): Array<{ name: string, value: string }> | string {
  if (args.length === 0) { return 'usage: bun run env:set KEY=value [KEY2=value2 ...]'; }
  const pairs: Array<{ name: string, value: string }> = [];
  for (const arg of args) {
    const eq = arg.indexOf('=');
    if (eq <= 0) { return `'${arg}' is not KEY=value`; }
    const value = arg.slice(eq + 1);
    if (/[\r\n]/.test(value)) { return `the value for '${arg.slice(0, eq)}' spans lines; .env takes one line per key`; }
    pairs.push({ name: arg.slice(0, eq), value });
  }
  return pairs;
}

/** Runs the command against `<root>/.env`. Returns the exit code. */
export function run(args: string[], root: string, out: (line: string) => void = console.log): number {
  const pairs = parsePairs(args);
  if (typeof pairs === 'string') { out(`env:set: ${pairs}`); return 2; }

  const refusals = pairs.map(p => refusalFor(p.name, root)).filter((r): r is string => r !== null);
  if (refusals.length > 0) {
    for (const r of refusals) { out(`env:set: REFUSED ${r}.`); }
    out('env:set: nothing written.');
    return 1;
  }

  const envPath = join(root, '.env');
  if (!existsSync(envPath)) {
    out('env:set: no .env in this checkout. Create it from the template first (cp .env.example .env), then retry.');
    return 1;
  }

  let content = readFileSync(envPath, 'utf8');
  for (const { name, value } of pairs) { content = upsertEnvLine(content, name, value); }
  writeFileSync(envPath, content);
  out(`env:set: wrote ${pairs.map(p => p.name).join(', ')} to .env (non-sensitive per the env schema). Restart the agent session for a running MCP server to see it.`);
  return 0;
}

if (import.meta.main) {
  process.exit(run(process.argv.slice(2), join(import.meta.dir, '..')));
}
