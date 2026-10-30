/**
 * @fileoverview Tests for the varlock env schema generator and the
 * inherited-override check.
 *
 * What must stay true: the generator is deterministic and reads the manifest's
 * schema hints the way `VarSchemaHints` documents; free text can never leak a
 * decorator into the schema; the schema requires nothing (ADR-0010); the
 * committed pair actually loads through the pinned varlock (the layout's one
 * undocumented reliance, see the header of `./env-schema.ts`); and an
 * inherited process value that differs from `.env` is reported by NAME, never
 * by value. The varlock cases shell out to `bunx varlock`, so they need
 * `bun install` to have run.
 */

import type { VarSpec } from './variables-manifest.ts';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, test } from 'bun:test';

import {
  checkSchemaSensitivity,
  CORE_SCHEMA_FILE,
  declaredSchemaKeys,
  deprecatedEnvKeysIn,
  generateCoreSchema,
  inheritedOverrides,
  isSecretLookingName,
  lintSchemaSensitivity,
  loadSchemaPairThroughVarlock,
  neutralizeDeprecatedKeys,
  parseSchemaForSensitivity,
  placeholderEnv,
  placeholderFor,
  PROJECT_SCHEMA_FILE,
  projectSchemaTemplate,
  schemaClassification,
  schemaFilesIn,
  SECRET_NAME_PATTERNS,
  seedProjectSchema,
  sensitiveSchemaKeys,
  UNROUTED_VARS,
  writeCoreSchema,
} from './env-schema.ts';
import { providerSchemaTemplate } from './secret-providers.ts';
import { DEPRECATED_VARS, envFileVars, VAR_MANIFEST } from './variables-manifest.ts';

const REPO_ROOT = path.resolve(import.meta.dir, '..', '..');

function spec(overrides: Partial<VarSpec> & { name: string }): VarSpec {
  return {
    destinations: ['local'],
    secret: false,
    required: false,
    critical: false,
    obtainHint: 'somewhere',
    note: 'a note',
    ...overrides,
  };
}

function withScratch<T>(fn: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-schema-test-'));
  try {
    return fn(dir);
  }
  finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('generateCoreSchema', () => {
  test('is deterministic, LF-only, ends with one newline', () => {
    const a = generateCoreSchema();
    expect(a).toBe(generateCoreSchema());
    expect(a.includes('\r')).toBe(false);
    expect(a.endsWith('\n')).toBe(true);
    expect(a.endsWith('\n\n')).toBe(false);
  });

  test('declares every env-file manifest var and every unrouted var exactly once, never ATLASSIAN_URL nor a deprecated key', () => {
    const text = generateCoreSchema();
    const declared = text.split('\n').filter(l => /^[A-Z][A-Z0-9_]*=/.test(l)).map(l => l.slice(0, l.indexOf('=')));
    for (const s of envFileVars()) { expect(declared.filter(k => k === s.name)).toHaveLength(1); }
    for (const u of UNROUTED_VARS) { expect(declared.filter(k => k === u.name)).toHaveLength(1); }
    for (const d of DEPRECATED_VARS) { expect(declared).not.toContain(d.name); }
    expect(declared).not.toContain('ATLASSIAN_URL');
    expect(declared).toEqual(declaredSchemaKeys());
  });

  test('maps secret to @sensitive and the hints to decorators, with no value on any item line', () => {
    const text = generateCoreSchema([
      spec({ name: 'A_TOKEN', secret: true, schema: { docs: 'https://example.test/tokens' } }),
      spec({ name: 'A_URL', schema: { type: 'url', example: 'http://localhost:3000' } }),
      spec({ name: 'A_PLAIN' }),
    ], []);
    expect(text).toContain('# @sensitive @docs(https://example.test/tokens)\nA_TOKEN=\n');
    expect(text).toContain('# @type=url @example="http://localhost:3000"\nA_URL=\n');
    expect(text).toContain('# Obtain: somewhere\nA_PLAIN=\n');
  });

  test('the schema requires nothing (ADR-0010)', () => {
    const text = generateCoreSchema();
    expect(text).not.toMatch(/^# .*@required/m);
    expect(text).toContain('# @defaultRequired=false');
  });

  test('every manifest secret and every sensitive unrouted var is @sensitive', () => {
    const sensitive = sensitiveSchemaKeys();
    for (const s of envFileVars().filter(v => v.secret)) { expect(sensitive.has(s.name)).toBe(true); }
    expect(sensitive.has('SUPABASE_ACCESS_TOKEN')).toBe(true);
    expect(sensitive.has('NEXT_PUBLIC_APP_URL')).toBe(false);
  });

  test('free text cannot smuggle a decorator or a line break into the schema', () => {
    const text = generateCoreSchema([
      spec({ name: 'A', note: 'contact ops@example.test\nsecond line', obtainHint: '@required is not a hint' }),
    ], [{ name: 'K', docs: 'unrouted @sensitive text' }]);
    expect(text).toContain('# contact ops(at)example.test second line\n# Obtain: (at)required is not a hint\nA=\n');
    expect(text).toContain('# unrouted (at)sensitive text\nK=\n');
  });

  test('rejects an unrouted var that shadows a manifest var', () => {
    expect(() => generateCoreSchema([spec({ name: 'A' })], [{ name: 'A', docs: 'dup' }])).toThrow(/declare it once/);
  });
});

describe('schemaClassification', () => {
  test('reads the committed pair: core secrets sensitive, project re-declaration wins', () => {
    withScratch((dir) => {
      fs.writeFileSync(path.join(dir, CORE_SCHEMA_FILE), generateCoreSchema());
      fs.writeFileSync(path.join(dir, PROJECT_SCHEMA_FILE), [
        '# @import(./.env.core.schema)',
        '# ---',
        '# @sensitive @required',
        'STRIPE_SECRET_KEY=',
        '# @sensitive',
        'NEXT_PUBLIC_APP_URL=',
        '',
      ].join('\n'));
      const c = schemaClassification(dir);
      expect(c).not.toBeNull();
      expect(c!.sensitive.has('STRIPE_SECRET_KEY')).toBe(true);
      expect(c!.sensitive.has('SUPABASE_SECRET_KEY')).toBe(true);
      expect(c!.sensitive.has('NEXT_PUBLIC_APP_URL')).toBe(true);
      expect(c!.sensitive.has('ATLASSIAN_EMAIL')).toBe(false);
      expect(c!.declared.has('ATLASSIAN_EMAIL')).toBe(true);
      expect(c!.declared.has('ATLASSIAN_URL')).toBe(false);
    });
  });

  test('null when neither file exists', () => {
    withScratch(dir => expect(schemaClassification(dir)).toBeNull());
  });
});

describe('deprecated keys in .env', () => {
  test('deprecatedEnvKeysIn names active assignments only, never a value', () => {
    const text = 'JIRA_URL=https://old.example\n# JIRA_USERNAME=commented\nexport JIRA_API_TOKEN=\nOTHER=1\n';
    expect(deprecatedEnvKeysIn(text)).toEqual(['JIRA_URL', 'JIRA_API_TOKEN']);
  });

  test('neutralizeDeprecatedKeys sets a constant placeholder and never touches other keys', () => {
    const env = neutralizeDeprecatedKeys({ JIRA_URL: '', KEEP: 'x' }, ['JIRA_URL']);
    expect(env).toEqual({ JIRA_URL: 'deprecated', KEEP: 'x' });
  });
});

describe('placeholders', () => {
  test('placeholderFor satisfies each type without being real', () => {
    expect(placeholderFor('email', false)).toBe('placeholder@example.test');
    expect(placeholderFor('url', false)).toMatch(/^https:\/\//);
    expect(placeholderFor(undefined, true).length).toBeGreaterThan(20);
  });

  test('placeholderEnv fills every declared item', () => {
    expect(Object.keys(placeholderEnv()).sort()).toEqual([...declaredSchemaKeys()].sort());
  });
});

describe('files', () => {
  test('writeCoreSchema is idempotent and seedProjectSchema never overwrites', () => {
    withScratch((dir) => {
      expect(writeCoreSchema(dir)).toBe(true);
      expect(writeCoreSchema(dir)).toBe(false);
      expect(seedProjectSchema(dir)).toBe(true);
      fs.writeFileSync(path.join(dir, PROJECT_SCHEMA_FILE), '# mine\n', 'utf8');
      expect(seedProjectSchema(dir)).toBe(false);
      expect(fs.readFileSync(path.join(dir, PROJECT_SCHEMA_FILE), 'utf8')).toBe('# mine\n');
    });
  });

  test('the project template imports the core file and holds no value', () => {
    const t = projectSchemaTemplate();
    expect(t).toContain(`# @import(./${CORE_SCHEMA_FILE})`);
    expect(t.split('\n').filter(l => /^[A-Z][A-Z0-9_]*=./.test(l))).toEqual([]);
  });
});

describe('the committed pair loads through the pinned varlock', () => {
  test('the repo pair resolves every core item with .env.core.schema read as a schema source', () => {
    const result = loadSchemaPairThroughVarlock(REPO_ROOT);
    expect(result.reason).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(result.sources.some(s => s.type === 'schema' && s.label.endsWith(CORE_SCHEMA_FILE))).toBe(true);
    expect(result.resolvedKeys).toContain('SUPABASE_SECRET_KEY');
  });

  test('a project file that forgot the import fails the gate instead of passing silently', () => {
    withScratch((dir) => {
      fs.copyFileSync(path.join(REPO_ROOT, CORE_SCHEMA_FILE), path.join(dir, CORE_SCHEMA_FILE));
      fs.writeFileSync(path.join(dir, PROJECT_SCHEMA_FILE), '# @defaultRequired=false\n# ---\nMY_VAR=\n', 'utf8');
      const noImport = loadSchemaPairThroughVarlock(dir, REPO_ROOT);
      expect(noImport.ok).toBe(false);
      expect(noImport.reason).toMatch(/not loaded as a schema source|core items not in the resolved graph/);
    });
  });

  test('a typed item with a malformed value fails the load', () => {
    withScratch((dir) => {
      fs.writeFileSync(path.join(dir, CORE_SCHEMA_FILE), generateCoreSchema());
      fs.writeFileSync(path.join(dir, PROJECT_SCHEMA_FILE), projectSchemaTemplate());
      fs.writeFileSync(path.join(dir, '.env'), 'NEXT_PUBLIC_SUPABASE_URL=not-a-url\n');
      const run = spawnSync('bunx', ['varlock', 'load', '--agent', '--path', `${dir}${path.sep}`], { cwd: REPO_ROOT, encoding: 'utf8', env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: undefined } });
      expect(run.status).not.toBe(0);
    });
  });
});

describe('inheritedOverrides', () => {
  const SECRET_FILE = 'file-secret-value-0000000000';
  const SECRET_PROC = 'proc-secret-value-1111111111';

  function seed(dir: string): void {
    fs.writeFileSync(path.join(dir, CORE_SCHEMA_FILE), generateCoreSchema());
    fs.writeFileSync(path.join(dir, PROJECT_SCHEMA_FILE), projectSchemaTemplate());
    fs.writeFileSync(path.join(dir, '.env'), [
      `SUPABASE_SECRET_KEY=${SECRET_FILE}`,
      'NEXT_PUBLIC_APP_URL=http://localhost:3000',
      'N8N_API_URL=',
      'POSTGRES_USER=postgres',
      '',
    ].join('\n'));
    fs.writeFileSync(path.join(dir, '.env.local'), 'POSTGRES_USER=local-user\n');
  }

  test('names a differing inherited value, skips equal and empty-file ones, never carries a value', () => {
    withScratch((dir) => {
      seed(dir);
      const report = inheritedOverrides(dir, {
        SUPABASE_SECRET_KEY: SECRET_PROC,
        NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
        N8N_API_URL: 'https://n8n.example.test',
        POSTGRES_USER: 'local-user',
      });
      expect(report.status).toBe('files');
      expect(report.findings.map(f => f.name)).toEqual(['SUPABASE_SECRET_KEY']);
      expect(report.findings[0].sensitive).toBe(true);
      expect(JSON.stringify(report)).not.toContain(SECRET_PROC);
      expect(JSON.stringify(report)).not.toContain(SECRET_FILE);
    });
  });

  test('.env.local wins over .env, as varlock loads them', () => {
    withScratch((dir) => {
      seed(dir);
      expect(inheritedOverrides(dir, { POSTGRES_USER: 'postgres' }).findings.map(f => f.name)).toEqual(['POSTGRES_USER']);
    });
  });

  test('skipped when there is no env file', () => {
    withScratch(dir => expect(inheritedOverrides(dir, { A: 'b' }).status).toBe('skipped'));
  });

  test('takes its candidates from varlock overrideKeys at the repo root', () => {
    const report = inheritedOverrides(REPO_ROOT, { ...process.env });
    expect(['varlock', 'skipped']).toContain(report.status);
  });

  test('the real manifest marks no secret as non-sensitive in the generated schema', () => {
    const sensitive = sensitiveSchemaKeys();
    expect(VAR_MANIFEST.filter(s => s.secret && !sensitive.has(s.name) && envFileVars().includes(s))).toEqual([]);
  });
});

describe('sensitivity lint', () => {
  const lint = (...texts: string[]) => lintSchemaSensitivity(texts.map((text, i) => ({ file: `f${i}.schema`, text })));
  const HEADER_OFF = '# @defaultSensitive=false\n# ---\n\n';

  test('secret names match as whole segments, case-insensitive', () => {
    for (const name of ['GH_TOKEN', 'SLACK_MCP_XOXP_TOKEN', 'slack_xoxb', 'DB_PASSWORD', 'DB_PASSWD', 'GOOGLE_CLIENT_SECRET', 'PORTAL_API_KEY', 'AWS_ACCESS_KEY', 'SSH_PRIVATE_KEY', 'GITHUB_PAT', 'GOOGLE_CREDENTIALS', 'OP_SERVICE_ACCOUNT_TOKEN']) {
      expect(isSecretLookingName(name)).toBe(true);
    }
    for (const name of ['MAX_TOKENS', 'TOKENIZER', 'JIRA_PROJECT_KEY', 'PATH', 'PASSWORDLESS_MODE', 'GOOGLE_CLIENT_ID', 'TEST_ENV']) {
      expect(isSecretLookingName(name)).toBe(false);
    }
    expect(SECRET_NAME_PATTERNS).toContain('XOXP');
  });

  test('the QA incident: a scratch schema declaring a token without @sensitive fails, naming key and line', () => {
    const v = lint('SLACK_MCP_REACTION_TOOL=\nSLACK_MCP_XOXP_TOKEN=\n');
    expect(v).toEqual([{ key: 'SLACK_MCP_XOXP_TOKEN', file: 'f0.schema', line: 2, reason: 'secret-looking name without @sensitive' }]);
  });

  test('bare @sensitive, @sensitive=true, @sensitive={...} and a post-value comment all pass', () => {
    expect(lint(`${HEADER_OFF}# @sensitive @docs(https://x.test)\nA_TOKEN=\n# @sensitive=true\nB_TOKEN=\n# @sensitive={preventLeaks=false}\nC_TOKEN=\nD_TOKEN= # @sensitive\nE_TOKEN="a # b" # @sensitive\n`)).toEqual([]);
  });

  test('a decorator must sit in its own comment block, directly above the item', () => {
    const v = lint(`${HEADER_OFF}# @sensitive\n\nA_TOKEN=\n# set @sensitive later\nB_TOKEN=\n`);
    expect(v.map(x => x.key)).toEqual(['A_TOKEN', 'B_TOKEN']);
  });

  test('a commented-out assignment is not an item', () => {
    expect(lint(`${HEADER_OFF}# A_TOKEN=op(op://vault/A_TOKEN/password)\n`)).toEqual([]);
  });

  test('an explicit opt-out anywhere fails, even when another file marks the key @sensitive', () => {
    const v = lint(`${HEADER_OFF}# @sensitive\nA_TOKEN=\n`, `${HEADER_OFF}# @public\nA_TOKEN=\n`);
    expect(v).toEqual([{ key: 'A_TOKEN', file: 'f1.schema', line: 5, reason: 'secret-looking name marked non-sensitive (@public / @sensitive=false)' }]);
    expect(lint(`${HEADER_OFF}# @sensitive=false\nA_TOKEN=\n`)[0].reason).toMatch(/non-sensitive/);
  });

  test('a re-declaration without a decorator keeps the @sensitive of another file', () => {
    expect(lint(`${HEADER_OFF}# @sensitive\nA_TOKEN=\n`, `${HEADER_OFF}# @required\nA_TOKEN=\n`)).toEqual([]);
  });

  test('a non-literal @sensitive fails', () => {
    expect(lint(`${HEADER_OFF}# @sensitive=forEnv(production)\nA_TOKEN=\n`)[0].reason).toMatch(/literal/);
  });

  test('@defaultSensitive=true covers a bare item only when every declaring file says so', () => {
    const overlay = '# @defaultRequired=false\n# @defaultSensitive=true\n# ---\n\nA_TOKEN=op(op://v/A_TOKEN/password)\n';
    expect(lint(overlay)).toEqual([]);
    expect(lint(overlay, `${HEADER_OFF}A_TOKEN=\n`).map(x => x.key)).toEqual(['A_TOKEN']);
    expect(lint('# @defaultSensitive=inferFromPrefix(PUBLIC_)\n# ---\nA_TOKEN=\n')).toEqual([]);
  });

  test('parse reads root @import targets from the header only', () => {
    const parsed = parseSchemaForSensitivity('# @import(./.env.core.schema)\n# @import(./.env.x.schema, allowMissing=true)\n# ---\n# @import(./not-a-root.schema)\nA=\n');
    expect(parsed.imports).toEqual(['./.env.core.schema', './.env.x.schema']);
    expect(parsed.items.map(i => i.key)).toEqual(['A']);
  });

  test('the committed schemas pass, and a violation in an imported file is found', () => {
    const repo = checkSchemaSensitivity(REPO_ROOT);
    expect(repo.violations).toEqual([]);
    expect(repo.files).toEqual(expect.arrayContaining([PROJECT_SCHEMA_FILE, CORE_SCHEMA_FILE]));

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-schema-sens-'));
    try {
      fs.writeFileSync(path.join(dir, PROJECT_SCHEMA_FILE), '# @import(./.env.extra.schema)\n# @defaultSensitive=false\n# ---\n', 'utf8');
      fs.writeFileSync(path.join(dir, '.env.extra.schema'), '# @defaultSensitive=false\n# ---\nNPM_TOKEN=\n', 'utf8');
      expect(schemaFilesIn(dir)).toEqual([PROJECT_SCHEMA_FILE, '.env.extra.schema']);
      const check = checkSchemaSensitivity(dir);
      expect(check.ok).toBe(false);
      expect(check.violations).toEqual([{ key: 'NPM_TOKEN', file: '.env.extra.schema', line: 3, reason: 'secret-looking name without @sensitive' }]);
    }
    finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('the secret-manager overlay setup writes passes, every item active or not', () => {
    const overlay = providerSchemaTemplate({ provider: '1password', onepassword: { vault: 'v', account: null, auth: 'app' } });
    const allActive = overlay.replace(/^# ([A-Z_]\w*=op\()/gm, '$1');
    expect(allActive).not.toBe(overlay);
    expect(lint(overlay)).toEqual([]);
    expect(lint(allActive)).toEqual([]);
  });

  test('every secret-looking manifest var is secret: true, so the generated core passes', () => {
    const unmarked = VAR_MANIFEST.filter(s => isSecretLookingName(s.name) && !s.secret).map(s => s.name);
    expect(unmarked).toEqual([]);
  });
});
