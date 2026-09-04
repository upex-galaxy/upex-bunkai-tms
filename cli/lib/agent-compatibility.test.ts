/* eslint-disable no-template-curly-in-string -- the fixtures below mirror .mcp.json verbatim, `${VAR}` included */
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { PERSONALITY_CONTRACT } from '../../.agents/hooks/personality-reinject.mjs';
import { PersonalityReinject } from '../../.opencode/plugins/personality-reinject.js';
import {
  CLAUDE_HOOK_COMMAND,
  CODEX_HOOK_COMMAND,
  CODEX_HOOK_COMMAND_WINDOWS,
  declaredMcpIds,
  EXPECTED_MCP,
  KNOWN_MCP_IDS,
  stripJsonComments,
  validateHookCompatibility,
  validateMcpParity,
} from './agent-compatibility-contracts.ts';
import {
  checkAgentCompatibility,
  CLAUDE_INSTRUCTIONS_SHIM,
  claudeSkillsAliasPlan,
  COMMAND_ALIAS_MANIFEST,
  commandWrapperCounts,
  isInside,
  POSIX_CLAUDE_SKILLS_TARGET,
  repairClaudeSkillsAlias,
  repairCommandWrappers,
  validateCanonicalSources,
  validateCommandAliases,
} from './agent-compatibility.ts';

const REPO_ROOT = resolve(import.meta.dir, '..', '..');
const temporaryRoots: string[] = [];

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root) { rmSync(root, { recursive: true, force: true }); }
  }
});

function temporaryRoot(prefix = 'agent compatibility '): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

function write(root: string, relativePath: string, content: string): void {
  const destination = join(root, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, content);
}

function copyFromRepo(root: string, relativePath: string): void {
  const destination = join(root, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(join(REPO_ROOT, relativePath), destination);
}

// ---------------------------------------------------------------------------
// Inline fixtures: the four servers this repo ships plus `playwright` (a
// downstream server the contract does not know), spelled per host. Written
// here rather than copied so the tests describe the contract on their own,
// whatever the real repo looks like at the moment they run. Each host file is
// composed from the ids a test declares, so one fixture describes both this
// boilerplate and a downstream project with a different server set.
// ---------------------------------------------------------------------------

/** The set this boilerplate ships (and the strict per-host shapes cover). */
const BOILERPLATE_IDS = ['context7', 'tavily', 'supabase', 'n8n'];
/** A downstream set: no `n8n`, plus a server the contract has no shape for. */
const PROJECT_IDS = ['context7', 'tavily', 'supabase', 'playwright'];

const MCP_SERVERS: Record<string, unknown> = {
  context7: { command: 'bunx', args: ['-y', '@upstash/context7-mcp'] },
  tavily: {
    command: 'bunx',
    args: ['-y', 'mcp-remote', 'https://mcp.tavily.com/mcp/?tavilyApiKey=${TAVILY_API_KEY}'],
  },
  supabase: {
    command: 'bunx',
    args: ['-y', '@supabase/mcp-server-supabase@latest', '--access-token', '${SUPABASE_ACCESS_TOKEN}'],
    env: {
      SUPABASE_URL: '${NEXT_PUBLIC_SUPABASE_URL}',
      SUPABASE_ANON_KEY: '${SUPABASE_PUBLISHABLE_KEY}',
      SUPABASE_SERVICE_ROLE_KEY: '${SUPABASE_SECRET_KEY}',
    },
  },
  n8n: {
    command: 'npx',
    args: ['-y', 'n8n-mcp'],
    env: {
      MCP_MODE: 'stdio',
      LOG_LEVEL: 'error',
      DISABLE_CONSOLE_OUTPUT: 'true',
      N8N_API_URL: '${N8N_API_URL}',
      N8N_API_KEY: '${N8N_API_KEY}',
    },
  },
  playwright: { command: 'bunx', args: ['@playwright/mcp@latest', '--extension'] },
};

// Comments and trailing commas on purpose: this is what Prettier writes.
const OPENCODE_SERVERS: Record<string, string> = {
  context7: `    "context7": {
      "type": "local",
      "command": ["bunx", "-y", "@upstash/context7-mcp"],
      "enabled": true,
    },`,
  tavily: `    "tavily": {
      "type": "local",
      "command": [
        "bunx",
        "-y",
        "mcp-remote",
        "https://mcp.tavily.com/mcp/?tavilyApiKey={env:TAVILY_API_KEY}",
      ],
      "enabled": true,
    },`,
  supabase: `    "supabase": {
      "type": "local",
      "command": [
        "bunx",
        "-y",
        "@supabase/mcp-server-supabase@latest",
        "--access-token",
        "{env:SUPABASE_ACCESS_TOKEN}",
      ],
      "enabled": true,
      "environment": {
        "SUPABASE_URL": "{env:NEXT_PUBLIC_SUPABASE_URL}",
        "SUPABASE_ANON_KEY": "{env:SUPABASE_PUBLISHABLE_KEY}",
        "SUPABASE_SERVICE_ROLE_KEY": "{env:SUPABASE_SECRET_KEY}",
      },
    },`,
  n8n: `    "n8n": {
      "type": "local",
      "command": ["npx", "-y", "n8n-mcp"],
      "enabled": true,
      "environment": {
        "MCP_MODE": "stdio",
        "LOG_LEVEL": "error",
        "DISABLE_CONSOLE_OUTPUT": "true",
        "N8N_API_URL": "{env:N8N_API_URL}",
        "N8N_API_KEY": "{env:N8N_API_KEY}",
      },
    },`,
  playwright: `    "playwright": {
      "type": "local",
      "command": ["bunx", "@playwright/mcp@latest", "--extension"],
      "enabled": true,
    },`,
};

const CODEX_SERVERS: Record<string, string> = {
  context7: `[mcp_servers.context7]
command = "bunx"
enabled = true
args = ["-y", "@upstash/context7-mcp"]
`,
  tavily: `[mcp_servers.tavily]
url = "https://mcp.tavily.com/mcp/"
bearer_token_env_var = "TAVILY_API_KEY"
enabled = true
`,
  supabase: `[mcp_servers.supabase]
command = "bunx"
enabled = true
args = ["-y", "@supabase/mcp-server-supabase@latest"]
env_vars = ["SUPABASE_ACCESS_TOKEN", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"]
`,
  n8n: `[mcp_servers.n8n]
command = "npx"
enabled = true
args = ["-y", "n8n-mcp"]
env_vars = ["N8N_API_URL", "N8N_API_KEY"]

[mcp_servers.n8n.env]
MCP_MODE = "stdio"
LOG_LEVEL = "error"
DISABLE_CONSOLE_OUTPUT = "true"
`,
  playwright: `[mcp_servers.playwright]
command = "bunx"
enabled = true
args = ["@playwright/mcp@latest", "--extension"]
`,
};

function mcpJson(ids: string[]): string {
  const mcpServers = Object.fromEntries(ids.map(id => [id, MCP_SERVERS[id]]));
  return `${JSON.stringify({ mcpServers }, null, 2)}\n`;
}

function opencodeJsonc(ids: string[]): string {
  return `{
  // OpenCode shared team config
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@warp-dot-dev/opencode-warp"],
  "mcp": {
${ids.map(id => OPENCODE_SERVERS[id]).join('\n')}
  },
}
`;
}

function codexToml(ids: string[]): string {
  return `[shell_environment_policy]
inherit = "core"

${ids.map(id => CODEX_SERVERS[id]).join('\n')}`;
}

function hookSettings(command: string, windows?: string): string {
  const hook: Record<string, unknown> = { type: 'command', command, timeout: 5 };
  if (windows) { hook.commandWindows = windows; }
  return `${JSON.stringify({ hooks: { UserPromptSubmit: [{ hooks: [hook] }] } }, null, 2)}\n`;
}

/** Hook adapters + MCP configs (the same `ids` on every host), nothing else. */
function contractFixture(prefix?: string, ids = BOILERPLATE_IDS): string {
  const root = temporaryRoot(prefix);
  copyFromRepo(root, '.agents/hooks/personality-reinject.mjs');
  copyFromRepo(root, '.opencode/plugins/personality-reinject.js');
  write(root, '.claude/settings.json', hookSettings(CLAUDE_HOOK_COMMAND));
  write(root, '.codex/hooks.json', hookSettings(CODEX_HOOK_COMMAND, CODEX_HOOK_COMMAND_WINDOWS));
  write(root, '.mcp.json', mcpJson(ids));
  write(root, 'opencode.jsonc', opencodeJsonc(ids));
  write(root, '.codex/config.toml', codexToml(ids));
  return root;
}

const ALIASES = [
  { alias: 'dev-roadmap', skill: 'project-context', mode: 'dev-roadmap' },
  { alias: 'business-data-map', skill: 'project-context', mode: 'data' },
  { alias: 'sync-ai-memory', skill: 'sync-ai-memory', mode: 'sync' },
];

function manifest(aliases = ALIASES): string {
  return `${JSON.stringify({
    version: 1,
    wrapperHosts: ['claude', 'opencode'],
    aliases: aliases.map(alias => ({
      ...alias,
      description: `Run ${alias.skill} in mode ${alias.mode}`,
      argumentHint: '[args]',
      forwardArguments: true,
      mutability: 'read-only',
    })),
  }, null, 2)}\n`;
}

/** Everything `checkAgentCompatibility` wants, except the alias itself. */
function repositoryFixture(): string {
  const root = contractFixture();
  write(root, 'AGENTS.md', '# AI memory\n');
  write(root, 'CLAUDE.md', CLAUDE_INSTRUCTIONS_SHIM);
  write(root, COMMAND_ALIAS_MANIFEST, manifest());
  for (const skill of new Set(ALIASES.map(alias => alias.skill))) {
    const modes = ALIASES.filter(alias => alias.skill === skill).map(alias => `\`${alias.mode}\``);
    write(root, `.agents/skills/${skill}/SKILL.md`, `---\nname: ${skill}\n---\n\nModes: ${modes.join(', ')}.\n`);
  }
  repairCommandWrappers(root);
  return root;
}

describe('shared personality hook', () => {
  test('emits the canonical payload and exits successfully', () => {
    const result = Bun.spawnSync({
      cmd: ['node', join(REPO_ROOT, '.agents/hooks/personality-reinject.mjs')],
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toBe(PERSONALITY_CONTRACT);
    expect(result.stderr.toString()).toBe('');
  });

  test('names AGENTS.md as canonical, never CLAUDE.md', () => {
    expect(PERSONALITY_CONTRACT).toContain('AGENTS.md §2');
    expect(PERSONALITY_CONTRACT).not.toContain('CLAUDE.md');
  });

  test('OpenCode mutates the system array in place with the same payload', async () => {
    const plugin = await PersonalityReinject();
    const transform = plugin['experimental.chat.system.transform'];
    const output = { system: ['base system'] };
    const originalArray = output.system;

    await transform({ sessionID: 'test', model: {} }, output);
    await transform({ sessionID: 'test', model: {} }, output);

    expect(output.system).toBe(originalArray);
    expect(output.system).toEqual(['base system', PERSONALITY_CONTRACT]);
  });
});

describe('Codex hook portability', () => {
  test('fails when the current directory has no Git root', () => {
    const root = contractFixture('agent compatibility no git ');
    const result = Bun.spawnSync({
      cmd: ['sh', '-c', CODEX_HOOK_COMMAND],
      cwd: root,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(result.exitCode).not.toBe(0);
  });

  test('resolves a Git root whose path contains spaces', () => {
    const root = contractFixture('agent compatibility spaced root ');
    const nested = join(root, 'nested directory');
    mkdirSync(nested);
    const init = Bun.spawnSync({ cmd: ['git', 'init', '-q'], cwd: root, stderr: 'pipe' });
    expect(init.exitCode).toBe(0);

    const result = Bun.spawnSync({
      cmd: ['sh', '-c', CODEX_HOOK_COMMAND],
      cwd: nested,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toBe(PERSONALITY_CONTRACT);
  });

  test('renders a Windows command with Git-root and Join-Path resolution', () => {
    expect(CODEX_HOOK_COMMAND_WINDOWS).toContain('git rev-parse --show-toplevel');
    expect(CODEX_HOOK_COMMAND_WINDOWS).toContain('Join-Path $root \'.agents/hooks/personality-reinject.mjs\'');
    expect(CODEX_HOOK_COMMAND_WINDOWS).not.toContain('/Users/');
  });
});

describe('hook adapters', () => {
  test('accepts the three adapters wired to the shared emitter', () => {
    expect(validateHookCompatibility(contractFixture())).toEqual([]);
  });

  test('the real repository wires its adapters to the shared emitter', () => {
    expect(validateHookCompatibility(REPO_ROOT)).toEqual([]);
  });

  test('rejects an absolute personal hook path', () => {
    const root = contractFixture();
    write(root, '.codex/hooks.json', hookSettings(
      'node \'/Users/example/repo/.agents/hooks/personality-reinject.mjs\'',
      CODEX_HOOK_COMMAND_WINDOWS,
    ));

    expect(validateHookCompatibility(root)).toContain('codex hook command contains an absolute personal path.');
  });

  test('rejects the legacy Claude-only hook file next to the shared emitter', () => {
    const root = contractFixture();
    write(root, '.claude/hooks/personality-reinject.js', 'process.stdout.write("dup");\n');

    expect(validateHookCompatibility(root)).toContain('Duplicated personality hook must be removed: .claude/hooks/personality-reinject.js');
  });

  test('rejects an OpenCode adapter that reassigns output.system', () => {
    const root = contractFixture();
    write(root, '.opencode/plugins/personality-reinject.js', [
      'import { PERSONALITY_CONTRACT } from \'../../.agents/hooks/personality-reinject.mjs\';',
      'export const PersonalityReinject = async () => ({',
      '  \'experimental.chat.system.transform\': async (_input, output) => {',
      '    output.system = [...output.system, PERSONALITY_CONTRACT];',
      '  },',
      '});',
      '',
    ].join('\n'));

    expect(validateHookCompatibility(root)).toContain('OpenCode personality adapter must mutate output.system in place.');
  });
});

describe('MCP semantic parity', () => {
  test('the contract itself agrees on .env dependencies across hosts', () => {
    for (const id of KNOWN_MCP_IDS) {
      expect(EXPECTED_MCP.opencode[id].dependsOn).toEqual(EXPECTED_MCP.claude[id].dependsOn);
      expect(EXPECTED_MCP.codex[id].dependsOn).toEqual(EXPECTED_MCP.claude[id].dependsOn);
      expect(EXPECTED_MCP.codex[id].literalEnv).toEqual(EXPECTED_MCP.claude[id].literalEnv);
    }
  });

  test('accepts the four boilerplate servers across all harnesses', () => {
    expect(validateMcpParity(contractFixture())).toEqual([]);
  });

  test('the real repository declares the same servers on every host', () => {
    // A downstream project may declare more servers than the boilerplate's own
    // four (this repo adds playwright + dbhub); parity is what matters.
    expect(declaredMcpIds(REPO_ROOT)).toEqual(expect.arrayContaining([...KNOWN_MCP_IDS]));
    expect(validateMcpParity(REPO_ROOT)).toEqual([]);
  });

  test('strips comments without touching string contents', () => {
    expect(JSON.parse(stripJsonComments('{ // c\n "a": "http://x/*y*/" /* b */ }'))).toEqual({ a: 'http://x/*y*/' });
  });

  test('renamed Supabase keys resolve to the same .env variables Codex forwards', () => {
    // Claude/OpenCode set SUPABASE_URL from ${NEXT_PUBLIC_SUPABASE_URL}; Codex
    // forwards NEXT_PUBLIC_SUPABASE_URL by name. Same dependency, no error.
    const root = contractFixture();
    expect(validateMcpParity(root)).toEqual([]);

    const config = readFileSync(join(root, '.codex/config.toml'), 'utf8')
      .replace('"NEXT_PUBLIC_SUPABASE_URL"', '"SUPABASE_URL"');
    writeFileSync(join(root, '.codex/config.toml'), config);

    const errors = validateMcpParity(root);
    expect(errors.some(error => error.includes('codex MCP supabase mismatch') && error.includes('SUPABASE_URL'))).toBe(true);
    expect(errors.some(error => error.includes('MCP supabase env contract differs between claude and codex'))).toBe(true);
  });

  test('reports a missing Tavily server', () => {
    const root = contractFixture();
    const configPath = join(root, '.codex/config.toml');
    const config = readFileSync(configPath, 'utf8').replace(
      /\n\[mcp_servers\.tavily\][\s\S]*?(?=\n\[mcp_servers\.)/,
      '\n',
    );
    writeFileSync(configPath, config);

    expect(validateMcpParity(root)).toEqual([
      'MCP tavily missing from codex: declared in .mcp.json, absent from .codex/config.toml',
    ]);
  });

  test('reports an MCP ID mismatch on both sides', () => {
    const root = contractFixture();
    const configPath = join(root, '.mcp.json');
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    config.mcpServers.context8 = config.mcpServers.context7;
    delete config.mcpServers.context7;
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

    const errors = validateMcpParity(root);
    expect(errors).toContain('MCP context8 missing from opencode: declared in .mcp.json, absent from opencode.jsonc');
    expect(errors).toContain('MCP context8 missing from codex: declared in .mcp.json, absent from .codex/config.toml');
    expect(errors).toContain('MCP context7 present in opencode only: declare it in .mcp.json or remove it from opencode.jsonc');
    expect(errors).toContain('MCP context7 present in codex only: declare it in .mcp.json or remove it from .codex/config.toml');
  });

  test('reports an environment-variable mismatch', () => {
    const root = contractFixture();
    const configPath = join(root, 'opencode.jsonc');
    const config = readFileSync(configPath, 'utf8').replace('{env:TAVILY_API_KEY}', '{env:TAVILY_TOKEN}');
    writeFileSync(configPath, config);

    expect(validateMcpParity(root).some(error => error.includes('opencode MCP tavily mismatch') && error.includes('TAVILY_TOKEN'))).toBe(true);
  });

  test('reports a literal setting that differs on one host', () => {
    const root = contractFixture();
    const configPath = join(root, '.codex/config.toml');
    writeFileSync(configPath, readFileSync(configPath, 'utf8').replace('LOG_LEVEL = "error"', 'LOG_LEVEL = "debug"'));

    expect(validateMcpParity(root).some(error => error.includes('codex MCP n8n mismatch') && error.includes('debug'))).toBe(true);
  });

  test('rejects a placeholder inside a Codex env table', () => {
    const root = contractFixture();
    const configPath = join(root, '.codex/config.toml');
    writeFileSync(configPath, `${readFileSync(configPath, 'utf8')}N8N_API_KEY = "\${N8N_API_KEY}"\n`);

    expect(validateMcpParity(root)).toEqual([
      '.codex/config.toml n8n.env cannot reference N8N_API_KEY: Codex does not expand placeholders. Forward the variable through env_vars instead.',
    ]);
  });
});

describe('project-declared MCP set', () => {
  // A downstream project (no `n8n`, plus `playwright`) is the canonical set
  // for ITS three configs: `.mcp.json` declares, the other two must match.

  test('accepts a project whose set differs from the boilerplate on every host', () => {
    const root = contractFixture(undefined, PROJECT_IDS);
    expect(declaredMcpIds(root)).toEqual([...PROJECT_IDS].sort());
    expect(validateMcpParity(root)).toEqual([]);
  });

  test('reports a declared server that Codex does not carry', () => {
    const root = contractFixture(undefined, PROJECT_IDS);
    write(root, '.codex/config.toml', codexToml(PROJECT_IDS.filter(id => id !== 'playwright')));

    expect(validateMcpParity(root)).toEqual([
      'MCP playwright missing from codex: declared in .mcp.json, absent from .codex/config.toml',
    ]);
  });

  test('reports a server that only OpenCode carries', () => {
    const root = contractFixture(undefined, PROJECT_IDS);
    write(root, 'opencode.jsonc', opencodeJsonc([...PROJECT_IDS, 'n8n']));

    expect(validateMcpParity(root)).toEqual([
      'MCP n8n present in opencode only: declare it in .mcp.json or remove it from opencode.jsonc',
    ]);
  });

  test('still pins the per-host shape of a known server the project declares', () => {
    const root = contractFixture(undefined, PROJECT_IDS);
    const configPath = join(root, '.codex/config.toml');
    // Same .env dependencies, different command shape: only the strict check sees it.
    writeFileSync(configPath, readFileSync(configPath, 'utf8')
      .replace('args = ["-y", "@supabase/mcp-server-supabase@latest"]', 'args = ["-y", "@supabase/mcp-server-supabase@latest", "--read-only"]'));

    const errors = validateMcpParity(root);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toStartWith('codex MCP supabase mismatch: expected ');
    expect(errors[0]).toContain('--read-only');
  });

  test('compares the .env contract of an unknown server across hosts', () => {
    const root = contractFixture(undefined, PROJECT_IDS);
    const configPath = join(root, '.codex/config.toml');
    writeFileSync(configPath, `${readFileSync(configPath, 'utf8')}env_vars = ["PLAYWRIGHT_BROWSERS_PATH"]\n`);

    expect(validateMcpParity(root)).toEqual([
      'MCP playwright env contract differs between claude and codex: {"dependsOn":[],"literalEnv":{}} vs {"dependsOn":["PLAYWRIGHT_BROWSERS_PATH"],"literalEnv":{}}',
    ]);
  });

  test('leaves an unknown server alone when its shape differs but its contract matches', () => {
    const root = contractFixture(undefined, PROJECT_IDS);
    const configPath = join(root, '.codex/config.toml');
    writeFileSync(configPath, readFileSync(configPath, 'utf8')
      .replace('args = ["@playwright/mcp@latest", "--extension"]', 'args = ["@playwright/mcp@latest"]'));

    expect(validateMcpParity(root)).toEqual([]);
  });
});

describe('canonical sources', () => {
  test('requires AGENTS.md, the skills store and a byte-exact CLAUDE.md shim', () => {
    const root = temporaryRoot();
    expect(validateCanonicalSources(root)).toEqual(['Canonical instructions missing: AGENTS.md']);

    write(root, 'AGENTS.md', '# memory\n');
    mkdirSync(join(root, '.agents/skills'), { recursive: true });
    expect(validateCanonicalSources(root)).toEqual(['Claude instruction shim missing: CLAUDE.md']);

    write(root, 'CLAUDE.md', '@AGENTS.md\n\nSome operational prose.\n');
    expect(validateCanonicalSources(root)).toEqual(['CLAUDE.md must contain exactly `@AGENTS.md` followed by one newline.']);

    write(root, 'CLAUDE.md', CLAUDE_INSTRUCTIONS_SHIM);
    expect(validateCanonicalSources(root)).toEqual([]);
  });
});

describe('Claude skills alias', () => {
  test('constructs portable POSIX and Windows alias plans', () => {
    const root = temporaryRoot();
    expect(claudeSkillsAliasPlan(root, 'linux')).toMatchObject({
      target: POSIX_CLAUDE_SKILLS_TARGET,
      type: 'symlink',
    });
    expect(claudeSkillsAliasPlan(root, 'win32')).toMatchObject({
      target: join(root, '.agents', 'skills'),
      type: 'junction',
    });
  });

  test('isInside survives a separator mismatch and rejects a sibling prefix', () => {
    const root = temporaryRoot();
    expect(isInside(join(root, '.agents/skills/acli'), join(root, '.agents/skills'))).toBe(true);
    expect(isInside(join(root, '.agents/skills'), join(root, '.agents/skills'))).toBe(true);
    expect(isInside(join(root, '.agents/skills-extra/acli'), join(root, '.agents/skills'))).toBe(false);
  });

  test('creates the relative symlink and reports it valid on the second pass', () => {
    const root = repositoryFixture();
    expect(repairClaudeSkillsAlias(root, 'linux')).toMatchObject({ status: 'created', target: POSIX_CLAUDE_SKILLS_TARGET });
    expect(readlinkSync(join(root, '.claude/skills'))).toBe(POSIX_CLAUDE_SKILLS_TARGET);
    expect(readFileSync(join(root, '.claude/skills/project-context/SKILL.md'), 'utf8')).toContain('name: project-context');
    expect(repairClaudeSkillsAlias(root, 'linux').status).toBe('valid');
  });

  test('re-points a symlink aimed somewhere else', () => {
    const root = repositoryFixture();
    mkdirSync(join(root, 'elsewhere'), { recursive: true });
    symlinkSync('../elsewhere', join(root, '.claude/skills'), 'dir');

    expect(repairClaudeSkillsAlias(root, 'linux').status).toBe('repaired');
    expect(readlinkSync(join(root, '.claude/skills'))).toBe(POSIX_CLAUDE_SKILLS_TARGET);
  });

  test('refuses to replace a real Claude skills directory', () => {
    const root = repositoryFixture();
    write(root, '.claude/skills/owned.txt', 'preserve me\n');

    expect(() => repairClaudeSkillsAlias(root, 'linux')).toThrow('Refusing to replace');
    expect(readFileSync(join(root, '.claude/skills/owned.txt'), 'utf8')).toBe('preserve me\n');
  });

  test('reclaims the skills CLI per-skill symlink shim without losing a skill body', () => {
    // `bunx skills add` (project level) writes the body to .agents/skills/<slug>/ and then
    // creates .claude/skills/ as a REAL directory of per-skill symlinks. `bun run setup`
    // installs community skills BEFORE repairing compatibility, so this is what a clean
    // clone actually looks like at repair time. Refusing here aborted the install.
    const root = repositoryFixture();
    write(root, '.agents/skills/playwright-cli/SKILL.md', 'body\n');
    mkdirSync(join(root, '.claude/skills'), { recursive: true });
    symlinkSync('../../.agents/skills/playwright-cli', join(root, '.claude/skills/playwright-cli'), 'dir');
    write(root, '.claude/skills/.DS_Store', '');

    expect(repairClaudeSkillsAlias(root, 'linux')).toMatchObject({
      target: POSIX_CLAUDE_SKILLS_TARGET,
      status: 'repaired',
    });
    expect(readFileSync(join(root, '.agents/skills/playwright-cli/SKILL.md'), 'utf8')).toBe('body\n');
    expect(readFileSync(join(root, '.claude/skills/playwright-cli/SKILL.md'), 'utf8')).toBe('body\n');
    expect(repairClaudeSkillsAlias(root, 'linux').status).toBe('valid');
  });

  test('still refuses a shim directory that also holds real content', () => {
    const root = repositoryFixture();
    mkdirSync(join(root, '.agents/skills/playwright-cli'), { recursive: true });
    mkdirSync(join(root, '.claude/skills'), { recursive: true });
    symlinkSync('../../.agents/skills/playwright-cli', join(root, '.claude/skills/playwright-cli'), 'dir');
    write(root, '.claude/skills/hand-written.md', 'mine\n');

    expect(() => repairClaudeSkillsAlias(root, 'linux')).toThrow('Refusing to replace');
    expect(readFileSync(join(root, '.claude/skills/hand-written.md'), 'utf8')).toBe('mine\n');
  });

  test('refuses a symlink shim pointing outside the canonical skills store', () => {
    const root = repositoryFixture();
    mkdirSync(join(root, 'elsewhere/rogue'), { recursive: true });
    mkdirSync(join(root, '.claude/skills'), { recursive: true });
    symlinkSync('../../elsewhere/rogue', join(root, '.claude/skills/rogue'), 'dir');

    expect(() => repairClaudeSkillsAlias(root, 'linux')).toThrow('Refusing to replace');
  });
});

describe('command alias wrappers', () => {
  test('reports the missing manifest', () => {
    const root = temporaryRoot();
    expect(validateCommandAliases(root)).toEqual([`Command alias manifest missing: ${COMMAND_ALIAS_MANIFEST}`]);
  });

  test('generates one wrapper per host per alias, idempotently', () => {
    const root = repositoryFixture();
    expect(commandWrapperCounts(root)).toEqual({ expected: 3, claude: 3, opencode: 3 });
    expect(repairCommandWrappers(root)).toBe(0);
    expect(validateCommandAliases(root)).toEqual([]);

    const wrapper = readFileSync(join(root, '.opencode/commands/dev-roadmap.md'), 'utf8');
    expect(wrapper).toBe(readFileSync(join(root, '.claude/commands/dev-roadmap.md'), 'utf8'));
    expect(wrapper).toContain('Invoke skill `project-context` in mode `dev-roadmap`.');
    expect(wrapper).toContain('Forward `$ARGUMENTS` unchanged.');
  });

  test('distinguishes a stale wrapper from one that grew workflow prose', () => {
    const root = repositoryFixture();
    const stale = join(root, '.claude/commands/dev-roadmap.md');
    writeFileSync(stale, readFileSync(stale, 'utf8').replace('dev-roadmap`', 'roadmap`'));
    const prose = join(root, '.opencode/commands/sync-ai-memory.md');
    writeFileSync(prose, `${readFileSync(prose, 'utf8')}\n## Steps\n\n1. Read every doc.\n2. Patch drift.\n3. Report.\n`);

    const errors = validateCommandAliases(root);
    expect(errors).toContain('claude command wrapper is stale: .claude/commands/dev-roadmap.md');
    expect(errors).toContain('opencode command wrapper contains workflow prose: .opencode/commands/sync-ai-memory.md');
  });

  test('rejects an alias whose skill or mode does not exist', () => {
    const root = repositoryFixture();
    write(root, COMMAND_ALIAS_MANIFEST, manifest([
      ...ALIASES,
      { alias: 'business-api-map', skill: 'project-context', mode: 'api' },
      { alias: 'ghost', skill: 'nowhere', mode: 'x' },
      { alias: 'Bad Alias', skill: 'project-context', mode: 'data' },
    ]));

    const errors = validateCommandAliases(root);
    expect(errors).toContain('Command alias target mode missing: business-api-map -> project-context:api');
    expect(errors).toContain('Command alias target skill missing: ghost -> nowhere');
    expect(errors).toContain('Invalid command alias: Bad Alias');
  });
});

describe('checkAgentCompatibility', () => {
  test('passes on a repository with alias, wrappers, adapters and parity in place', () => {
    const root = repositoryFixture();
    repairClaudeSkillsAlias(root, 'linux');

    expect(checkAgentCompatibility(root, 'linux')).toMatchObject({ ok: true, errors: [], alias: { status: 'valid' } });
  });

  test('reports the missing alias together with every contract error', () => {
    const root = repositoryFixture();
    rmSync(join(root, '.codex/hooks.json'));

    const result = checkAgentCompatibility(root, 'linux');
    expect(result.ok).toBe(false);
    expect(result.alias.status).toBe('missing');
    expect(result.errors).toContain('Hook compatibility file missing: .codex/hooks.json');
    expect(result.errors).toContain('Claude skills alias missing: .claude/skills');
  });

  test('flags a real directory sitting where the alias should be', () => {
    const root = repositoryFixture();
    write(root, '.claude/skills/owned.txt', 'mine\n');

    const result = checkAgentCompatibility(root, 'linux');
    expect(result.alias.status).toBe('invalid');
    expect(result.errors).toContain('Refusing compatibility state: .claude/skills exists but is not a generated symlink or junction.');
  });
});
