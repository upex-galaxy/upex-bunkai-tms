import type { UiDecision, UiEnvironment, UiFlags } from './env-detect.ts';

import { describe, expect, test } from 'bun:test';

import { decideUi, parseUiFlags, truthy } from './env-detect.ts';

const MAC: UiEnvironment = { env: {}, stdinTTY: true, stdoutTTY: true, platform: 'darwin' };
const LINUX_X11: UiEnvironment = { env: { DISPLAY: ':0' }, stdinTTY: true, stdoutTTY: true, platform: 'linux' };

type Row = [name: string, flags: UiFlags, e: UiEnvironment, expected: Pick<UiDecision, 'surface' | 'readonly' | 'reason'>];

const rows: Row[] = [
  ['macOS terminal', {}, MAC, { surface: 'page', readonly: false, reason: 'default' }],
  ['windows terminal', {}, { ...MAC, platform: 'win32' }, { surface: 'page', readonly: false, reason: 'default' }],
  ['linux with X11', {}, LINUX_X11, { surface: 'page', readonly: false, reason: 'default' }],
  ['linux with wayland', {}, { ...LINUX_X11, env: { WAYLAND_DISPLAY: 'wayland-0' } }, { surface: 'page', readonly: false, reason: 'default' }],
  ['linux without display', {}, { ...LINUX_X11, env: {} }, { surface: 'terminal', readonly: false, reason: 'no-display' }],
  ['WSL without WSLg', {}, { ...LINUX_X11, env: { WSL_DISTRO_NAME: 'Ubuntu' } }, { surface: 'terminal', readonly: false, reason: 'no-display' }],
  ['--headless wins over everything', { headless: true, ui: true }, MAC, { surface: 'terminal', readonly: false, reason: 'headless-flag' }],
  ['--ui forces the page in CI', { ui: true }, { ...MAC, env: { CI: 'true' } }, { surface: 'page', readonly: false, reason: 'ui-flag' }],
  ['--ui forces the page for an agent', { ui: true }, { ...MAC, env: { CLAUDECODE: '1' } }, { surface: 'page', readonly: false, reason: 'ui-flag' }],
  ['CI=true', {}, { ...MAC, env: { CI: 'true' } }, { surface: 'terminal', readonly: false, reason: 'ci' }],
  ['CI=1 (any truthy value)', {}, { ...MAC, env: { CI: '1' } }, { surface: 'terminal', readonly: false, reason: 'ci' }],
  ['CI=false is not CI', {}, { ...MAC, env: { CI: 'false' } }, { surface: 'page', readonly: false, reason: 'default' }],
  ['GITHUB_ACTIONS', {}, { ...MAC, env: { GITHUB_ACTIONS: 'true' } }, { surface: 'terminal', readonly: false, reason: 'ci' }],
  ['BUILD_ID (Jenkins)', {}, { ...MAC, env: { BUILD_ID: '42' } }, { surface: 'terminal', readonly: false, reason: 'ci' }],
  ['stdin not a TTY', {}, { ...MAC, stdinTTY: false }, { surface: 'terminal', readonly: false, reason: 'no-tty' }],
  ['stdout not a TTY', {}, { ...MAC, stdoutTTY: false }, { surface: 'terminal', readonly: false, reason: 'no-tty' }],
  ['Claude Code drives the shell', {}, { ...MAC, env: { CLAUDECODE: '1' } }, { surface: 'terminal', readonly: false, reason: 'agent' }],
  ['Codex sandbox', {}, { ...MAC, env: { CODEX_SANDBOX: 'seatbelt' } }, { surface: 'terminal', readonly: false, reason: 'agent' }],
  ['OpenCode', {}, { ...MAC, env: { OPENCODE: '1' } }, { surface: 'terminal', readonly: false, reason: 'agent' }],
  ['SSH without display', {}, { ...MAC, env: { SSH_CONNECTION: '1.2.3.4 5 6.7.8.9 22' } }, { surface: 'terminal', readonly: false, reason: 'ssh-no-display' }],
  ['SSH with X forwarding', {}, { ...LINUX_X11, env: { SSH_TTY: '/dev/pts/1', DISPLAY: 'localhost:10.0' } }, { surface: 'page', readonly: false, reason: 'default' }],
  ['explicit --auto on a real terminal = read-only page', { explicitAuto: true }, MAC, { surface: 'page', readonly: true, reason: 'default' }],
  ['explicit --auto in CI stays in the terminal', { explicitAuto: true }, { ...MAC, env: { CI: 'true' } }, { surface: 'terminal', readonly: false, reason: 'ci' }],
  ['explicit --auto from an agent stays in the terminal', { explicitAuto: true }, { ...MAC, env: { CLAUDE_CODE_ENTRYPOINT: 'cli' } }, { surface: 'terminal', readonly: false, reason: 'agent' }],
  ['--ui with --auto = read-only page', { ui: true, explicitAuto: true }, { ...MAC, stdinTTY: false }, { surface: 'page', readonly: true, reason: 'ui-flag' }],
];

describe('decideUi (plan §5 decision table)', () => {
  for (const [name, flags, e, expected] of rows) {
    test(name, () => {
      const d = decideUi(flags, e);
      expect({ surface: d.surface, readonly: d.readonly, reason: d.reason }).toEqual(expected);
    });
  }

  test('the SSH row carries a tunnel hint', () => {
    expect(decideUi({}, { ...MAC, env: { SSH_TTY: '/dev/ttys001' } }).hint).toContain('--ui');
  });
});

describe('helpers', () => {
  test('truthy', () => {
    expect([undefined, '', ' ', '0', 'false', 'FALSE'].map(truthy)).toEqual([false, false, false, false, false, false]);
    expect(['1', 'true', 'yes', 'woodpecker'].map(truthy)).toEqual([true, true, true, true]);
  });

  test('parseUiFlags reads only an explicit --auto', () => {
    expect(parseUiFlags(['--dry-run', '--auto', '--ui'])).toEqual({ headless: false, ui: true, explicitAuto: true });
    expect(parseUiFlags([])).toEqual({ headless: false, ui: false, explicitAuto: false });
  });
});
