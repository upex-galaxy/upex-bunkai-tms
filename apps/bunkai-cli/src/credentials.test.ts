import type { SavedSignIn } from './credentials';
import { chmodSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import { credentialsPath, readSignIn, writeSignIn } from './credentials';
import { tempConfigDir } from './testing/fakes';

// BK-1900 AC-03 "the saved sign-in is private to me" and TL-4 (where it lives).

const SIGN_IN: SavedSignIn = {
  version: 1,
  api_url: 'https://bunkai.test',
  email: 'karim@acme.test',
  token: 'bk_pat_fake_token_value',
  token_id: 'tok-1',
  token_expires_at: '2027-02-13T12:00:00Z',
  workspace: { id: 'ws-1', slug: 'acme-qa', name: 'Acme QA' },
  signed_in_at: '2026-11-15T12:00:00Z',
};

const posixOnly = process.platform === 'win32' ? it.skip : it;

describe('credentialsPath', () => {
  it('honours BUNKAI_CONFIG_DIR first', () => {
    expect(credentialsPath({ BUNKAI_CONFIG_DIR: '/custom' }, 'linux', '/home/k')).toBe(join('/custom', 'credentials.json'));
  });

  it('uses XDG_CONFIG_HOME on Linux and macOS when set', () => {
    expect(credentialsPath({ XDG_CONFIG_HOME: '/xdg' }, 'darwin', '/home/k')).toBe(join('/xdg', 'bunkai', 'credentials.json'));
  });

  it('falls back to ~/.config/bunkai', () => {
    expect(credentialsPath({}, 'linux', '/home/k')).toBe(join('/home/k', '.config', 'bunkai', 'credentials.json'));
  });

  it('uses %APPDATA%\\bunkai on Windows', () => {
    expect(credentialsPath({ APPDATA: 'C:\\Users\\k\\AppData\\Roaming' }, 'win32', 'C:\\Users\\k')).toBe(join('C:\\Users\\k\\AppData\\Roaming', 'bunkai', 'credentials.json'));
  });
});

describe('writeSignIn / readSignIn', () => {
  let cleanup: (() => void) | null = null;
  afterEach(() => {
    cleanup?.();
    cleanup = null;
  });

  posixOnly('writes the file readable and writable by its owner only (0600) in a 0700 folder', async () => {
    const t = tempConfigDir();
    cleanup = t.cleanup;
    await writeSignIn(t.path, SIGN_IN);
    expect(statSync(t.path).mode & 0o777).toBe(0o600);
    expect(statSync(dirname(t.path)).mode & 0o777).toBe(0o700);
  });

  posixOnly('keeps 0600 when it replaces a file someone had opened up', async () => {
    const t = tempConfigDir();
    cleanup = t.cleanup;
    await writeSignIn(t.path, SIGN_IN);
    chmodSync(t.path, 0o644);
    await writeSignIn(t.path, { ...SIGN_IN, email: 'other@acme.test' });
    expect(statSync(t.path).mode & 0o777).toBe(0o600);
  });

  it('leaves no temp file behind', async () => {
    const t = tempConfigDir();
    cleanup = t.cleanup;
    await writeSignIn(t.path, SIGN_IN);
    expect(readdirSync(dirname(t.path))).toEqual(['credentials.json']);
  });

  it('round-trips the saved sign-in', async () => {
    const t = tempConfigDir();
    cleanup = t.cleanup;
    await writeSignIn(t.path, SIGN_IN);
    const result = await readSignIn(t.path);
    expect(result).toEqual({ kind: 'ok', signIn: SIGN_IN, tooOpen: false });
  });

  it('reports a missing file as missing', async () => {
    const t = tempConfigDir();
    cleanup = t.cleanup;
    expect(await readSignIn(t.path)).toEqual({ kind: 'missing' });
  });

  it('reports a corrupt or foreign-shaped file as invalid, never as a sign-in', async () => {
    const t = tempConfigDir();
    cleanup = t.cleanup;
    await writeSignIn(t.path, SIGN_IN);
    writeFileSync(t.path, '{"version":1,"token":42}');
    expect(await readSignIn(t.path)).toEqual({ kind: 'invalid' });
    writeFileSync(t.path, 'not json');
    expect(await readSignIn(t.path)).toEqual({ kind: 'invalid' });
  });

  posixOnly('flags a file that group or others can read', async () => {
    const t = tempConfigDir();
    cleanup = t.cleanup;
    await writeSignIn(t.path, SIGN_IN);
    chmodSync(t.path, 0o644);
    const result = await readSignIn(t.path);
    expect(result.kind === 'ok' && result.tooOpen).toBe(true);
  });
});
