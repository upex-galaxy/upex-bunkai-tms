/**
 * Regression tests for `scripts/env-set.ts`, the only write path into `.env`
 * an agent may use (Critical Rule #1). What they guard:
 *   1. Both refusal paths: a key the manifest marks `secret: true`, and a key
 *      the manifest does not declare at all (default = refuse). A refusal
 *      writes nothing, even when another pair in the same call was allowed.
 *   2. A key whose value is not read from `.env` (ATLASSIAN_URL) is refused.
 *   3. The upsert replaces the active line in place, keeps comments (an inline
 *      ` # comment` on the replaced line included) and every other line
 *      byte-identical, and appends a missing key.
 *   4. Nothing printed carries a value: neither the one written nor any other.
 *   5. With the env schema present, `@sensitive` in `.env.schema` /
 *      `.env.core.schema` decides: a project key marked `@sensitive` is
 *      refused, one declared without it is writable, an undeclared key is
 *      refused, and a manifest secret stays refused whatever the schema says.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { generateCoreSchema } from '../cli/lib/env-schema.ts';
import { formatValue, inlineComment, parsePairs, refusalFor, run, upsertEnvLine } from './env-set.ts';

const OTHER_SECRET = 'canary-other-secret-value';

let root: string;
let printed: string[];
const out = (line: string): void => { printed.push(line); };

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'env-set-'));
  printed = [];
  writeFileSync(join(root, '.env'), [
    '# local env',
    `SUPABASE_SECRET_KEY=${OTHER_SECRET}`,
    'NEXT_PUBLIC_APP_URL=http://localhost:3000',
    '# NEXT_PUBLIC_APP_URL=commented-out',
    '',
  ].join('\n'));
});

afterEach(() => { rmSync(root, { recursive: true, force: true }); });

const envText = (): string => readFileSync(join(root, '.env'), 'utf8');

describe('refusal', () => {
  it('refuses a key the manifest marks secret', () => {
    expect(refusalFor('SUPABASE_SECRET_KEY')).toContain('is a secret');
    const before = envText();
    expect(run(['SUPABASE_SECRET_KEY=new-value'], root, out)).toBe(1);
    expect(envText()).toBe(before);
  });

  it('refuses a key the manifest does not declare (default = refuse)', () => {
    expect(refusalFor('SOME_UNDECLARED_KEY')).toContain('not declared');
    const before = envText();
    expect(run(['SOME_UNDECLARED_KEY=x'], root, out)).toBe(1);
    expect(envText()).toBe(before);
  });

  it('refuses a key whose value does not live in .env', () => {
    expect(refusalFor('ATLASSIAN_URL')).toContain('not read from .env');
  });

  it('writes nothing when any pair in the call is refused', () => {
    const before = envText();
    expect(run(['NEXT_PUBLIC_APP_URL=https://staging.example.com', 'ATLASSIAN_API_TOKEN=x'], root, out)).toBe(1);
    expect(envText()).toBe(before);
    expect(printed.join('\n')).toContain('nothing written');
  });

  it('accepts a manifest key marked non-sensitive', () => {
    expect(refusalFor('NEXT_PUBLIC_APP_URL')).toBeNull();
  });
});

describe('refusal with the env schema present', () => {
  beforeEach(() => {
    writeFileSync(join(root, '.env.core.schema'), generateCoreSchema());
    writeFileSync(join(root, '.env.schema'), [
      '# @import(./.env.core.schema)',
      '# @defaultSensitive=false',
      '# ---',
      '',
      '# @sensitive',
      'STRIPE_SECRET_KEY=',
      '',
      'FEATURE_FLAG_CHECKOUT=',
      '',
      '# @sensitive=false',
      'SUPABASE_SECRET_KEY=',
      '',
    ].join('\n'));
  });

  it('refuses a project key the schema marks @sensitive', () => {
    expect(refusalFor('STRIPE_SECRET_KEY', root)).toContain('@sensitive');
    const before = envText();
    expect(run(['STRIPE_SECRET_KEY=x'], root, out)).toBe(1);
    expect(envText()).toBe(before);
  });

  it('accepts a project key declared without @sensitive', () => {
    expect(refusalFor('FEATURE_FLAG_CHECKOUT', root)).toBeNull();
    expect(run(['FEATURE_FLAG_CHECKOUT=true'], root, out)).toBe(0);
    expect(envText()).toContain('FEATURE_FLAG_CHECKOUT=true');
  });

  it('refuses a key the schema does not declare', () => {
    expect(refusalFor('SOME_UNDECLARED_KEY', root)).toContain('.env.schema');
  });

  it('refuses a core secret from the generated schema', () => {
    expect(refusalFor('SUPABASE_ACCESS_TOKEN', root)).toContain('@sensitive');
  });

  it('keeps refusing a manifest secret a project re-declares as non-sensitive', () => {
    expect(refusalFor('SUPABASE_SECRET_KEY', root)).toContain('is a secret');
  });

  it('accepts a non-sensitive core item', () => {
    expect(refusalFor('NEXT_PUBLIC_APP_URL', root)).toBeNull();
  });
});

describe('write', () => {
  it('replaces the active line in place and leaves every other line alone', () => {
    expect(run(['NEXT_PUBLIC_APP_URL=https://staging.example.com'], root, out)).toBe(0);
    expect(envText()).toBe([
      '# local env',
      `SUPABASE_SECRET_KEY=${OTHER_SECRET}`,
      'NEXT_PUBLIC_APP_URL=https://staging.example.com',
      '# NEXT_PUBLIC_APP_URL=commented-out',
      '',
    ].join('\n'));
  });

  it('appends a key that has no active line', () => {
    expect(upsertEnvLine('A=1', 'N8N_API_URL', 'https://n8n.example.com')).toBe('A=1\nN8N_API_URL=https://n8n.example.com\n');
  });

  it('keeps an export prefix', () => {
    expect(upsertEnvLine('export NEXT_PUBLIC_APP_URL=old\n', 'NEXT_PUBLIC_APP_URL', 'new')).toBe('export NEXT_PUBLIC_APP_URL=new\n');
  });

  it('keeps an inline comment on the replaced line', () => {
    expect(upsertEnvLine('NEXT_PUBLIC_APP_URL=old # local dev server\n', 'NEXT_PUBLIC_APP_URL', 'https://x.example.com'))
      .toBe('NEXT_PUBLIC_APP_URL=https://x.example.com # local dev server\n');
    expect(upsertEnvLine('NEXT_PUBLIC_APP_URL="a # b"  # why\n', 'NEXT_PUBLIC_APP_URL', 'two words'))
      .toBe('NEXT_PUBLIC_APP_URL="two words"  # why\n');
  });

  it('never prints a value', () => {
    run(['NEXT_PUBLIC_APP_URL=https://staging.example.com'], root, out);
    run(['SUPABASE_SECRET_KEY=attempted-secret'], root, out);
    const all = printed.join('\n');
    expect(all).toContain('NEXT_PUBLIC_APP_URL');
    expect(all).not.toContain('staging.example.com');
    expect(all).not.toContain('attempted-secret');
    expect(all).not.toContain(OTHER_SECRET);
  });

  it('refuses when .env does not exist', () => {
    rmSync(join(root, '.env'));
    expect(run(['NEXT_PUBLIC_APP_URL=x'], root, out)).toBe(1);
  });
});

describe('parsing and formatting', () => {
  it('keeps an = inside the value', () => {
    expect(parsePairs(['NEXT_PUBLIC_APP_URL=https://h/?a=b'])).toEqual([{ name: 'NEXT_PUBLIC_APP_URL', value: 'https://h/?a=b' }]);
  });

  it('rejects a multi-line value and a bare word', () => {
    expect(typeof parsePairs(['NEXT_PUBLIC_APP_URL=a\nb'])).toBe('string');
    expect(typeof parsePairs(['NEXT_PUBLIC_APP_URL'])).toBe('string');
    expect(run([], root, out)).toBe(2);
  });

  it('reads an inline comment only where a loader would', () => {
    expect(inlineComment('old # note')).toBe(' # note');
    expect(inlineComment(' # note')).toBe(' # note');
    expect(inlineComment('a#b')).toBe('');
    expect(inlineComment('"a # b"')).toBe('');
    expect(inlineComment('"a \\" # b" # note')).toBe(' # note');
    expect(inlineComment('\'a # b\' # note')).toBe(' # note');
    expect(inlineComment('"unterminated # x')).toBe('');
    expect(inlineComment('plain')).toBe('');
  });

  it('quotes a value a loader would split or strip', () => {
    expect(formatValue('https://h.example.com:8080/x')).toBe('https://h.example.com:8080/x');
    expect(formatValue('two words')).toBe('"two words"');
    expect(formatValue('a#b')).toBe('"a#b"');
  });
});
