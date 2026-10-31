import { describe, expect, test } from 'bun:test';

import { openCommand, orcaCommand } from './open-browser.ts';

const URL = 'http://127.0.0.1:4380/r/tok/';

describe('openCommand', () => {
  test('system opener per platform', () => {
    expect(openCommand(URL, { platform: 'darwin', env: {} })).toEqual({ command: 'open', args: [URL], via: 'open' });
    expect(openCommand(URL, { platform: 'win32', env: {} })).toEqual({ command: 'cmd', args: ['/c', 'start', '', URL], via: 'start' });
    expect(openCommand(URL, { platform: 'linux', env: {} })).toEqual({ command: 'xdg-open', args: [URL], via: 'xdg-open' });
  });

  test('inside an Orca terminal: a tab bound to the checkout', () => {
    const c = openCommand(URL, { platform: 'darwin', env: { ORCA_TERMINAL_HANDLE: 'term_1' }, checkout: '/repo' });
    expect(c).toEqual({ command: 'orca', args: ['tab', 'create', '--url', URL, '--worktree', 'path:/repo'], via: 'orca' });
  });

  test('inside Orca without a known checkout falls back to the system browser', () => {
    expect(openCommand(URL, { platform: 'darwin', env: { ORCA_TERMINAL_HANDLE: 'term_1' } }).via).toBe('open');
  });
});

describe('orcaCommand', () => {
  test('override, dev checkout, Linux outside a managed terminal, default', () => {
    expect(orcaCommand({ ORCA_CLI_COMMAND: 'wsl orca' }, 'win32')).toEqual(['wsl', 'orca']);
    expect(orcaCommand({ ORCA_DEV_REPO_ROOT: '/src/orca' }, 'darwin')).toEqual(['orca-dev']);
    expect(orcaCommand({}, 'linux')).toEqual(['orca-ide']);
    expect(orcaCommand({ ORCA_TERMINAL_HANDLE: 't' }, 'linux')).toEqual(['orca']);
    expect(orcaCommand({}, 'darwin')).toEqual(['orca']);
  });
});
