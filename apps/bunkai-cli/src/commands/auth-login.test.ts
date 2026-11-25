import type { Route } from '../testing/fakes';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import { EXIT_CANCELLED, EXIT_FAILURE, EXIT_OK, EXIT_USAGE } from '../errors';
import { run } from '../run';
import { fakeApi, fakeDeps, scriptedPrompter, tempConfigDir } from '../testing/fakes';
import { MSG_CANCELLED, MSG_THROTTLED, MSG_WRONG_CREDENTIALS, PAT_EXPIRES_IN_DAYS, patName } from './auth-login';

// BK-1900 AC-01 (sign in) and the refined Ctrl+C scenario.

const PASSWORD = 'correct-horse-battery';
const TOKEN = 'bk_pat_minted_for_the_cli';

const signInOk: Route = () => ({
  status: 200,
  body: {
    user: { id: 'u-1', email: 'karim@acme.test' },
    session: { access_token: 'session-access-token', refresh_token: 'session-refresh-token', expires_at: 1, token_type: 'bearer' },
    pat: { token: TOKEN, id: 'tok-1', name: 'bunkai-cli test-host', scopes: ['atc:read', 'run:execute'], expires_at: '2027-02-13T12:00:00Z' },
    warning: 'Store the PAT token now — it cannot be retrieved later.',
  },
});

const meOk: Route = () => ({
  status: 200,
  body: {
    user: { id: 'u-1', email: 'karim@acme.test' },
    workspaces: [
      { id: 'ws-1', slug: 'acme-qa', name: 'Acme QA' },
      { id: 'ws-2', slug: 'other', name: 'Other' },
    ],
    active_workspace_id: 'ws-1',
  },
});

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

function setup(routes: Record<string, Route>, answers: Array<string | 'cancel'>, argv: string[] = []) {
  const t = tempConfigDir();
  cleanup = t.cleanup;
  const api = fakeApi(routes);
  const prompt = scriptedPrompter(answers);
  const deps = fakeDeps({ fetch: api.fetch, credentialsPath: t.path, prompt, env: { BUNKAI_API_URL: 'https://bunkai.test' } });
  return { t, api, prompt, deps, go: async () => run(['auth', 'login', ...argv], deps) };
}

describe('bunkai auth login — signing in', () => {
  it('signs in, names the email and the default Workspace, and saves the sign-in', async () => {
    const s = setup({ 'POST /api/v1/auth/signin': signInOk, 'GET /api/v1/me': meOk }, ['karim@acme.test', PASSWORD]);
    expect(await s.go()).toBe(EXIT_OK);
    expect(s.deps.stderrText()).toContain('Signed in as karim@acme.test.');
    expect(s.deps.stderrText()).toContain('Default Workspace: Acme QA (acme-qa).');
    const saved = JSON.parse(readFileSync(s.t.path, 'utf8'));
    expect(saved).toMatchObject({
      version: 1,
      api_url: 'https://bunkai.test',
      email: 'karim@acme.test',
      token: TOKEN,
      token_id: 'tok-1',
      token_expires_at: '2027-02-13T12:00:00Z',
      workspace: { id: 'ws-1', slug: 'acme-qa', name: 'Acme QA' },
    });
  });

  it('asks for a PAT that reads ATCs and executes Runs, expires, and is named after the machine', async () => {
    const s = setup({ 'POST /api/v1/auth/signin': signInOk, 'GET /api/v1/me': meOk }, ['karim@acme.test', PASSWORD]);
    await s.go();
    const signIn = s.api.requests.find(r => r.url.pathname === '/api/v1/auth/signin');
    expect(signIn?.body).toEqual({
      email: 'karim@acme.test',
      password: PASSWORD,
      pat_name: 'bunkai-cli test-host',
      pat_scopes: ['atc:read', 'run:execute'],
      pat_expires_in_days: PAT_EXPIRES_IN_DAYS,
    });
    const me = s.api.requests.find(r => r.url.pathname === '/api/v1/me');
    expect(me?.headers.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('never writes the password, nor the session tokens, to the file, stdout or stderr', async () => {
    const s = setup({ 'POST /api/v1/auth/signin': signInOk, 'GET /api/v1/me': meOk }, ['karim@acme.test', PASSWORD]);
    await s.go();
    const file = readFileSync(s.t.path, 'utf8');
    for (const secret of [PASSWORD, 'session-access-token', 'session-refresh-token']) {
      expect(file).not.toContain(secret);
      expect(s.deps.stdoutText()).not.toContain(secret);
      expect(s.deps.stderrText()).not.toContain(secret);
    }
    expect(s.deps.stdoutText()).toBe('');
  });

  it('uses --email and prompts only for the password', async () => {
    const s = setup({ 'POST /api/v1/auth/signin': signInOk, 'GET /api/v1/me': meOk }, [PASSWORD], ['--email', 'karim@acme.test']);
    expect(await s.go()).toBe(EXIT_OK);
    expect(s.prompt.asked).toEqual(['Password: ']);
  });

  it('says so when the account has no Workspace yet, and still signs in', async () => {
    const s = setup({
      'POST /api/v1/auth/signin': signInOk,
      'GET /api/v1/me': () => ({ status: 200, body: { workspaces: [], active_workspace_id: null } }),
    }, ['karim@acme.test', PASSWORD]);
    expect(await s.go()).toBe(EXIT_OK);
    expect(s.deps.stderrText()).toContain('You have no Workspace yet');
    expect(JSON.parse(readFileSync(s.t.path, 'utf8')).workspace).toBeNull();
  });
});

describe('bunkai auth login — refusals keep nothing', () => {
  function expectNothingSaved(path: string) {
    expect(existsSync(path)).toBe(false);
    if (existsSync(dirname(path))) {
      expect(readdirSync(dirname(path))).toEqual([]);
    }
  }

  it('refuses a wrong password plainly, keeps nothing and exits non-zero', async () => {
    const s = setup({ 'POST /api/v1/auth/signin': () => ({ status: 401, body: { error: { code: 'unauthorized', message: 'Invalid email or password.' } } }) }, ['karim@acme.test', 'wrong']);
    expect(await s.go()).toBe(EXIT_FAILURE);
    expect(s.deps.stderrText()).toBe(`${MSG_WRONG_CREDENTIALS}\n`);
    expectNothingSaved(s.t.path);
  });

  it('tells an account with no password why, in the same refusal (PO-4)', () => {
    expect(MSG_WRONG_CREDENTIALS).toContain('The email or password is not right.');
    expect(MSG_WRONG_CREDENTIALS).toContain('This sign-in needs a password');
    expect(MSG_WRONG_CREDENTIALS).toContain('magic link, GitHub or Google');
  });

  it('gives a too-short password the same answer as a wrong one', async () => {
    const s = setup({ 'POST /api/v1/auth/signin': () => ({ status: 422, body: { error: { code: 'validation_failed', details: [{ path: ['password'] }] } } }) }, ['karim@acme.test', 'abc']);
    expect(await s.go()).toBe(EXIT_FAILURE);
    expect(s.deps.stderrText()).toBe(`${MSG_WRONG_CREDENTIALS}\n`);
  });

  it('names a malformed email', async () => {
    const s = setup({ 'POST /api/v1/auth/signin': () => ({ status: 422, body: { error: { code: 'validation_failed', details: [{ path: ['email'] }] } } }) }, ['not-an-email', PASSWORD]);
    expect(await s.go()).toBe(EXIT_FAILURE);
    expect(s.deps.stderrText()).toContain('"not-an-email" is not a valid email address.');
  });

  it('says to wait when sign-in is throttled', async () => {
    const s = setup({ 'POST /api/v1/auth/signin': () => ({ status: 429, body: { error: { code: 'rate_limited' } } }) }, ['karim@acme.test', PASSWORD]);
    expect(await s.go()).toBe(EXIT_FAILURE);
    expect(s.deps.stderrText()).toBe(`${MSG_THROTTLED}\n`);
    expectNothingSaved(s.t.path);
  });

  it('keeps nothing when Ctrl+C is pressed at the password prompt, exit 130', async () => {
    const s = setup({}, ['karim@acme.test', 'cancel']);
    expect(await s.go()).toBe(EXIT_CANCELLED);
    expect(s.deps.stderrText()).toBe(`${MSG_CANCELLED}\n`);
    expect(s.api.requests).toEqual([]);
    expectNothingSaved(s.t.path);
  });

  it('keeps nothing when the Workspace lookup fails after the sign-in', async () => {
    const s = setup({ 'POST /api/v1/auth/signin': signInOk, 'GET /api/v1/me': () => ({ status: 403, body: {} }) }, ['karim@acme.test', PASSWORD]);
    expect(await s.go()).toBe(EXIT_FAILURE);
    expect(s.deps.stderrText()).toContain('Nothing was saved');
    expect(s.deps.stderrText()).toContain('The PAT "bunkai-cli test-host" this sign-in created stays active');
    expect(s.deps.stderrText()).not.toContain(TOKEN);
    expectNothingSaved(s.t.path);
  });

  it('names the PAT it created when the sign-in cannot be saved', async () => {
    const s = setup({ 'POST /api/v1/auth/signin': signInOk, 'GET /api/v1/me': meOk }, ['karim@acme.test', PASSWORD]);
    // A plain file where the config folder should be: mkdir fails.
    writeFileSync(dirname(s.t.path), 'not a folder');
    expect(await s.go()).toBe(EXIT_FAILURE);
    expect(s.deps.stderrText()).toContain('could not be saved');
    expect(s.deps.stderrText()).toContain('The PAT "bunkai-cli test-host" this sign-in created stays active');
    expect(s.deps.stderrText()).not.toContain(TOKEN);
  });

  it('keeps nothing and explains a network failure, with no stack trace', async () => {
    const t = tempConfigDir();
    cleanup = t.cleanup;
    const deps = fakeDeps({
      fetch: (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch,
      credentialsPath: t.path,
      prompt: scriptedPrompter(['karim@acme.test', PASSWORD]),
      env: { BUNKAI_API_URL: 'https://bunkai.test' },
    });
    expect(await run(['auth', 'login'], deps)).toBe(EXIT_FAILURE);
    expect(deps.stderrText()).toBe('Could not reach Bunkai at https://bunkai.test. Check your connection and try again.\n');
    expect(existsSync(t.path)).toBe(false);
  });

  it('refuses an empty password before sending anything', async () => {
    const s = setup({}, ['karim@acme.test', '']);
    expect(await s.go()).toBe(EXIT_FAILURE);
    expect(s.api.requests).toEqual([]);
  });

  it('refuses an unknown option as a usage error', async () => {
    const s = setup({}, [], ['--password', 'x']);
    expect(await s.go()).toBe(EXIT_USAGE);
    expect(s.api.requests).toEqual([]);
  });
});

describe('bunkai auth login — details', () => {
  const posixOnly = process.platform === 'win32' ? it.skip : it;

  posixOnly('saves the sign-in readable by its owner only', async () => {
    const s = setup({ 'POST /api/v1/auth/signin': signInOk, 'GET /api/v1/me': meOk }, ['karim@acme.test', PASSWORD]);
    await s.go();
    expect(statSync(s.t.path).mode & 0o777).toBe(0o600);
  });

  it('keeps the PAT name within the server limit and free of odd characters', () => {
    expect(patName('my laptop!')).toBe('bunkai-cli mylaptop');
    expect(patName('x'.repeat(200)).length).toBeLessThanOrEqual(80);
    expect(patName('')).toBe('bunkai-cli unknown-host');
  });

  it('prints its usage on --help to stdout and exits 0', async () => {
    const s = setup({}, [], ['--help']);
    expect(await s.go()).toBe(EXIT_OK);
    expect(s.deps.stdoutText()).toContain('Usage: bunkai auth login');
    expect(s.deps.stdoutText()).not.toContain('read-only');
    expect(s.deps.stdoutText()).toContain('read ATCs (atc:read) and execute Runs (run:execute)');
  });

  it('refuses an API URL that is not http(s)', async () => {
    const s = setup({}, [], ['--api-url', 'ftp://bunkai.test']);
    expect(await s.go()).toBe(EXIT_FAILURE);
    expect(s.deps.stderrText()).toContain('must start with https:// or http://');
  });
});
