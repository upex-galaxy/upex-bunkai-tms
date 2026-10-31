/**
 * Engram wiring in the installer: binary detection, `engram setup` per agent,
 * and the OFFER to install the Engram Claude Code plugin.
 *
 * Every binary is a fake: `find` and `run` are injected, so no test here ever
 * spawns `engram` or `claude`, and nothing is installed on the machine.
 */

import type { BinaryFinder, CommandRunner } from './install.ts';

import { describe, expect, test } from 'bun:test';

import {
  buildInitialState,
  detectEngram,
  ENGRAM_PLUGIN_COMMAND_LINE,
  engramSetupArgs,
  offerEngramClaudePlugin,
  runEngramSetup,
} from './install.ts';

interface Call { binary: string, args: string[] }

function fakeRunner(responses: Record<string, { ok: boolean, stdout?: string, stderr?: string }>): { run: CommandRunner, calls: Call[] } {
  const calls: Call[] = [];
  const run: CommandRunner = (binary, args) => {
    calls.push({ binary, args });
    const hit = responses[`${binary} ${args.join(' ')}`] ?? { ok: true };
    return { ok: hit.ok, stdout: hit.stdout ?? '', stderr: hit.stderr ?? '' };
  };
  return { run, calls };
}

const onPath = (...present: string[]): BinaryFinder => binary => (present.includes(binary) ? `/usr/local/bin/${binary}` : null);

describe('detectEngram', () => {
  test('skip flag wins before any probe', () => {
    const { run, calls } = fakeRunner({});
    expect(detectEngram({ skip: true, find: onPath('engram'), run })).toEqual({ found: false, status: 'skipped' });
    expect(calls).toEqual([]);
  });

  test('missing binary', () => {
    const { run } = fakeRunner({});
    expect(detectEngram({ skip: false, find: onPath(), run }).status).toBe('missing');
  });

  test('a release at or above the minimum is installed', () => {
    const { run } = fakeRunner({ 'engram version': { ok: true, stdout: 'engram 3.0.0\n' } });
    expect(detectEngram({ skip: false, find: onPath('engram'), run })).toEqual({
      found: true,
      version: '3.0.0',
      compatible: true,
      status: 'installed',
    });
  });

  test('an older release is incompatible', () => {
    const { run } = fakeRunner({ 'engram version': { ok: true, stdout: 'engram 2.9.4' } });
    const info = detectEngram({ skip: false, find: onPath('engram'), run });
    expect(info.status).toBe('incompatible');
    expect(info.version).toBe('2.9.4');
  });

  test('a `go install` dev build (no semver) and a failing `version` are incompatible', () => {
    const dev = fakeRunner({ 'engram version': { ok: true, stdout: 'engram dev' } });
    expect(detectEngram({ skip: false, find: onPath('engram'), run: dev.run }).status).toBe('incompatible');
    const broken = fakeRunner({ 'engram version': { ok: false, stderr: 'boom' } });
    expect(detectEngram({ skip: false, find: onPath('engram'), run: broken.run }).status).toBe('incompatible');
  });
});

describe('engram setup per agent', () => {
  test('slim protocol on Claude Code only', () => {
    expect(engramSetupArgs('claude-code')).toEqual(['setup', 'claude-code', '--protocol=slim']);
    expect(engramSetupArgs('opencode')).toEqual(['setup', 'opencode']);
    expect(engramSetupArgs('codex')).toEqual(['setup', 'codex']);
  });

  test('runs the engram binary, never gentle-ai, and surfaces the failure reason', () => {
    const ok = fakeRunner({});
    expect(runEngramSetup('codex', ok.run)).toEqual({ ok: true });
    expect(ok.calls).toEqual([{ binary: 'engram', args: ['setup', 'codex'] }]);

    const failed = fakeRunner({ 'engram setup opencode': { ok: false, stderr: 'no opencode config\n' } });
    expect(runEngramSetup('opencode', failed.run)).toEqual({ ok: false, reason: 'no opencode config' });
  });
});

describe('offerEngramClaudePlugin', () => {
  const never = async (): Promise<boolean> => {
    throw new Error('confirm must not be called');
  };

  test('no claude CLI: skipped without probing', async () => {
    const { run, calls } = fakeRunner({});
    const result = await offerEngramClaudePlugin({ nonInteractive: false, confirm: never, find: onPath(), run });
    expect(result.outcome).toBe('skipped-no-claude-cli');
    expect(calls).toEqual([]);
  });

  test('already installed: no prompt, no install', async () => {
    const { run, calls } = fakeRunner({ 'claude plugin list': { ok: true, stdout: '  ❯ engram@engram\n    Status: ✔ enabled\n' } });
    const result = await offerEngramClaudePlugin({ nonInteractive: false, confirm: never, find: onPath('claude'), run });
    expect(result.outcome).toBe('already-installed');
    expect(calls).toHaveLength(1);
  });

  test('non-interactive: never prompts, never installs', async () => {
    const { run, calls } = fakeRunner({ 'claude plugin list': { ok: true, stdout: '' } });
    const result = await offerEngramClaudePlugin({ nonInteractive: true, confirm: never, find: onPath('claude'), run });
    expect(result.outcome).toBe('skipped-non-interactive');
    expect(calls.map(c => c.args.join(' '))).toEqual(['plugin list']);
  });

  test('declined: nothing installed', async () => {
    const { run, calls } = fakeRunner({});
    const result = await offerEngramClaudePlugin({ nonInteractive: false, confirm: async () => false, find: onPath('claude'), run });
    expect(result.outcome).toBe('declined');
    expect(calls.map(c => c.args.join(' '))).toEqual(['plugin list']);
  });

  test('accepted: marketplace add then plugin install, in order', async () => {
    const { run, calls } = fakeRunner({});
    const result = await offerEngramClaudePlugin({ nonInteractive: false, confirm: async () => true, find: onPath('claude'), run });
    expect(result.outcome).toBe('installed');
    expect(calls.map(c => `${c.binary} ${c.args.join(' ')}`)).toEqual([
      'claude plugin list',
      'claude plugin marketplace add Gentleman-Programming/engram',
      'claude plugin install engram@engram',
    ]);
    expect(ENGRAM_PLUGIN_COMMAND_LINE).toBe(
      'claude plugin marketplace add Gentleman-Programming/engram && claude plugin install engram@engram',
    );
  });

  test('an already-registered marketplace does not stop the install', async () => {
    const { run } = fakeRunner({ 'claude plugin marketplace add Gentleman-Programming/engram': { ok: false, stderr: 'already added' } });
    const result = await offerEngramClaudePlugin({ nonInteractive: false, confirm: async () => true, find: onPath('claude'), run });
    expect(result.outcome).toBe('installed');
  });

  test('a failing install is reported, not thrown', async () => {
    const { run } = fakeRunner({ 'claude plugin install engram@engram': { ok: false, stderr: 'network down\n' } });
    const result = await offerEngramClaudePlugin({ nonInteractive: false, confirm: async () => true, find: onPath('claude'), run });
    expect(result).toEqual({ outcome: 'failed', reason: 'network down' });
  });
});

describe('installer state written by the gentle-ai era', () => {
  test('a legacy `gentleAi` state still loads and starts Engram fresh', () => {
    const legacy = {
      version: 1 as const,
      installedAt: '2026-01-01T00:00:00.000Z',
      agents: ['claude-code'],
      gentleAi: { status: 'installed' as const, version: '1.26.5', checkedAt: '2026-01-01T00:00:00.000Z' },
      skills: { 'engram::claude-code': 'installed' as const },
      mcps: {},
      externalClis: {},
      pendingEnvVars: [],
      steps: { agentsSetupRanAt: '2026-01-01T00:00:00.000Z' },
    };
    const state = buildInitialState(legacy as unknown as Parameters<typeof buildInitialState>[0]);
    expect(state.engram.status).toBe('missing');
    expect(state.steps?.agentsSetupRanAt).toBe('2026-01-01T00:00:00.000Z');
    expect(state.skills['engram::claude-code']).toBe('installed');
  });
});
