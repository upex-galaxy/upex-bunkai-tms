/**
 * @fileoverview Opens the page: an Orca browser tab bound to this checkout when the
 * run lives in an Orca terminal, the system browser everywhere else.
 *
 * Moved here from `scripts/docs-serve.ts` because `cli/` is import-closed and
 * cannot import from `scripts/`. The Orca branch follows the `mkd` skill
 * (`orca tab create --url <url> --worktree path:<checkout>`), and resolves the
 * binary the same way Orca's own CLI guide does.
 *
 * A launcher that "succeeds" without a display is silent, so the caller never
 * trusts the spawn: it waits for the page to connect (browser-sink `hasClient`)
 * and falls back to the terminal after 10 s (plan §5).
 *
 * Shared file: byte-identical in agentic-qa-boilerplate and agentic-dev-boilerplate.
 */

import { spawn } from 'node:child_process';

export interface OpenCommand {
  command: string
  args: string[]
  via: 'orca' | 'open' | 'start' | 'xdg-open'
}

type Env = Record<string, string | undefined>;

/** `ORCA_CLI_COMMAND` -> `orca-dev` (dev checkout) -> `orca-ide` (Linux outside a managed terminal) -> `orca`. */
export function orcaCommand(env: Env, platform: string): string[] {
  const override = env.ORCA_CLI_COMMAND?.trim();
  if (override) { return override.split(/\s+/); }
  if (env.ORCA_DEV_REPO_ROOT) { return ['orca-dev']; }
  if (platform === 'linux' && !env.ORCA_TERMINAL_HANDLE) { return ['orca-ide']; }
  return ['orca'];
}

/** Inside an Orca-managed terminal, Orca sets `ORCA_TERMINAL_HANDLE`. */
export function insideOrca(env: Env): boolean {
  return Boolean(env.ORCA_TERMINAL_HANDLE?.trim());
}

export function openCommand(url: string, opts: { platform: string, env: Env, checkout?: string }): OpenCommand {
  if (insideOrca(opts.env) && opts.checkout) {
    const [command, ...prefix] = orcaCommand(opts.env, opts.platform);
    return { command, args: [...prefix, 'tab', 'create', '--url', url, '--worktree', `path:${opts.checkout}`], via: 'orca' };
  }
  if (opts.platform === 'darwin') { return { command: 'open', args: [url], via: 'open' }; }
  // `start` is a cmd.exe builtin; the empty "" is the window title argument.
  if (opts.platform === 'win32') { return { command: 'cmd', args: ['/c', 'start', '', url], via: 'start' }; }
  return { command: 'xdg-open', args: [url], via: 'xdg-open' };
}

/**
 * Spawns the opener detached. Resolves false when the binary could not start
 * (missing opener); true only means "launched", never "a page is showing".
 */
export async function openBrowser(url: string, opts: { platform?: string, env?: Env, checkout?: string } = {}): Promise<boolean> {
  const cmd = openCommand(url, { platform: opts.platform ?? process.platform, env: opts.env ?? process.env, checkout: opts.checkout });
  return new Promise((resolve) => {
    try {
      const child = spawn(cmd.command, cmd.args, { detached: true, stdio: 'ignore' });
      child.once('error', () => resolve(false));
      child.once('spawn', () => { child.unref(); resolve(true); });
    }
    catch {
      resolve(false);
    }
  });
}
