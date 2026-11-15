import { randomBytes } from 'node:crypto';
import { chmod, mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// The saved sign-in (BK-1900 TL-4). It holds a PAT, never the password and
// never the session tokens the sign-in also returns. The file is created with
// mode 0600 from its first byte (temp file opened 0600, then renamed over the
// old one), inside a directory created 0700, so on a shared machine nobody but
// its owner can read it, not even for an instant. Windows ignores POSIX mode
// bits: there the file relies on the user profile's own ACL (%APPDATA%).

export const CREDENTIALS_VERSION = 1;
export const FILE_MODE = 0o600;
export const DIR_MODE = 0o700;

export interface SavedWorkspace {
  id: string
  slug: string
  name: string
}

export interface SavedSignIn {
  version: typeof CREDENTIALS_VERSION
  api_url: string
  email: string
  token: string
  token_id: string
  token_expires_at: string | null
  workspace: SavedWorkspace | null
  signed_in_at: string
}

export function credentialsPath(
  env: Record<string, string | undefined>,
  platform: NodeJS.Platform,
  home: string,
): string {
  if (env.BUNKAI_CONFIG_DIR) {
    return join(env.BUNKAI_CONFIG_DIR, 'credentials.json');
  }
  if (platform === 'win32') {
    return join(env.APPDATA || join(home, 'AppData', 'Roaming'), 'bunkai', 'credentials.json');
  }
  return join(env.XDG_CONFIG_HOME || join(home, '.config'), 'bunkai', 'credentials.json');
}

export async function writeSignIn(path: string, signIn: SavedSignIn): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true, mode: DIR_MODE });
  const temp = join(dir, `.credentials.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
  try {
    // `wx` = fail if it exists; the mode applies at creation, before any byte
    // is written. umask can only remove bits, so 0600 stays 0600 or tighter.
    const handle = await open(temp, 'wx', FILE_MODE);
    try {
      await handle.writeFile(`${JSON.stringify(signIn, null, 2)}\n`, 'utf8');
      await handle.sync();
    }
    finally {
      await handle.close();
    }
    await rename(temp, path);
  }
  catch (err) {
    await rm(temp, { force: true });
    throw err;
  }
  if (process.platform !== 'win32') {
    // Belt and braces for a file system that ignored the open() mode.
    await chmod(path, FILE_MODE);
  }
}

export type ReadResult
  = | { kind: 'missing' }
    | { kind: 'invalid' }
    | { kind: 'ok', signIn: SavedSignIn, tooOpen: boolean };

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function parseSignIn(raw: unknown): SavedSignIn | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const v = raw as Record<string, unknown>;
  if (v.version !== CREDENTIALS_VERSION || !isString(v.api_url) || !isString(v.email) || !isString(v.token)
    || !isString(v.token_id) || !isString(v.signed_in_at)) {
    return null;
  }
  if (v.token_expires_at !== null && !isString(v.token_expires_at)) {
    return null;
  }
  let workspace: SavedWorkspace | null = null;
  if (v.workspace !== null) {
    const w = v.workspace as Record<string, unknown> | undefined;
    if (!w || !isString(w.id) || !isString(w.slug) || !isString(w.name)) {
      return null;
    }
    workspace = { id: w.id, slug: w.slug, name: w.name };
  }
  return {
    version: CREDENTIALS_VERSION,
    api_url: v.api_url,
    email: v.email,
    token: v.token,
    token_id: v.token_id,
    token_expires_at: v.token_expires_at,
    workspace,
    signed_in_at: v.signed_in_at,
  };
}

export async function readSignIn(path: string): Promise<ReadResult> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  }
  catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { kind: 'missing' };
    }
    return { kind: 'invalid' };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  }
  catch {
    return { kind: 'invalid' };
  }
  const signIn = parseSignIn(raw);
  if (!signIn) {
    return { kind: 'invalid' };
  }
  let tooOpen = false;
  if (process.platform !== 'win32') {
    const info = await stat(path);
    tooOpen = (info.mode & 0o077) !== 0;
  }
  return { kind: 'ok', signIn, tooOpen };
}
