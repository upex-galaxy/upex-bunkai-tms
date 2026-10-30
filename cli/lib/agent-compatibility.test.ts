/* eslint-disable no-template-curly-in-string -- the fixtures below mirror .mcp.json verbatim, `${VAR}` included */
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { IDENTITY_PREFIX, ORCA_CONTEXT_LINE, ORCA_LAUNCHED_LINE, PERSONALITY_CONTRACT, ROUTE_PREFIX, routeStatePath } from '../../.agents/hooks/personality-reinject.mjs';
import {
  CLAUDE_HOOK_COMMAND,
  CODEX_HOOK_COMMAND,
  CODEX_HOOK_COMMAND_WINDOWS,
  CODEX_PROJECT_DOC_MAX_BYTES,
  CODEX_STARTUP_TIMEOUT_SEC,
  declaredMcpIds,
  DOC_CONTRACTS_HOOK,
  EXPECTED_MCP,
  HOOK_GROUP_FIX,
  HOOK_ORCA_MARKER,
  KNOWN_MCP_IDS,
  LEGACY_CODEX_ENV_LOADER_ARGS,
  MCP_ENV_LOADER_COMMAND,
  MCP_ENV_LOADER_HEAD,
  mcpEnvLoaderArgs,
  REARM_SESSION_START_SOURCES,
  stripJsonComments,
  unwrapEnvLoader,
  validateDocContractHooks,
  validateEslintBlockWiring,
  validateHookCompatibility,
  validateInstructionRouterHooks,
  validateMcpParity,
  validateMcpParityFindings,
  validateOpenCodePluginEntrypoints,
} from './agent-compatibility-contracts.ts';
import {
  ADOPT_INSTRUCTIONS_PENDING_FILE,
  checkAgentCompatibility,
  CLAUDE_INSTRUCTIONS_SHIM,
  claudeSkillsAliasPlan,
  commandsShadowingSkills,
  COMPATIBILITY_GROUP_LABEL,
  COMPATIBILITY_GROUP_ORDER,
  describeAliasStatus,
  groupCompatibilityErrors,
  isInside,
  POSIX_CLAUDE_SKILLS_TARGET,
  removeShadowingCommands,
  repairAgentSurfaces,
  repairClaudeSkillsAlias,
  SHADOWING_COMMANDS_BACKUP_DIR,
  SKILLS_ALIAS_DEFERRED_MARKER,
  SKILLS_ALIAS_MISSING_ERROR,
  validateCanonicalSources,
} from './agent-compatibility.ts';
import { ADOPT_INSTRUCTIONS_PROMPT } from './updater-adopt.ts';

const REPO_ROOT = resolve(import.meta.dir, '..', '..');
const temporaryRoots: string[] = [];

/**
 * The OpenCode adapter, imported only where it exists: a project on another
 * harness deletes it (ADR-0013), and a static import would fail `types:check`
 * there on every commit. The tests that read it skip without it.
 */
const OPENCODE_PLUGIN = '.opencode/plugins/personality-reinject.js';
const HAS_OPENCODE = existsSync(join(REPO_ROOT, OPENCODE_PLUGIN));
// eslint-disable-next-line ts/no-explicit-any -- a plain-JS adapter with no type declarations
const opencodePlugin: any = HAS_OPENCODE ? (await import(join(REPO_ROOT, OPENCODE_PLUGIN))).default : null;

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
// Inline fixtures: the servers this repo ships, plus `tavily` (upstream moved
// it to harness level; a downstream project may keep it) and `playwright` (a
// downstream server the contract does not know), spelled per host. Written
// here rather than copied so the tests describe the contract on their own,
// whatever the real repo looks like at the moment they run. Each host file is
// composed from the ids a test declares, so one fixture describes both this
// boilerplate and a downstream project with a different server set.
// ---------------------------------------------------------------------------

/** The set this boilerplate ships (and the strict per-host shapes cover). */
const BOILERPLATE_IDS = ['context7', 'supabase', 'n8n'];
/** A downstream set: no `n8n`, keeps `tavily`, plus a server the contract has no shape for. */
const PROJECT_IDS = ['context7', 'tavily', 'supabase', 'playwright'];

/** Each stdio server that needs `.env` values starts through the `.env` loader (MCP_ENV_LOADER_*). */
const SUPABASE_VARS = ['SUPABASE_ACCESS_TOKEN'];
const N8N_VARS = ['N8N_API_URL', 'N8N_API_KEY'];
function loader(names: string[]): string[] {
  return mcpEnvLoaderArgs(names);
}
/** A host array literal (JSONC / TOML) for the loader args. */
function loaderLiteral(names: string[]): string {
  return loader(names).map(arg => JSON.stringify(arg)).join(', ');
}

const MCP_SERVERS: Record<string, unknown> = {
  context7: { command: 'bunx', args: ['-y', '@upstash/context7-mcp'] },
  tavily: {
    command: 'bunx',
    args: ['-y', 'mcp-remote', 'https://mcp.tavily.com/mcp/?tavilyApiKey=${TAVILY_API_KEY}'],
  },
  supabase: {
    command: 'bunx',
    args: [...loader(SUPABASE_VARS), 'bunx', '-y', '@supabase/mcp-server-supabase@latest'],
  },
  n8n: {
    command: 'bunx',
    args: [...loader(N8N_VARS), 'npx', '-y', 'n8n-mcp'],
    env: {
      MCP_MODE: 'stdio',
      LOG_LEVEL: 'error',
      DISABLE_CONSOLE_OUTPUT: 'true',
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
        ${loaderLiteral(SUPABASE_VARS)},
        "bunx",
        "-y",
        "@supabase/mcp-server-supabase@latest",
      ],
      "enabled": true,
    },`,
  n8n: `    "n8n": {
      "type": "local",
      "command": ["bunx", ${loaderLiteral(N8N_VARS)}, "npx", "-y", "n8n-mcp"],
      "enabled": true,
      "environment": {
        "MCP_MODE": "stdio",
        "LOG_LEVEL": "error",
        "DISABLE_CONSOLE_OUTPUT": "true",
      },
    },`,
  playwright: `    "playwright": {
      "type": "local",
      "command": ["bunx", "@playwright/mcp@latest", "--extension"],
      "enabled": true,
    },`,
};

/**
 * A Codex stdio launch: through the filtered `.env` loader (the boilerplate
 * shape, `names` in its filter) or the bare command forwarding `names` through
 * `env_vars` (a project scaffolded before the loader existed). The startup
 * budget is there either way, so a test that drops the loader changes nothing
 * else. A server with no `names` never takes the loader.
 */
function codexLaunch(command: string, args: string, names: string[], useLoader: boolean): string {
  const head = `enabled = true\nstartup_timeout_sec = ${CODEX_STARTUP_TIMEOUT_SEC}`;
  if (names.length === 0) { return `command = "${command}"\n${head}\nargs = [${args}]`; }
  return useLoader
    ? `command = "${MCP_ENV_LOADER_COMMAND}"\n${head}\nargs = [${loaderLiteral(names)}, "${command}", ${args}]`
    : `command = "${command}"\n${head}\nargs = [${args}]\nenv_vars = ${JSON.stringify(names)}`;
}

function codexServers(useLoader: boolean): Record<string, string> {
  return {
    context7: `[mcp_servers.context7]
${codexLaunch('bunx', '"-y", "@upstash/context7-mcp"', [], useLoader)}
`,
    tavily: `[mcp_servers.tavily]
url = "https://mcp.tavily.com/mcp/"
bearer_token_env_var = "TAVILY_API_KEY"
enabled = true
`,
    supabase: `[mcp_servers.supabase]
${codexLaunch('bunx', '"-y", "@supabase/mcp-server-supabase@latest"', SUPABASE_VARS, useLoader)}
`,
    n8n: `[mcp_servers.n8n]
${codexLaunch('npx', '"-y", "n8n-mcp"', N8N_VARS, useLoader)}

[mcp_servers.n8n.env]
MCP_MODE = "stdio"
LOG_LEVEL = "error"
DISABLE_CONSOLE_OUTPUT = "true"
`,
    // Unknown to the contract and needs nothing from .env: no loader required.
    playwright: `[mcp_servers.playwright]
command = "bunx"
enabled = true
args = ["@playwright/mcp@latest", "--extension"]
`,
  };
}

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

function codexToml(ids: string[], loader = true): string {
  const servers = codexServers(loader);
  return `[shell_environment_policy]
inherit = "core"

${ids.map(id => servers[id]).join('\n')}`;
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
  if (HAS_OPENCODE) { copyFromRepo(root, OPENCODE_PLUGIN); }
  write(root, '.claude/settings.json', hookSettings(CLAUDE_HOOK_COMMAND));
  write(root, '.codex/hooks.json', hookSettings(CODEX_HOOK_COMMAND, CODEX_HOOK_COMMAND_WINDOWS));
  write(root, '.mcp.json', mcpJson(ids));
  write(root, 'opencode.jsonc', opencodeJsonc(ids));
  write(root, '.codex/config.toml', codexToml(ids));
  return root;
}

const SKILLS = ['project-context', 'jira-administration'];

/** Everything `checkAgentCompatibility` wants, except the alias itself. */
function repositoryFixture(): string {
  const root = contractFixture();
  write(root, 'AGENTS.md', '# AI memory\n');
  write(root, 'CLAUDE.md', CLAUDE_INSTRUCTIONS_SHIM);
  for (const skill of SKILLS) {
    write(root, `.agents/skills/${skill}/SKILL.md`, `---\nname: ${skill}\n---\n`);
  }
  return root;
}

describe('shared personality hook', () => {
  test('emits the contract plus the identity line and exits successfully', () => {
    // A sandbox primary checkout with a `.env`, and an environment REPLACED
    // rather than inherited: the suite itself runs inside a harness whose
    // CLAUDE_* variables would otherwise turn the output into hook JSON.
    const checkout = temporaryRoot('agent compatibility hook checkout ');
    mkdirSync(join(checkout, '.git'));
    write(checkout, '.env', '');
    const result = Bun.spawnSync({
      cmd: [Bun.which('node') ?? 'node', join(REPO_ROOT, '.agents/hooks/personality-reinject.mjs')],
      cwd: checkout,
      env: { PATH: join(checkout, 'bin'), HOME: checkout },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toBe(`${PERSONALITY_CONTRACT}\n${IDENTITY_PREFIX} worktree=primary session=unknown harness=unknown\n`);
    expect(result.stderr.toString()).toBe('');
  });

  test('names AGENTS.md as canonical, never CLAUDE.md', () => {
    expect(PERSONALITY_CONTRACT).toContain('AGENTS.md §2');
    expect(PERSONALITY_CONTRACT).not.toContain('CLAUDE.md');
  });

  test.skipIf(!HAS_OPENCODE)('OpenCode 1 (server entrypoint) mutates the system array in place with the same payload', async () => {
    const plugin = await opencodePlugin.server();
    const transform = plugin['experimental.chat.system.transform'];
    const output = { system: ['base system'] };
    const originalArray = output.system;

    await transform({ sessionID: 'test', model: {} }, output);
    const afterFirst = output.system.length;
    await transform({ sessionID: 'test', model: {} }, output);

    expect(output.system).toBe(originalArray);
    expect(output.system.length).toBe(afterFirst);
    expect(output.system[0]).toBe('base system');
    expect(output.system[1]).toBe(PERSONALITY_CONTRACT);
    // The label degrades to the raw id: OpenCode exposes no session name.
    expect(output.system[2]).toStartWith(IDENTITY_PREFIX);
    expect(output.system[2]).toEndWith('session=test harness=opencode');
  });

  test.skipIf(!HAS_OPENCODE)('OpenCode 2 (setup entrypoint) registers a context hook that pushes the text parts once', async () => {
    const hooks: Record<string, (event: { sessionID: string, system: Array<{ type: string, text: string }> }) => void> = {};
    await opencodePlugin.setup({
      session: { hook: async (name: string, callback: (typeof hooks)[string]) => { hooks[name] = callback; } },
    });
    const event = { sessionID: 'test', system: [{ type: 'text', text: 'base system' }] };
    const originalArray = event.system;

    hooks.context(event);
    const afterFirst = event.system.length;
    hooks.context(event);

    expect(opencodePlugin.id).toBe('agentic-dev.personality-reinject');
    expect(Object.keys(hooks)).toEqual(['context']);
    expect(event.system).toBe(originalArray);
    expect(event.system.length).toBe(afterFirst);
    expect(event.system[1]).toEqual({ type: 'text', text: PERSONALITY_CONTRACT });
    expect(event.system[2].text).toEndWith('session=test harness=opencode');
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
    expect(result.stdout.toString()).toContain(PERSONALITY_CONTRACT);
  });

  test('renders a Windows command with Git-root and Join-Path resolution', () => {
    expect(CODEX_HOOK_COMMAND_WINDOWS).toContain('git rev-parse --show-toplevel');
    expect(CODEX_HOOK_COMMAND_WINDOWS).toContain('Join-Path $root \'.agents/hooks/personality-reinject.mjs\'');
    expect(CODEX_HOOK_COMMAND_WINDOWS).not.toContain('/Users/');
  });
});

describe.skipIf(!HAS_OPENCODE)('hook adapters', () => {
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

  test('rejects a V1-only OpenCode adapter: OpenCode 2 refuses to load it', () => {
    const root = contractFixture();
    write(root, '.opencode/plugins/personality-reinject.js', [
      'import { PERSONALITY_CONTRACT } from \'../../.agents/hooks/personality-reinject.mjs\';',
      'export const PersonalityReinject = async () => ({',
      '  \'experimental.chat.system.transform\': async (_input, output) => {',
      '    output.system.push(PERSONALITY_CONTRACT);',
      '  },',
      '});',
      '',
    ].join('\n'));

    const errors = validateHookCompatibility(root);
    expect(errors.some(e => e.includes('must default-export one plugin definition'))).toBe(true);
    expect(errors.some(e => e.includes('OpenCode 2 entrypoint'))).toBe(true);
  });

  test('rejects an OpenCode adapter that dropped the V1 entrypoint', () => {
    const root = contractFixture();
    write(root, '.opencode/plugins/personality-reinject.js', [
      'import { agentContextLines } from \'../../.agents/hooks/personality-reinject.mjs\';',
      'export default {',
      '  id: \'agentic-dev.personality-reinject\',',
      '  async setup(ctx) {',
      '    await ctx.session.hook(\'context\', (event) => {',
      '      for (const text of agentContextLines()) { event.system.push({ type: \'text\', text }); }',
      '    });',
      '  },',
      '};',
      '',
    ].join('\n'));

    expect(validateHookCompatibility(root)).toEqual(['OpenCode personality adapter must keep the OpenCode 1 entrypoint: server() returning experimental.chat.system.transform.']);
  });

  test('rejects an OpenCode adapter that reassigns event.system', () => {
    const root = contractFixture();
    const plugin = readFileSync(join(REPO_ROOT, '.opencode/plugins/personality-reinject.js'), 'utf8')
      .replace('event.system.push({ type: \'text\', text });', 'event.system = [...event.system, { type: \'text\', text }];');
    write(root, '.opencode/plugins/personality-reinject.js', plugin);

    expect(validateHookCompatibility(root)).toEqual(['OpenCode personality adapter must mutate event.system in place.']);
  });

  test('rejects an OpenCode adapter that pushes the contract alone, without the identity line', () => {
    const root = contractFixture();
    const plugin = readFileSync(join(REPO_ROOT, '.opencode/plugins/personality-reinject.js'), 'utf8')
      .replaceAll('agentContextLines', 'contractOnlyLines');
    write(root, '.opencode/plugins/personality-reinject.js', plugin);

    expect(validateHookCompatibility(root)).toEqual(['OpenCode personality adapter must push the shared context lines (agentContextLines), identity line included.']);
  });

  test('rejects an emitter that lost the identity resolver', () => {
    const root = contractFixture();
    const emitter = readFileSync(join(REPO_ROOT, '.agents/hooks/personality-reinject.mjs'), 'utf8')
      .replace('export function resolveAgentIdentity', 'function resolveAgentIdentity');
    write(root, '.agents/hooks/personality-reinject.mjs', emitter);

    expect(validateHookCompatibility(root)).toEqual(['Shared hook emitter must export resolveAgentIdentity(): the identity line has one source.']);
  });

  test('accepts the shipped dual-entrypoint OpenCode adapter', () => {
    expect(validateOpenCodePluginEntrypoints(readFileSync(join(REPO_ROOT, '.opencode/plugins/personality-reinject.js'), 'utf8'))).toEqual([]);
  });
});

describe.skipIf(!HAS_OPENCODE)('instruction router hooks', () => {
  const ROUTER_L0 = '# L0\n<!-- router:start -->\n| Kind | Load | Also |\n|---|---|---|\n| git | `.agents/instructions/agent-git.md` | - |\n<!-- router:end -->\n';

  function rearmSettings(command: string, windows?: string, sources: readonly string[] = REARM_SESSION_START_SOURCES): string {
    const hook: Record<string, unknown> = { type: 'command', command, timeout: 5 };
    if (windows) { hook.commandWindows = windows; }
    const sessionStart = sources.map(matcher => ({ matcher, hooks: [hook] }));
    return `${JSON.stringify({ hooks: { UserPromptSubmit: [{ hooks: [hook] }], PostToolUse: [{ hooks: [hook] }], SessionStart: sessionStart } }, null, 2)}\n`;
  }

  function routerFixture(): string {
    const root = contractFixture('agent compatibility router ');
    write(root, 'AGENTS.md', ROUTER_L0);
    write(root, '.claude/settings.json', rearmSettings(CLAUDE_HOOK_COMMAND));
    write(root, '.codex/hooks.json', rearmSettings(CODEX_HOOK_COMMAND, CODEX_HOOK_COMMAND_WINDOWS));
    return root;
  }

  test('the real repository routes on every host it can', () => {
    expect(validateInstructionRouterHooks(REPO_ROOT)).toEqual([]);
  });

  test('binds only once AGENTS.md carries the router', () => {
    const root = contractFixture();
    expect(validateInstructionRouterHooks(root)).toEqual([]);
    write(root, 'AGENTS.md', '# single-file layout\n');
    expect(validateInstructionRouterHooks(root)).toEqual([]);
    write(root, 'AGENTS.md', ROUTER_L0);
    const errors = validateInstructionRouterHooks(root);
    for (const source of REARM_SESSION_START_SOURCES) {
      expect(errors.some(e => e.startsWith(`claude must re-arm the routes on SessionStart "${source}"`))).toBe(true);
      expect(errors.some(e => e.startsWith(`codex must re-arm the routes on SessionStart "${source}"`))).toBe(true);
    }
    expect(validateHookCompatibility(root)).toEqual(errors);
  });

  test('accepts a compact and a clear SessionStart on both command hosts', () => {
    expect(validateInstructionRouterHooks(routerFixture())).toEqual([]);
  });

  test('rejects a host that re-arms on compaction but not on /clear', () => {
    const root = routerFixture();
    write(root, '.claude/settings.json', rearmSettings(CLAUDE_HOOK_COMMAND, undefined, ['compact']));
    expect(validateInstructionRouterHooks(root)).toEqual([
      `claude must re-arm the routes on SessionStart "clear": a SessionStart group with matcher "clear" running ${CLAUDE_HOOK_COMMAND}. Fix: ${HOOK_GROUP_FIX}`,
    ]);
  });

  test('rejects a Claude Code config that does not re-surface unread routes after a tool call', () => {
    const root = routerFixture();
    const settings = JSON.parse(rearmSettings(CLAUDE_HOOK_COMMAND));
    delete settings.hooks.PostToolUse;
    write(root, '.claude/settings.json', `${JSON.stringify(settings)}\n`);
    expect(validateInstructionRouterHooks(root)).toEqual([
      `claude must re-surface unread routes: a PostToolUse group with no matcher running ${CLAUDE_HOOK_COMMAND}. Fix: ${HOOK_GROUP_FIX}`,
    ]);
  });

  test('names the fix downstream only: the boilerplate itself has no upstream to merge from', () => {
    const root = routerFixture();
    const settings = JSON.parse(rearmSettings(CLAUDE_HOOK_COMMAND));
    delete settings.hooks.PostToolUse;
    write(root, '.claude/settings.json', `${JSON.stringify(settings)}\n`);
    write(root, 'package.json', JSON.stringify({ name: 'agentic-dev-boilerplate' }));
    expect(validateInstructionRouterHooks(root)).toEqual([
      `claude must re-surface unread routes: a PostToolUse group with no matcher running ${CLAUDE_HOOK_COMMAND}`,
    ]);
  });

  test('rejects an OpenCode adapter that stopped classifying the prompt or declaring OpenCode 2', () => {
    const root = routerFixture();
    const plugin = readFileSync(join(REPO_ROOT, '.opencode/plugins/personality-reinject.js'), 'utf8')
      .replace('\'chat.message\'', '\'chat.params\'')
      .replaceAll('ROUTER-ONLY', 'router only');
    write(root, '.opencode/plugins/personality-reinject.js', plugin);
    expect(validateInstructionRouterHooks(root)).toEqual([
      'OpenCode personality adapter must classify the prompt in chat.message with the shared routeLines (OpenCode 1).',
      'OpenCode personality adapter must declare the OpenCode 2 degradation (ROUTER-ONLY: no hook carries the prompt).',
    ]);
  });

  test('rejects an emitter that lost the classifier', () => {
    const root = routerFixture();
    const emitter = readFileSync(join(REPO_ROOT, '.agents/hooks/personality-reinject.mjs'), 'utf8')
      .replace('export function routeLines', 'function routeLines');
    write(root, '.agents/hooks/personality-reinject.mjs', emitter);
    expect(validateInstructionRouterHooks(root)).toEqual(['Shared hook emitter must export routeLines(): the ROUTE: lines have one classifier.']);
  });

  test('rejects an always-on file Codex would cut, except an adopted app\'s composed one', () => {
    const root = routerFixture();
    write(root, 'AGENTS.md', `${ROUTER_L0}${'x'.repeat(CODEX_PROJECT_DOC_MAX_BYTES)}\n`);
    expect(validateInstructionRouterHooks(root)[0]).toContain(`Codex cuts the always-on file at ${CODEX_PROJECT_DOC_MAX_BYTES} bytes`);
    write(root, 'AGENTS.md', `## 0. Project instructions (pre-adoption)\n${ROUTER_L0}${'x'.repeat(CODEX_PROJECT_DOC_MAX_BYTES)}\n`);
    expect(validateInstructionRouterHooks(root)).toEqual([]);
  });

  test('OpenCode 1 classifies in chat.message, routes through the system transform once, re-arms on compaction', async () => {
    const sessionID = `compat-route-${process.pid}-${Date.now()}`;
    const plugin = await opencodePlugin.server({ worktree: REPO_ROOT });
    const turn = async (text: string) => {
      await plugin['chat.message']({ sessionID }, { message: {}, parts: [{ type: 'text', text }] });
      const output = { system: [] as string[] };
      await plugin['experimental.chat.system.transform']({ sessionID, model: {} }, output);
      return output.system.filter(line => line.startsWith(ROUTE_PREFIX));
    };
    try {
      const gitRoute = expect.stringMatching(/^ROUTE: read \.agents\/instructions\/agent-git\.md \(git, \d+ lines\) before acting on this prompt$/);
      expect(await turn('commit and push')).toEqual([gitRoute]);
      expect(await turn('push again')).toEqual([]);
      await plugin['experimental.session.compacting']({ sessionID });
      expect(await turn('push again')).toEqual([gitRoute]);
    }
    finally {
      rmSync(routeStatePath(REPO_ROOT, sessionID), { force: true });
    }
  });

  // OpenCode 1 used to classify the routes in chat.message but never record the
  // role, so a launched OpenCode worker always got the independent ORCA line.
  test('OpenCode 1 records the fleet token in chat.message and pushes the launched ORCA line, also after compaction', async () => {
    const sessionID = `compat-role-${process.pid}-${Date.now()}`;
    const independentID = `${sessionID}-independent`;
    const previous = process.env.ORCA_APP_VERSION;
    process.env.ORCA_APP_VERSION = 'test';
    const plugin = await opencodePlugin.server({ worktree: REPO_ROOT });
    const orcaFor = async (id: string, text: string) => {
      await plugin['chat.message']({ sessionID: id }, { message: {}, parts: [{ type: 'text', text }] });
      const output = { system: [] as string[] };
      await plugin['experimental.chat.system.transform']({ sessionID: id, model: {} }, output);
      return output.system.filter(line => line.startsWith(HOOK_ORCA_MARKER));
    };
    try {
      expect(await orcaFor(sessionID, '/sprint-development TK-123 fleet worker. Read the brief.')).toEqual([ORCA_LAUNCHED_LINE]);
      expect(await orcaFor(sessionID, 'continue with stage 2')).toEqual([ORCA_LAUNCHED_LINE]);
      await plugin['experimental.session.compacting']({ sessionID });
      expect(await orcaFor(sessionID, 'continue')).toEqual([ORCA_LAUNCHED_LINE]);
      expect(await orcaFor(independentID, 'plan the sprint fleet')).toEqual([ORCA_CONTEXT_LINE]);
    }
    finally {
      if (previous === undefined) { delete process.env.ORCA_APP_VERSION; }
      else { process.env.ORCA_APP_VERSION = previous; }
      rmSync(routeStatePath(REPO_ROOT, sessionID), { force: true });
      rmSync(routeStatePath(REPO_ROOT, independentID), { force: true });
    }
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
    // Asserts the DECLARED set, never the literal boilerplate four: a downstream
    // project with six servers (or three) must pass this test unchanged.
    const declared = declaredMcpIds(REPO_ROOT);
    expect(declared.length).toBeGreaterThan(0);
    expect(declared).toEqual([...declared].sort());
    expect(validateMcpParity(REPO_ROOT)).toEqual([]);
  });

  test('strips comments without touching string contents', () => {
    expect(JSON.parse(stripJsonComments('{ // c\n "a": "http://x/*y*/" /* b */ }'))).toEqual({ a: 'http://x/*y*/' });
  });

  test('a loader filter is a dependency like any host reference', () => {
    // The Codex supabase reads SUPABASE_ACCESS_TOKEN through its --filter; a
    // different name there is a different dependency on that host.
    const root = contractFixture();
    expect(validateMcpParity(root)).toEqual([]);

    const config = readFileSync(join(root, '.codex/config.toml'), 'utf8')
      .replace('"--filter", "SUPABASE_ACCESS_TOKEN"', '"--filter", "SUPABASE_TOKEN"');
    writeFileSync(join(root, '.codex/config.toml'), config);

    const errors = validateMcpParity(root);
    expect(errors.some(error => error.includes('codex MCP supabase mismatch') && error.includes('SUPABASE_TOKEN'))).toBe(true);
    expect(errors.some(error => error.includes('MCP supabase env contract differs between claude and codex'))).toBe(true);
  });

  test('reports a project-kept server missing from one host', () => {
    const root = contractFixture(undefined, PROJECT_IDS);
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
    const root = contractFixture(undefined, PROJECT_IDS);
    const configPath = join(root, 'opencode.jsonc');
    const config = readFileSync(configPath, 'utf8').replace('{env:TAVILY_API_KEY}', '{env:TAVILY_TOKEN}');
    writeFileSync(configPath, config);

    // tavily has no pinned shape any more: the generic cross-host check catches it.
    expect(validateMcpParity(root).some(error => error.includes('MCP tavily env contract differs between claude and opencode') && error.includes('TAVILY_TOKEN'))).toBe(true);
  });

  test('reads a legacy OpenCode {file:dir/VAR} as the same dependency as {env:VAR}', () => {
    // The retired `harness:env` generator rewrote credentials to
    // `{file:.auth/opencode/<VAR>}` pointers, and a downstream config may still
    // carry them. Same .env dependency by a different route: parity holds.
    const root = contractFixture(undefined, PROJECT_IDS);
    const configPath = join(root, 'opencode.jsonc');
    writeFileSync(configPath, readFileSync(configPath, 'utf8')
      .replace('{env:TAVILY_API_KEY}', '{file:.auth/opencode/TAVILY_API_KEY}'));

    expect(validateMcpParity(root)).toEqual([]);
  });

  test('a renamed {file:dir/VAR} still fails parity, so the form is checked and not merely tolerated', () => {
    const root = contractFixture(undefined, PROJECT_IDS);
    const configPath = join(root, 'opencode.jsonc');
    writeFileSync(configPath, readFileSync(configPath, 'utf8')
      .replace('{env:TAVILY_API_KEY}', '{file:.auth/opencode/TAVILY_TOKEN}'));

    expect(validateMcpParity(root).some(error =>
      error.includes('MCP tavily env contract differs between claude and opencode') && error.includes('TAVILY_TOKEN'))).toBe(true);
  });

  test('a {file:} path whose final segment is NOT all-caps stays a literal', () => {
    // The guardrail on the pattern: `{file:certs/ca.pem}` is a file, not a
    // credential named after a variable. Widening the regex has to break this.
    const root = contractFixture();
    const configPath = join(root, 'opencode.jsonc');
    writeFileSync(configPath, readFileSync(configPath, 'utf8')
      .replace('"n8n-mcp"],', '"n8n-mcp", "{file:certs/ca.pem}"],'));

    const errors = validateMcpParity(root);
    expect(errors.some(error => error.includes('opencode MCP n8n mismatch'))).toBe(true);
    expect(errors.some(error => error.includes('certs/ca.pem'))).toBe(true);
    expect(errors.some(error => error.toLowerCase().includes('"pem"'))).toBe(false);
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
      .replace('"@supabase/mcp-server-supabase@latest"]', '"@supabase/mcp-server-supabase@latest", "--read-only"]'));

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

describe('MCP .env loader', () => {
  test('in the boilerplate, requires the loader on a stdio server that needs .env values, known or not', () => {
    const root = contractFixture(undefined, PROJECT_IDS);
    // An unknown server that needs a variable, on every host.
    const mcp = JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf8'));
    mcp.mcpServers.playwright.env = { PLAYWRIGHT_BROWSERS_PATH: '${PLAYWRIGHT_BROWSERS_PATH}' };
    write(root, '.mcp.json', JSON.stringify(mcp));
    write(root, 'opencode.jsonc', readFileSync(join(root, 'opencode.jsonc'), 'utf8')
      .replace('"command": ["bunx", "@playwright/mcp@latest", "--extension"],', '"command": ["bunx", "@playwright/mcp@latest", "--extension"],\n      "environment": { "PLAYWRIGHT_BROWSERS_PATH": "{env:PLAYWRIGHT_BROWSERS_PATH}" },'));
    write(root, '.codex/config.toml', `${codexToml(PROJECT_IDS, false)}env_vars = ["PLAYWRIGHT_BROWSERS_PATH"]\n`);

    const errors = validateMcpParity(root, { schemaOwner: true });
    for (const host of ['claude', 'opencode', 'codex']) {
      expect(errors.some(e => e.startsWith(`${host} MCP playwright must launch through the .env loader`))).toBe(true);
      // tavily (stdio through mcp-remote) needs its key the same way.
      expect(errors.some(e => e.startsWith(`${host} MCP tavily must launch through the .env loader`) || e.startsWith(`${host} MCP tavily `))).toBe(host !== 'codex');
    }
    expect(errors.some(e => e.startsWith('codex MCP supabase mismatch'))).toBe(true);
    // A server with nothing to load is left alone by the generic rule.
    expect(errors.some(e => e.includes('MCP context7 must launch'))).toBe(false);
    // The remote Codex server has no launch at all.
    expect(errors.some(e => e.startsWith('codex MCP tavily'))).toBe(false);
  });

  test('downstream, a missing loader is a warning that names the file and the exact launch', () => {
    const root = contractFixture();
    write(root, '.codex/config.toml', codexToml(BOILERPLATE_IDS, false));

    const { errors, warnings } = validateMcpParityFindings(root, { schemaOwner: false });
    expect(errors).toEqual([]);
    // A known server gets ONE launch warning, never a second one from the generic rule.
    const supabase = warnings.filter(w => w.startsWith('codex MCP supabase '));
    expect(supabase).toHaveLength(1);
    expect(supabase[0]).toStartWith(`codex MCP supabase launch is out of date in .codex/config.toml: launch it as \`${MCP_ENV_LOADER_COMMAND} ${mcpEnvLoaderArgs(SUPABASE_VARS).join(' ')}`);
    expect(supabase[0]).toContain('drop the host-side reference to SUPABASE_ACCESS_TOKEN');
    expect(warnings.filter(w => w.startsWith('codex MCP n8n '))).toHaveLength(1);
    // context7 needs no variable and its pinned shape has no loader: nothing to say.
    expect(warnings.some(w => w.startsWith('codex MCP context7'))).toBe(false);
    expect(warnings.some(w => w.includes('tavily'))).toBe(false);
  });

  test('downstream, the legacy unfiltered Codex loader is out of date too', () => {
    const root = contractFixture();
    const configPath = join(root, '.codex/config.toml');
    writeFileSync(configPath, readFileSync(configPath, 'utf8')
      .replace(`args = [${loaderLiteral(N8N_VARS)}, "npx"`, `args = [${LEGACY_CODEX_ENV_LOADER_ARGS.map(a => JSON.stringify(a)).join(', ')}, "npx"`)
      .replace('[mcp_servers.n8n.env]', `env_vars = ${JSON.stringify(N8N_VARS)}\n\n[mcp_servers.n8n.env]`));

    const { errors, warnings } = validateMcpParityFindings(root, { schemaOwner: false });
    expect(errors).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toStartWith('codex MCP n8n launch is out of date in .codex/config.toml: launch it as');
    expect(warnings[0]).toContain('--filter N8N_API_KEY,N8N_API_URL');
  });

  test('downstream, a loader on a server that needs no value is out of date', () => {
    const root = contractFixture();
    const configPath = join(root, '.codex/config.toml');
    writeFileSync(configPath, readFileSync(configPath, 'utf8')
      .replace('args = ["-y", "@upstash/context7-mcp"]', `args = [${LEGACY_CODEX_ENV_LOADER_ARGS.map(a => JSON.stringify(a)).join(', ')}, "bunx", "-y", "@upstash/context7-mcp"]`));

    const { errors, warnings } = validateMcpParityFindings(root, { schemaOwner: false });
    expect(errors).toEqual([]);
    expect(warnings).toEqual(['codex MCP context7 launch is out of date in .codex/config.toml: drop the .env loader: the server needs no .env value, and an unfiltered loader hands it every one. Upstream never overwrites this file, so change it by hand.']);
  });

  test('ownership comes from package.json: the boilerplate errors, any other name warns', () => {
    const root = contractFixture();
    write(root, '.codex/config.toml', codexToml(BOILERPLATE_IDS, false));

    expect(validateMcpParity(root)).toEqual([]);
    write(root, 'package.json', JSON.stringify({ name: 'my-product' }));
    expect(validateMcpParity(root)).toEqual([]);
    write(root, 'package.json', JSON.stringify({ name: 'agentic-dev-boilerplate' }));
    expect(validateMcpParity(root).some(e => e.includes('must launch through the .env loader') || e.startsWith('codex MCP supabase mismatch'))).toBe(true);
  });

  test('in the boilerplate, pins the Codex startup budget of a known server', () => {
    const root = contractFixture();
    const configPath = join(root, '.codex/config.toml');
    writeFileSync(configPath, readFileSync(configPath, 'utf8')
      .replace('[mcp_servers.n8n]\ncommand = "bunx"\nenabled = true\nstartup_timeout_sec = 30\n', '[mcp_servers.n8n]\ncommand = "bunx"\nenabled = true\n'));

    const errors = validateMcpParity(root, { schemaOwner: true });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toStartWith('codex MCP n8n mismatch: expected ');
    expect(errors[0]).toContain(`"startupTimeoutSec":${CODEX_STARTUP_TIMEOUT_SEC}`);
  });

  test('downstream, a missing Codex startup budget is a warning; any other shape difference still fails', () => {
    const root = contractFixture();
    const configPath = join(root, '.codex/config.toml');
    writeFileSync(configPath, readFileSync(configPath, 'utf8')
      .replace('[mcp_servers.n8n]\ncommand = "bunx"\nenabled = true\nstartup_timeout_sec = 30\n', '[mcp_servers.n8n]\ncommand = "bunx"\nenabled = true\n'));

    const budget = validateMcpParityFindings(root, { schemaOwner: false });
    expect(budget.errors).toEqual([]);
    expect(budget.warnings).toEqual([
      `codex MCP n8n launch is out of date in .codex/config.toml: set startup_timeout_sec = ${CODEX_STARTUP_TIMEOUT_SEC} (Codex's 10-second default is too short for a server fetched on a cold cache). Upstream never overwrites this file, so change it by hand.`,
    ]);

    writeFileSync(configPath, readFileSync(configPath, 'utf8').replace('"n8n-mcp"]', '"n8n-mcp", "--debug"]'));
    const shape = validateMcpParityFindings(root, { schemaOwner: false });
    expect(shape.warnings).toEqual([]);
    expect(shape.errors).toHaveLength(1);
    expect(shape.errors[0]).toStartWith('codex MCP n8n mismatch: expected ');
  });

  test('reads a loader-wrapped command as the server it starts, with its filter', () => {
    expect(unwrapEnvLoader('bunx', [...mcpEnvLoaderArgs(['A_X', 'B_Y']), 'npx', '-y', 'pkg'])).toEqual({ command: 'npx', args: ['-y', 'pkg'], envLoader: true, filter: ['A_X', 'B_Y'] });
    expect(unwrapEnvLoader('bunx', ['-y', 'pkg'])).toEqual({ command: 'bunx', args: ['-y', 'pkg'], envLoader: false, filter: null });
    // The unfiltered loader Codex used before: still a loader, no filter.
    expect(unwrapEnvLoader('bunx', [...LEGACY_CODEX_ENV_LOADER_ARGS, 'npx', '-y', 'pkg'])).toEqual({ command: 'npx', args: ['-y', 'pkg'], envLoader: true, filter: null });
    // A prefix with nothing after it is not a launch.
    expect(unwrapEnvLoader('bunx', mcpEnvLoaderArgs(['A_X'])).envLoader).toBe(false);
    expect(unwrapEnvLoader('bunx', [...LEGACY_CODEX_ENV_LOADER_ARGS]).envLoader).toBe(false);
  });

  test('a filter must list exact names: a glob cannot be compared across hosts', () => {
    expect(() => unwrapEnvLoader('bunx', [...mcpEnvLoaderArgs(['STRIPE_*']), 'bunx', 'pkg'])).toThrow('exact variable names');
  });

  test('pins the loader to the exact varlock version the repo installs', () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as { devDependencies: Record<string, string> };
    expect(MCP_ENV_LOADER_HEAD[1] as string).toBe(`varlock@${pkg.devDependencies.varlock}`);
    expect(LEGACY_CODEX_ENV_LOADER_ARGS[1] as string).toBe(`varlock@${pkg.devDependencies.varlock}`);
    expect(pkg.devDependencies.varlock).toMatch(/^\d+\.\d+\.\d+$/);
    // JSON-RPC on stdio: varlock must not redact (rewrite) the server's output.
    expect(MCP_ENV_LOADER_HEAD).toContain('--no-redact-stdout');
    // Least privilege: only the named variables, and no blob holding them all.
    expect(MCP_ENV_LOADER_HEAD.slice(-3)).toEqual(['--inject', 'vars', '--filter']);
  });

  test('a loader-launched server that also takes a variable from the host fails in the boilerplate, warns downstream', () => {
    const root = contractFixture();
    const configPath = join(root, '.mcp.json');
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    config.mcpServers.supabase.env = { SUPABASE_ACCESS_TOKEN: '${SUPABASE_ACCESS_TOKEN}' };
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

    const owner = validateMcpParity(root, { schemaOwner: true });
    expect(owner.some(e => e.startsWith('claude MCP supabase launches through the .env loader but also takes SUPABASE_ACCESS_TOKEN from the host'))).toBe(true);
    const downstream = validateMcpParityFindings(root, { schemaOwner: false });
    expect(downstream.errors).toEqual([]);
    expect(downstream.warnings.some(w => w.startsWith('claude MCP supabase launch is out of date in .mcp.json') && w.includes('drop the host-side reference to SUPABASE_ACCESS_TOKEN'))).toBe(true);
  });

  test('downstream, the pre-loader Supabase shape is one warning naming the exact launch', () => {
    const root = contractFixture();
    const configPath = join(root, '.mcp.json');
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    config.mcpServers.supabase = {
      command: 'bunx',
      args: ['-y', '@supabase/mcp-server-supabase@latest', '--access-token', '${SUPABASE_ACCESS_TOKEN}'],
    };
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

    // The old `--access-token` argument is a shape difference beyond the
    // launch detail, so it is a mismatch, never silently a warning.
    const { errors } = validateMcpParityFindings(root, { schemaOwner: false });
    expect(errors.some(e => e.startsWith('claude MCP supabase mismatch'))).toBe(true);
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
    // creates .claude/skills/ as a REAL directory of per-skill symlinks. `bun setup`
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

describe('commands shadowing a skill', () => {
  test('finds a command, on either host and in a subdirectory, whose name is a repo skill', () => {
    const root = repositoryFixture();
    write(root, '.claude/commands/project-context.md', '---\ndescription: mine\n---\n\nDo it my way.\n');
    write(root, '.opencode/commands/team/jira-administration.md', 'Do it my way.\n');
    write(root, '.claude/commands/deploy.md', 'A project command with its own name.\n');
    write(root, '.opencode/commands/.DS_Store', '');
    // A folder without SKILL.md is not a skill, so its name is free.
    mkdirSync(join(root, '.agents/skills/deploy'), { recursive: true });

    expect(commandsShadowingSkills(root)).toEqual([
      { path: '.claude/commands/project-context.md', skill: 'project-context' },
      { path: '.opencode/commands/team/jira-administration.md', skill: 'jira-administration' },
    ]);
    expect(checkAgentCompatibility(root, 'linux').errors).toContain(
      `Command shadows skill project-context: .claude/commands/project-context.md; a command with a skill's name hides the skill's instructions (\`bun run agents:compat\` moves it to ${SHADOWING_COMMANDS_BACKUP_DIR}/)`,
    );
  });

  test('moves each one to the backup dir with its path, and leaves every other command alone', () => {
    const root = repositoryFixture();
    write(root, '.claude/commands/project-context.md', 'Do it my way.\n');
    write(root, '.claude/commands/deploy.md', 'Mine.\n');

    expect(removeShadowingCommands(root)).toEqual(['.claude/commands/project-context.md']);
    expect(existsSync(join(root, '.claude/commands/project-context.md'))).toBe(false);
    expect(readFileSync(join(root, SHADOWING_COMMANDS_BACKUP_DIR, '.claude/commands/project-context.md'), 'utf8')).toBe('Do it my way.\n');
    expect(readFileSync(join(root, '.claude/commands/deploy.md'), 'utf8')).toBe('Mine.\n');
    expect(commandsShadowingSkills(root)).toEqual([]);
    expect(removeShadowingCommands(root)).toEqual([]);
  });

  test('without command directories there is nothing to report', () => {
    const root = repositoryFixture();
    expect(commandsShadowingSkills(root)).toEqual([]);
  });
});

describe.skipIf(!HAS_OPENCODE)('checkAgentCompatibility', () => {
  test('passes on a repository with alias, adapters and parity in place', () => {
    const root = repositoryFixture();
    repairClaudeSkillsAlias(root, 'linux');

    expect(checkAgentCompatibility(root, 'linux')).toMatchObject({ ok: true, errors: [], warnings: [], alias: { status: 'valid' } });
  });

  test('a downstream Codex launch gap passes with a warning; the boilerplate fails on the same file', () => {
    const root = repositoryFixture();
    repairClaudeSkillsAlias(root, 'linux');
    write(root, '.codex/config.toml', codexToml(BOILERPLATE_IDS, false));

    const downstream = checkAgentCompatibility(root, 'linux');
    expect(downstream.ok).toBe(true);
    expect(downstream.errors).toEqual([]);
    expect(downstream.warnings.length).toBeGreaterThan(0);
    expect(downstream.warnings.every(w => w.includes('.codex/config.toml'))).toBe(true);

    write(root, 'package.json', JSON.stringify({ name: 'agentic-dev-boilerplate' }));
    const owner = checkAgentCompatibility(root, 'linux');
    expect(owner.ok).toBe(false);
    expect(owner.warnings).toEqual([]);
    expect(owner.errors.some(e => e.includes('must launch through the .env loader'))).toBe(true);
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

describe('one-harness projects (ADR-0013)', () => {
  const OPENCODE_AND_CODEX = ['opencode.jsonc', OPENCODE_PLUGIN, '.codex/config.toml', '.codex/hooks.json'];

  test('a Claude-only project passes with one note per harness it dropped', () => {
    const root = repositoryFixture();
    repairClaudeSkillsAlias(root, 'linux');
    for (const file of OPENCODE_AND_CODEX) { rmSync(join(root, file), { force: true }); }

    const result = checkAgentCompatibility(root, 'linux');
    expect(result).toMatchObject({ ok: true, errors: [], harnesses: ['claude'], alias: { status: 'valid' } });
    expect(result.notes).toEqual(['opencode: none of its files present, skipped', 'codex: none of its files present, skipped']);
  });

  test('one file of a harness still in use is drift, not a choice', () => {
    const root = repositoryFixture();
    repairClaudeSkillsAlias(root, 'linux');
    rmSync(join(root, '.codex/config.toml'));

    expect(checkAgentCompatibility(root, 'linux').errors).toContain('MCP config missing for codex: .codex/config.toml (a harness in use; declare `harnesses:` in .agents/project.yaml to drop it)');
  });

  test.skipIf(!HAS_OPENCODE)('an OpenCode-only project needs no CLAUDE.md, no alias and no .mcp.json', () => {
    const root = repositoryFixture();
    for (const file of ['CLAUDE.md', '.mcp.json', '.claude/settings.json', '.codex/config.toml', '.codex/hooks.json']) { rmSync(join(root, file)); }
    write(root, '.agents/project.yaml', 'harnesses: [opencode]\n');

    expect(checkAgentCompatibility(root, 'linux')).toMatchObject({ ok: true, errors: [], harnesses: ['opencode'], alias: { status: 'not-used' } });
    expect(declaredMcpIds(root)).toEqual([...BOILERPLATE_IDS].sort());
  });

  test('the boilerplate keeps failing on a deleted adapter', () => {
    const root = repositoryFixture();
    repairClaudeSkillsAlias(root, 'linux');
    write(root, 'package.json', JSON.stringify({ name: 'agentic-dev-boilerplate' }));
    for (const file of OPENCODE_AND_CODEX) { rmSync(join(root, file), { force: true }); }

    const result = checkAgentCompatibility(root, 'linux');
    expect(result.ok).toBe(false);
    expect(result.harnesses).toEqual(['claude', 'opencode', 'codex']);
    expect(result.errors).toContain('Hook compatibility file missing: .codex/hooks.json');
    expect(result.errors).toContain('MCP config missing for codex: .codex/config.toml (the boilerplate checks all three harnesses)');
  });

  test('a two-harness project without Claude compares against the first declared harness', () => {
    const root = contractFixture();
    write(root, '.agents/project.yaml', 'harnesses: [codex, opencode]\n');
    rmSync(join(root, '.mcp.json'));
    write(root, 'opencode.jsonc', opencodeJsonc(BOILERPLATE_IDS.filter(id => id !== 'context7')));

    expect(validateMcpParity(root)).toEqual(['MCP context7 missing from opencode: declared in .codex/config.toml, absent from opencode.jsonc']);
  });
});

describe.skipIf(!HAS_OPENCODE)('repairAgentSurfaces', () => {
  test('creates the alias, moves a command that shadows a skill and passes the check', () => {
    const root = repositoryFixture();
    write(root, '.opencode/commands/project-context.md', 'Mine.\n');

    const repair = repairAgentSurfaces(root, {}, 'linux');
    expect(repair.aliasDeferred).toBe(false);
    expect(repair.alias?.status).toBe('created');
    expect(readlinkSync(join(root, '.claude/skills'))).toBe(POSIX_CLAUDE_SKILLS_TARGET);
    expect(repair.shadowingCommandsMoved).toEqual(['.opencode/commands/project-context.md']);
    expect(repair.check).toMatchObject({ ok: true, errors: [] });
  });

  test('with the migration just applied, the alias waits for the commit and the check does not count it', () => {
    const root = repositoryFixture();

    const repair = repairAgentSurfaces(root, { deferSkillsAlias: true }, 'linux');
    expect(repair.aliasDeferred).toBe(true);
    expect(repair.alias).toBeNull();
    expect(existsSync(join(root, '.claude/skills'))).toBe(false);
    expect(existsSync(join(root, SKILLS_ALIAS_DEFERRED_MARKER))).toBe(true);
    expect(repair.check).toMatchObject({ ok: true, errors: [], alias: { status: 'deferred' } });
    // The pre-commit gate runs the same check and must pass on the migration commit.
    expect(checkAgentCompatibility(root, 'linux')).toMatchObject({ ok: true, alias: { status: 'deferred' } });
    // Everything else is still enforced.
    rmSync(join(root, '.codex/hooks.json'));
    const broken = repairAgentSurfaces(root, { deferSkillsAlias: true }, 'linux');
    expect(broken.check.ok).toBe(false);
    expect(broken.check.errors).toEqual(['Hook compatibility file missing: .codex/hooks.json']);
    // And `bun run agents:compat` afterwards creates it as usual and ends the deferral.
    expect(repairAgentSurfaces(root, {}, 'linux').alias?.status).toBe('created');
    expect(existsSync(join(root, SKILLS_ALIAS_DEFERRED_MARKER))).toBe(false);
    // Without the marker, a missing alias is the error it always was.
    rmSync(join(root, '.claude/skills'));
    expect(checkAgentCompatibility(root, 'linux').errors).toContain(SKILLS_ALIAS_MISSING_ERROR);
  });
});

describe('eslint block wiring', () => {
  const BASE = `export const BASE_ESLINT_OPTIONS = { rules: {} };
export const CLI_IMPORT_CLOSURE = { files: ['cli/**/*.ts'], rules: {} };
export const SRC_IMPORT_ALIASES = { files: ['src/**/*.ts'], rules: {} };
`;

  test('the real repository wires every block it exports', () => {
    expect(validateEslintBlockWiring(REPO_ROOT)).toEqual([]);
  });

  // The failure this exists for: `eslint.config.base.js` is SYNCED and
  // `eslint.config.js` is never overwritten, so upstream can ship a rule that
  // lands on disk, exports cleanly and enforces nothing.
  test('an unwired block is an error naming it and the fix', () => {
    const root = contractFixture();
    write(root, 'eslint.config.base.js', BASE);
    write(root, 'eslint.config.js', 'import { BASE_ESLINT_OPTIONS, CLI_IMPORT_CLOSURE } from \'./eslint.config.base.js\';\nexport default antfu({ ...BASE_ESLINT_OPTIONS }, CLI_IMPORT_CLOSURE);\n');
    const errors = validateEslintBlockWiring(root);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('SRC_IMPORT_ALIASES');
    expect(errors[0]).toContain('enforces nothing');
  });

  test('a name mentioned only in a comment does NOT count as wiring', () => {
    const root = contractFixture();
    write(root, 'eslint.config.base.js', BASE);
    write(root, 'eslint.config.js', '/** Extra blocks go after `CLI_IMPORT_CLOSURE`. */\n// SRC_IMPORT_ALIASES lives in the base.\nexport default antfu({});\n');
    const errors = validateEslintBlockWiring(root);
    expect(errors).toHaveLength(2);
    expect(errors.join(' ')).toContain('CLI_IMPORT_CLOSURE');
    expect(errors.join(' ')).toContain('SRC_IMPORT_ALIASES');
  });

  test('a longer block name does not satisfy the shorter one it contains', () => {
    const root = contractFixture();
    write(root, 'eslint.config.base.js', 'export const CLI_IMPORT_CLOSURE = {};\nexport const CLI_IMPORT_CLOSURE_EXTRA = {};\n');
    write(root, 'eslint.config.js', 'import { CLI_IMPORT_CLOSURE_EXTRA } from \'./eslint.config.base.js\';\nexport default antfu({}, CLI_IMPORT_CLOSURE_EXTRA);\n');
    const errors = validateEslintBlockWiring(root);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('wire CLI_IMPORT_CLOSURE from');
  });

  test('BASE_ESLINT_OPTIONS is never demanded as a block', () => {
    const root = contractFixture();
    write(root, 'eslint.config.base.js', 'export const BASE_ESLINT_OPTIONS = { rules: {} };\n');
    write(root, 'eslint.config.js', 'export default antfu({});\n');
    expect(validateEslintBlockWiring(root)).toEqual([]);
  });

  test('a repo without the split config is not a finding', () => {
    expect(validateEslintBlockWiring(contractFixture())).toEqual([]);
  });

  // On an adopted app the root eslint.config.js is the app's: requiring it to
  // wire the tooling's blocks would force the app's lint to include the tooling.
  test('an adopted app is checked through eslint.config.tooling.mjs, never the app\'s own eslint.config.js', () => {
    const root = contractFixture();
    write(root, '.template/installer.lock.json', '{ "adopted": true }\n');
    write(root, 'eslint.config.base.js', BASE);
    write(root, 'eslint.config.js', 'export default [];\n');
    write(root, 'eslint.config.tooling.mjs', 'import { CLI_IMPORT_CLOSURE } from \'./eslint.config.base.js\';\nexport default antfu({}, CLI_IMPORT_CLOSURE);\n');
    const errors = validateEslintBlockWiring(root);
    expect(errors).toEqual([expect.stringMatching(/^eslint\.config\.tooling\.mjs does not wire SRC_IMPORT_ALIASES/)]);
    // Without the lock the same tree is greenfield: the root config is the consumer.
    rmSync(join(root, '.template'), { recursive: true });
    expect(validateEslintBlockWiring(root)).toHaveLength(2);
  });

  test('the real eslint.config.tooling.mjs wires every block the base exports', () => {
    const root = contractFixture();
    write(root, '.template/installer.lock.json', '{ "adopted": true }\n');
    write(root, 'eslint.config.base.js', readFileSync(join(REPO_ROOT, 'eslint.config.base.js'), 'utf8'));
    write(root, 'eslint.config.tooling.mjs', readFileSync(join(REPO_ROOT, 'eslint.config.tooling.mjs'), 'utf8'));
    expect(validateEslintBlockWiring(root)).toEqual([]);
  });

  test('the full compatibility check reports an unwired block in the lint group', () => {
    const root = contractFixture();
    write(root, 'eslint.config.base.js', BASE);
    write(root, 'eslint.config.js', 'export default antfu({});\n');
    const groups = groupCompatibilityErrors(checkAgentCompatibility(root).errors);
    expect(groups.find(g => g.group === 'lint')?.errors).toHaveLength(2);
  });
});

describe('compatibility report grouping', () => {
  // Live finding (Bunkai): with pre-existing MCP drift, `agents:compat:check`
  // printed a flat error list and the "alias deferred" message never appeared,
  // so "alias pending commit" and "real drift" were indistinguishable.
  test('errors bucket per surface in a fixed order, empty groups omitted', () => {
    const groups = groupCompatibilityErrors([
      'MCP n8n missing from codex: declared in .mcp.json, absent from .codex/config.toml',
      'Command shadows skill x: .claude/commands/x.md; a command with a skill\'s name hides the skill\'s instructions',
      'Claude skills alias missing: .claude/skills',
      'codex hook command must be exactly: node x',
      'CLAUDE.md must contain exactly `@AGENTS.md` followed by one newline.',
      'MCP tavily present in opencode only: declare it in .mcp.json or remove it from opencode.jsonc',
      'eslint.config.js does not wire CLI_IMPORT_CLOSURE from eslint.config.base.js: the rule ships but enforces nothing. Add it to the import and to the antfu(...) call.',
    ]);
    expect(groups.map(g => [g.group, g.errors.length])).toEqual([['instructions', 1], ['alias', 1], ['commands', 1], ['hooks', 1], ['mcp', 2], ['lint', 1]]);
    expect(groups.map(g => g.label)).toEqual(COMPATIBILITY_GROUP_ORDER.map(g => COMPATIBILITY_GROUP_LABEL[g]));
    expect(groupCompatibilityErrors([])).toEqual([]);
  });

  test('the alias line reads the same whatever the verdict, and says deferred when the marker is set', () => {
    const alias = { path: '/repo/.claude/skills', target: '../.agents/skills', type: 'symlink' as const };
    expect(describeAliasStatus({ ...alias, status: 'deferred' })).toContain('deferred until the migration commit');
    expect(describeAliasStatus({ ...alias, status: 'created' })).toBe('Claude skills alias created: /repo/.claude/skills -> ../.agents/skills (symlink)');
    expect(describeAliasStatus({ ...alias, status: 'valid' })).toContain('OK');
    expect(describeAliasStatus({ ...alias, status: 'missing' })).toContain('bun run agents:compat');
    expect(describeAliasStatus({ ...alias, status: 'invalid' })).toContain('not the generated symlink');
  });
});

describe.skipIf(!HAS_OPENCODE)('an adopted app whose instructions wait for their composition', () => {
  /** The --adopt --auto state: AGENTS.md absent, the app's own CLAUDE.md, the composed file saved, the alias deferred. */
  function pendingAdoption(): string {
    const root = contractFixture();
    write(root, 'CLAUDE.md', '# The app\'s own instructions\n');
    write(root, '.agents/skills/project-adoption/SKILL.md', '---\nname: project-adoption\n---\n');
    write(root, '.template/installer.lock.json', '{ "adopted": true }\n');
    write(root, ADOPT_INSTRUCTIONS_PENDING_FILE, '# AGENTS.md (composed)\n');
    write(root, SKILLS_ALIAS_DEFERRED_MARKER, 'now\n');
    return root;
  }

  test('a pending adoption step, not a broken contract: the adoption commit passes the gate', () => {
    const check = checkAgentCompatibility(pendingAdoption());
    expect(check.errors).toEqual([]);
    expect(check.ok).toBe(true);
    expect(check.alias.status).toBe('deferred');
    expect(check.warnings.some(w => w.startsWith('AGENTS.md pending'))).toBe(true);
  });

  test('without the saved composition, or on a greenfield repo, a missing AGENTS.md is still an error', () => {
    const noSaved = pendingAdoption();
    rmSync(join(noSaved, ADOPT_INSTRUCTIONS_PENDING_FILE));
    expect(checkAgentCompatibility(noSaved).errors).toContain('Canonical instructions missing: AGENTS.md');
    const greenfield = pendingAdoption();
    rmSync(join(greenfield, '.template/installer.lock.json'));
    expect(checkAgentCompatibility(greenfield).errors).toContain('Canonical instructions missing: AGENTS.md');
  });

  test('the pending path is the one the adopt hook saves', () => {
    expect(ADOPT_INSTRUCTIONS_PENDING_FILE).toBe(ADOPT_INSTRUCTIONS_PROMPT.replace(/\\/g, '/'));
  });
});

describe('documentation-contract hook (ADR-0017)', () => {
  test('the real repository registers it on both command hosts', () => {
    expect(validateDocContractHooks(REPO_ROOT)).toEqual([]);
  });

  test('binds only in the boilerplate itself', () => {
    const root = contractFixture();
    expect(validateDocContractHooks(root, ['claude', 'codex'], false)).toEqual([]);
    expect(validateDocContractHooks(root, ['claude', 'codex'], true)).toEqual([`Documentation-contract hook missing: ${DOC_CONTRACTS_HOOK}`]);
    copyFromRepo(root, DOC_CONTRACTS_HOOK);
    const errors = validateDocContractHooks(root, ['claude', 'codex'], true);
    expect(errors.some(e => e.startsWith('claude must register the documentation-contract hook'))).toBe(true);
    expect(errors.some(e => e.startsWith('codex must register the documentation-contract hook'))).toBe(true);
    expect(validateDocContractHooks(root, ['opencode'], true)).toEqual([]);
  });
});
