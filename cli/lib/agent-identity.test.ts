import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import {
  agentContextLines,
  envFileMissing,
  fileRouteState,
  IDENTITY_PREFIX,
  MISSING_ENV_LINE,
  ORCA_CONTEXT_LINE,
  ORCA_LAUNCHED_LINE,
  orcaAvailable,
  PERSONALITY_CONTRACT,
  proposeSessionTitle,
  rearmRoutes,
  resolveWorktree,
  sessionLabel,
  sessionLaunched,
  UNPROVISIONED_WORKTREE_LINE,
  worktreeUnprovisioned,
} from '../../.agents/hooks/personality-reinject.mjs';

const REPO_ROOT = resolve(import.meta.dir, '..', '..');
const NODE_BINARY = Bun.which('node') ?? 'node';
const HOOK_EMITTER = join(REPO_ROOT, '.agents/hooks/personality-reinject.mjs');
const temporaryRoots: string[] = [];

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root) { rmSync(root, { recursive: true, force: true }); }
  }
});

function temporaryRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

function write(root: string, relativePath: string, content: string): void {
  const destination = join(root, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, content);
}

/** A primary checkout (`.git` directory) that already has its `.env`. */
function primaryCheckout(): string {
  const root = temporaryRoot('agent identity checkout ');
  mkdirSync(join(root, '.git'));
  write(root, '.env', '');
  return root;
}

// ---------------------------------------------------------------------------
// Emitter harness. The emitter resolves identity from stdin (the harness
// payload), the environment and the home directory, so every run gets a
// sandboxed HOME, a sandbox checkout as cwd, and a PATH pointing at
// `<home>/bin` (an `orca` file there is what makes the Orca line appear). The
// environment is REPLACED, never inherited: the suite itself runs inside a
// harness whose CLAUDE_* variables would otherwise decide the outcome.
// ---------------------------------------------------------------------------

interface EmitterOptions {
  input?: string
  env?: Record<string, string>
  home?: string
  cwd?: string
}

interface HookSpecificOutput {
  hookEventName: string
  additionalContext: string
  sessionTitle?: string
}

function runEmitter(options: EmitterOptions = {}) {
  const home = options.home ?? temporaryRoot('agent identity home ');
  const cwd = options.cwd ?? primaryCheckout();
  const result = Bun.spawnSync({
    cmd: [NODE_BINARY, HOOK_EMITTER],
    cwd,
    stdin: new TextEncoder().encode(options.input ?? ''),
    stdout: 'pipe',
    stderr: 'pipe',
    env: { PATH: join(home, 'bin'), HOME: home, USERPROFILE: home, ...options.env },
  });
  return { exitCode: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString(), cwd };
}

function hookSpecificOutput(stdout: string): HookSpecificOutput {
  return (JSON.parse(stdout) as { hookSpecificOutput: HookSpecificOutput }).hookSpecificOutput;
}

const CLAUDE_SESSION_PID = '4242';
const CLAUDE_SESSION_ID = 'c0ffee12-3456-7890-abcd-ef0123456789';

/** `~/.claude/sessions/<CLAUDE_PID>.json` as Claude Code writes it. */
function claudeHome(name: string, nameSource: string): string {
  const home = temporaryRoot('agent identity claude home ');
  write(home, `.claude/sessions/${CLAUDE_SESSION_PID}.json`, `${JSON.stringify({
    pid: Number(CLAUDE_SESSION_PID),
    sessionId: CLAUDE_SESSION_ID,
    name,
    nameSource,
  })}\n`);
  return home;
}

function claudeRun(home: string, prompt: string) {
  const cwd = primaryCheckout();
  return runEmitter({
    home,
    cwd,
    env: { CLAUDE_PROJECT_DIR: cwd, CLAUDE_PID: CLAUDE_SESSION_PID },
    input: JSON.stringify({ session_id: CLAUDE_SESSION_ID, cwd, hook_event_name: 'UserPromptSubmit', prompt }),
  });
}

/** Codex pipes `turn_id` too, and keeps its thread names in a JSONL index. */
function codexHome(threadName: string, sessionId: string): string {
  const home = temporaryRoot('agent identity codex home ');
  write(home, '.codex/session_index.jsonl', [
    JSON.stringify({ id: 'older-session', thread_name: 'something else', updated_at: 1 }),
    JSON.stringify({ id: sessionId, thread_name: threadName, updated_at: 2 }),
    '',
  ].join('\n'));
  return home;
}

describe('hook output per harness', () => {
  test('a human running the file gets plain lines: contract, then identity', () => {
    const run = runEmitter();

    expect(run.exitCode).toBe(0);
    expect(run.stderr).toBe('');
    expect(run.stdout).toBe(`${PERSONALITY_CONTRACT}\n${IDENTITY_PREFIX} worktree=primary session=unknown harness=unknown\n`);
  });

  test('Claude Code receives additionalContext and a title derived from the prompt', () => {
    const run = claudeRun(claudeHome('agentic-dev-boilerplate-7', 'derived'), 'sprint-development UPEX-123 implement the story');

    expect(run.exitCode).toBe(0);
    const output = hookSpecificOutput(run.stdout);
    expect(output.hookEventName).toBe('UserPromptSubmit');
    expect(output.additionalContext).toContain(PERSONALITY_CONTRACT);
    // The prompt that sets the title already reports it: the session takes the name with this prompt.
    expect(output.additionalContext).toContain(
      `${IDENTITY_PREFIX} worktree=primary session=UPEX-123-sprint-development harness=claude-code`,
    );
    expect(output.sessionTitle).toBe('UPEX-123-sprint-development');
  });

  test('a user-set session name is never renamed and is used verbatim', () => {
    const output = hookSpecificOutput(claudeRun(claudeHome('release-audit', 'user'), 'sprint-development UPEX-123').stdout);

    expect(output.sessionTitle).toBeUndefined();
    expect(output.additionalContext).toContain('session=release-audit harness=claude-code');
  });

  test('a name this hook set is read back verbatim as the session label', () => {
    const output = hookSpecificOutput(claudeRun(claudeHome('worker-naming', 'hook'), 'continue with the next stage').stdout);

    expect(output.sessionTitle).toBeUndefined();
    expect(output.additionalContext).toContain('session=worker-naming harness=claude-code');
  });

  test('Codex gets the same JSON shape without a session title', () => {
    const sessionId = '019abcde-1111-2222-3333-444455556666';
    const run = runEmitter({
      home: codexHome('UPEX-77 retest', sessionId),
      input: JSON.stringify({ session_id: sessionId, turn_id: 'turn-1', hook_event_name: 'UserPromptSubmit', prompt: 'sprint-development UPEX-77' }),
    });

    expect(run.exitCode).toBe(0);
    const output = hookSpecificOutput(run.stdout);
    expect(output.additionalContext).toContain(`session=UPEX-77 retest (${sessionId.slice(0, 8)}) harness=codex`);
    // `sessionTitle` is a Claude Code field; the Codex wire has no such key.
    expect(output.sessionTitle).toBeUndefined();
  });

  test('the Orca line appears only when an orca binary sits on PATH', () => {
    const home = temporaryRoot('agent identity orca ');
    write(home, 'bin/orca', '#!/bin/sh\nexit 0\n');
    write(home, 'bin/orca-ide', '#!/bin/sh\nexit 0\n'); // the Linux CLI name

    expect(runEmitter({ home }).stdout).toContain(ORCA_CONTEXT_LINE);
    expect(runEmitter().stdout).not.toContain('ORCA:');
  });

  test('a checkout without .env gets the credentials warning', () => {
    const cwd = temporaryRoot('agent identity no env ');
    mkdirSync(join(cwd, '.git'));

    expect(runEmitter({ cwd }).stdout).toContain(MISSING_ENV_LINE);
  });
});

describe('worktree resolution', () => {
  test('a .git directory is the primary checkout, even under an Orca variable', () => {
    const primary = temporaryRoot('agent identity primary ');
    mkdirSync(join(primary, '.git'));

    expect(resolveWorktree({}, primary)).toBe('primary');
    // Orca exports the variable in the primary checkout's terminals too.
    expect(resolveWorktree({ ORCA_WORKTREE_ID: 'repo-id::/work/orca/UPEX-123-login' }, primary)).toBe('primary');
  });

  test('a linked worktree is named after its own directory, from any subdirectory', () => {
    const parent = temporaryRoot('agent identity plain linked ');
    const linked = join(parent, 'feat-login');
    write(linked, '.git', 'gitdir: /elsewhere/.git/worktrees/feat-login1\n');
    mkdirSync(join(linked, 'src', 'deep'), { recursive: true });

    expect(resolveWorktree({}, linked)).toBe('feat-login');
    expect(resolveWorktree({}, join(linked, 'src', 'deep'))).toBe('feat-login');
  });

  test('an inherited ORCA_WORKTREE_ID never overrides the checkout the session runs in', () => {
    const parent = temporaryRoot('agent identity inherited orca ');
    const linked = join(parent, 'scratch-probe');
    write(linked, '.git', 'gitdir: /elsewhere/.git/worktrees/scratch-probe\n');

    expect(resolveWorktree({ ORCA_WORKTREE_ID: 'repo-id::/work/orca/UPEX-123-login' }, linked)).toBe('scratch-probe');
  });

  test('ORCA_WORKTREE_ID is the fallback only when no .git is reachable', () => {
    const outside = temporaryRoot('agent identity no checkout ');

    expect(resolveWorktree({ ORCA_WORKTREE_ID: 'repo-id::/work/orca/UPEX-123-login' }, outside)).toBe('UPEX-123-login');
    expect(resolveWorktree({ ORCA_WORKTREE_ID: 'repo-id::C:\\work\\orca\\UPEX-9' }, outside)).toBe('UPEX-9');
    expect(resolveWorktree({}, outside)).toBe('primary');
  });

  test('a submodule or an unreadable checkout is never mistaken for a worktree', () => {
    const submodule = temporaryRoot('agent identity submodule ');
    write(submodule, '.git', 'gitdir: ../.git/modules/vendored\n');

    expect(resolveWorktree({}, submodule)).toBe('primary');
    expect(resolveWorktree({}, join(submodule, 'missing', 'deeper'))).toBe('primary');
  });
});

describe('setup warnings', () => {
  test('an unprovisioned linked worktree is flagged until node_modules and .husky/_ exist', () => {
    const linked = temporaryRoot('agent identity unprovisioned ');
    write(linked, '.git', 'gitdir: /elsewhere/.git/worktrees/wt-a\n');
    expect(worktreeUnprovisioned({ repoRoot: linked })).toBe(true);
    mkdirSync(join(linked, 'node_modules'));
    expect(worktreeUnprovisioned({ repoRoot: linked })).toBe(true);
    mkdirSync(join(linked, '.husky', '_'), { recursive: true });
    expect(worktreeUnprovisioned({ repoRoot: linked })).toBe(false);
  });

  test('a primary checkout or a submodule is never flagged as unprovisioned', () => {
    const submodule = temporaryRoot('agent identity submodule warn ');
    write(submodule, '.git', 'gitdir: ../.git/modules/vendored\n');
    const primary = temporaryRoot('agent identity primary warn ');
    mkdirSync(join(primary, '.git'));

    expect(worktreeUnprovisioned({ repoRoot: submodule })).toBe(false);
    expect(worktreeUnprovisioned({ repoRoot: primary })).toBe(false);
  });

  test('envFileMissing checks the checkout root only', () => {
    const root = temporaryRoot('agent identity env ');
    expect(envFileMissing({ repoRoot: root })).toBe(true);
    write(root, '.env', '');
    expect(envFileMissing({ repoRoot: root })).toBe(false);
  });

  test('one setup warning at most: a missing .env outranks an unprovisioned worktree', () => {
    const identity = { worktree: 'wt-a', label: 'x', harness: 'claude-code' };
    const unprovisioned = agentContextLines({ identity, orca: false, envMissing: false, worktreeUnprovisioned: true });
    const both = agentContextLines({ identity, orca: false, envMissing: true, worktreeUnprovisioned: true });

    expect(unprovisioned).toEqual([PERSONALITY_CONTRACT, `${IDENTITY_PREFIX} worktree=wt-a session=x harness=claude-code`, UNPROVISIONED_WORKTREE_LINE]);
    expect(both).toContain(MISSING_ENV_LINE);
    expect(both).not.toContain(UNPROVISIONED_WORKTREE_LINE);
  });
});

describe('session label and title', () => {
  test('the session label follows the name-source ladder', () => {
    const sessionId = 'abcdef12-3456';
    expect(sessionLabel({ sessionName: 'nightly', nameSource: 'user', sessionId })).toBe('nightly');
    expect(sessionLabel({ sessionName: 'nightly', nameSource: 'hook', sessionId })).toBe('nightly');
    expect(sessionLabel({ sessionName: 'nightly', nameSource: 'derived', sessionId })).toBe('nightly (abcdef12)');
    expect(sessionLabel({ sessionName: 'nightly', nameSource: 'unknown', sessionId })).toBe('nightly (abcdef12)');
    expect(sessionLabel({ sessionId })).toBe(sessionId);
    expect(sessionLabel({})).toBe('unknown');
  });

  test('an explicit --name hint wins over the workflow shape; an unknown-origin name is left alone', () => {
    expect(proposeSessionTitle({ prompt: 'sprint-development UPEX-9 --name "fleet worker 2"', identity: { nameSource: 'derived' } })).toBe('fleet worker 2');
    expect(proposeSessionTitle({ prompt: 'product-management UPEX-9', identity: { nameSource: 'none' } })).toBe('UPEX-9-product-management');
    expect(proposeSessionTitle({ prompt: 'sprint-development UPEX-9', identity: { nameSource: 'unknown' } })).toBe('');
    expect(proposeSessionTitle({ prompt: 'what does this repo do?', identity: { nameSource: 'derived' } })).toBe('');
  });

  test('the fleet-worker token names the session after the roster label, after any preamble', () => {
    const preamble = 'You are working inside Orca, a multi-agent IDE.\n=== TASK ===\n';
    expect(proposeSessionTitle({ prompt: '/sprint-development UPEX-123 fleet worker: run every stage.', identity: { nameSource: 'none' } })).toBe('UPEX-123');
    expect(proposeSessionTitle({ prompt: `${preamble}/git-flow-master dev-u6-identity fleet worker. Read the brief.`, identity: { nameSource: 'derived' } })).toBe('dev-u6-identity');
    // Extra words between the label and the token leave the title alone.
    expect(proposeSessionTitle({ prompt: '/git-flow-master env-scopes SPIKE fleet worker.', identity: { nameSource: 'derived' } })).toBe('');
  });

  test('a hook-set name is replaced by a new label and never re-emitted unchanged', () => {
    const prompt = '/sprint-development context-c fleet worker. Read the brief.';
    expect(proposeSessionTitle({ prompt, identity: { nameSource: 'hook', sessionName: 'context-c' } })).toBe('');
    expect(proposeSessionTitle({ prompt, identity: { nameSource: 'hook', sessionName: 'context-b' } })).toBe('context-c');
    expect(proposeSessionTitle({ prompt, identity: { nameSource: 'user', sessionName: 'mine' } })).toBe('');
  });

  const WORKER_HANDLE = 'term_7235f5a5-0fce-495c-9474-7c4370fdefa6';
  const WORKER_PROMPT = '/sprint-development TK-123-add-google-auth fleet worker. Read the brief.';

  test('in an Orca terminal the fleet name is <label>--<handle>; without a handle, the label alone', () => {
    expect(proposeSessionTitle({ prompt: WORKER_PROMPT, identity: { nameSource: 'derived' }, handle: WORKER_HANDLE }))
      .toBe(`TK-123-add-google-auth--${WORKER_HANDLE}`);
    expect(proposeSessionTitle({ prompt: WORKER_PROMPT, identity: { nameSource: 'derived' } })).toBe('TK-123-add-google-auth');
    expect(proposeSessionTitle({ prompt: WORKER_PROMPT, identity: { nameSource: 'derived' }, handle: '' })).toBe('TK-123-add-google-auth');
    // The 60-character cap is the label's; the handle is appended after it.
    const label = `TK-1-${'a'.repeat(55)}`;
    expect(proposeSessionTitle({ prompt: `/sprint-development ${label} fleet worker.`, identity: { nameSource: 'none' }, handle: WORKER_HANDLE }))
      .toBe(`${label}--${WORKER_HANDLE}`);
    // No token: the other shapes never carry the handle.
    expect(proposeSessionTitle({ prompt: 'product-management UPEX-9', identity: { nameSource: 'none' }, handle: WORKER_HANDLE })).toBe('UPEX-9-product-management');
    expect(proposeSessionTitle({ prompt: 'what does this repo do?', identity: { nameSource: 'none' }, handle: WORKER_HANDLE })).toBe('');
    // A human-set name stays; the composed name is not re-emitted once set.
    expect(proposeSessionTitle({ prompt: WORKER_PROMPT, identity: { nameSource: 'user', sessionName: 'mine' }, handle: WORKER_HANDLE })).toBe('');
    expect(proposeSessionTitle({
      prompt: WORKER_PROMPT,
      identity: { nameSource: 'hook', sessionName: `TK-123-add-google-auth--${WORKER_HANDLE}` },
      handle: WORKER_HANDLE,
    })).toBe('');
  });

  test('Claude Code: the hook proposes <label>--<handle> and reads the composed name back verbatim', () => {
    const temp = temporaryRoot('agent identity tmp ');
    const cwd = primaryCheckout();
    const env = { CLAUDE_PROJECT_DIR: cwd, CLAUDE_PID: CLAUDE_SESSION_PID, TMPDIR: temp };
    const payload = (prompt: string) => JSON.stringify({ session_id: CLAUDE_SESSION_ID, cwd, hook_event_name: 'UserPromptSubmit', prompt });
    const first = runEmitter({ home: claudeHome('agentic-dev-boilerplate-7', 'derived'), cwd, env: { ...env, ORCA_TERMINAL_HANDLE: WORKER_HANDLE }, input: payload(WORKER_PROMPT) });
    expect(hookSpecificOutput(first.stdout).sessionTitle).toBe(`TK-123-add-google-auth--${WORKER_HANDLE}`);
    expect(hookSpecificOutput(first.stdout).additionalContext).toContain(`session=TK-123-add-google-auth--${WORKER_HANDLE} harness=claude-code`);

    const next = runEmitter({ home: claudeHome(`TK-123-add-google-auth--${WORKER_HANDLE}`, 'hook'), cwd, env: { ...env, ORCA_TERMINAL_HANDLE: WORKER_HANDLE }, input: payload('continue with the next stage') });
    const output = hookSpecificOutput(next.stdout);
    expect(output.sessionTitle).toBeUndefined();
    expect(output.additionalContext).toContain(`session=TK-123-add-google-auth--${WORKER_HANDLE} harness=claude-code`);

    const noHandle = runEmitter({ home: claudeHome('agentic-dev-boilerplate-7', 'derived'), cwd, env, input: payload(WORKER_PROMPT) });
    expect(hookSpecificOutput(noHandle.stdout).sessionTitle).toBe('TK-123-add-google-auth');
  });

  test('a harness task notification proposes no session title', () => {
    expect(proposeSessionTitle({
      prompt: `<task-notification>\n<status>completed</status>\n<result>launched ${WORKER_PROMPT}</result>\n</task-notification>`,
      identity: { nameSource: 'derived' },
      handle: WORKER_HANDLE,
    })).toBe('');
  });

  test('orcaAvailable never spawns a process and tolerates an empty PATH', () => {
    const home = temporaryRoot('agent identity path ');
    write(home, 'bin/orca', '');
    write(home, 'bin/orca-ide', '');

    expect(orcaAvailable({ PATH: join(home, 'bin') })).toBe(true);
    expect(orcaAvailable({ PATH: join(home, 'missing') })).toBe(false);
    expect(orcaAvailable({})).toBe(false);
    expect(orcaAvailable({ ORCA_TERMINAL_HANDLE: 'term_1' })).toBe(true);
  });
});

describe('ORCA line by role', () => {
  const ORCA_MARKER = 'ORCA: available.';
  const identity = { worktree: 'primary', label: 'x', harness: 'claude-code', sessionId: '' };
  const base = { identity, orca: true, envMissing: false, worktreeUnprovisioned: false, router: null };
  const memoryState = () => {
    let record: Record<string, unknown> = {};
    return { read: () => record, write: (next: Record<string, unknown>) => { record = next; }, clear: () => { record = {}; } };
  };
  const orcaLine = (lines: string[]) => lines.find(line => line.startsWith(ORCA_MARKER));

  test('both variants open with the compat marker and stay one line', () => {
    for (const line of [ORCA_CONTEXT_LINE, ORCA_LAUNCHED_LINE]) {
      expect(line).toStartWith(ORCA_MARKER);
      expect(line).not.toContain('\n');
    }
    expect(ORCA_CONTEXT_LINE).toContain('ask the human directly');
    expect(ORCA_LAUNCHED_LINE).toContain('never ask the human');
  });

  test('an independent session or a conductor is told to ask the human', () => {
    expect(orcaLine(agentContextLines({ ...base, prompt: 'plan the sprint fleet', routeState: memoryState() }))).toBe(ORCA_CONTEXT_LINE);
    // A system transform with no prompt and no state (OpenCode 2) gets the default.
    expect(orcaLine(agentContextLines({ ...base, routeState: null }))).toBe(ORCA_CONTEXT_LINE);
  });

  test('the fleet token marks the session launched, and later prompts remember it', () => {
    const state = memoryState();
    expect(orcaLine(agentContextLines({ ...base, prompt: '/sprint-development TK-123 fleet worker. Read the brief.', routeState: state }))).toBe(ORCA_LAUNCHED_LINE);
    expect(state.read().launched).toBe(true);
    expect(orcaLine(agentContextLines({ ...base, prompt: 'continue with stage 2', routeState: state }))).toBe(ORCA_LAUNCHED_LINE);
    // A re-arm (compact / clear) drops the routes, never the role.
    rearmRoutes({ routeState: state });
    expect(state.read()).toEqual({ launched: true });
    expect(orcaLine(agentContextLines({ ...base, prompt: 'continue', routeState: state }))).toBe(ORCA_LAUNCHED_LINE);
  });

  test('the token after the runtime preamble counts; a notification quoting it does not', () => {
    const preamble = 'You are working inside Orca, a multi-agent IDE.\n=== TASK ===\n';
    expect(sessionLaunched({ prompt: `${preamble}/git-flow-master docs-sweep fleet worker. Read the brief.`, routeState: null })).toBe(true);
    const state = memoryState();
    const notice = '<task-notification>\n<status>completed</status>\n<result>the brief says /sprint-development TK-9 fleet worker</result>\n</task-notification>';
    expect(orcaLine(agentContextLines({ ...base, prompt: notice, routeState: state }))).toBe(ORCA_CONTEXT_LINE);
    expect(state.read()).toEqual({});
  });

  test('without a session id only the current prompt decides', () => {
    expect(sessionLaunched({ prompt: '/sprint-development TK-1 fleet worker.' })).toBe(true);
    expect(sessionLaunched({ prompt: 'continue' })).toBe(false);
  });

  test('the file-backed record keeps launched across route writes and a re-arm', () => {
    const root = temporaryRoot('orca role state ');
    const temp = temporaryRoot('orca role tmp ');
    const state = fileRouteState(root, 'session-orca', temp)!;
    expect(sessionLaunched({ prompt: '/sprint-development TK-1 fleet worker.', routeState: state })).toBe(true);
    agentContextLines({ ...base, repoRoot: root, prompt: 'next', routeState: state });
    expect(state.read().launched).toBe(true);
    rearmRoutes({ routeState: state });
    expect(state.read().launched).toBe(true);
    expect(sessionLaunched({ prompt: 'continue', routeState: state })).toBe(true);
  });
});
