import type { SavedSignIn } from '../credentials';
import type { RecordedRequest, Route } from '../testing/fakes';
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'bun:test';
import { writeSignIn } from '../credentials';
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, MSG_NOT_SIGNED_IN, MSG_SIGN_IN_INVALID, MSG_TOKEN_INVALID } from '../errors';
import { run } from '../run';
import { fakeApi, fakeDeps, tempConfigDir } from '../testing/fakes';
import { matchEnvironment, shellQuote } from './run-start';

const WS = { id: '0d269820-61bc-46a6-ab76-d5bd68a55383', slug: 'acme-qa', name: 'Acme QA' };
const PROJECT = { id: 'a1111111-1111-4111-8111-111111111111', slug: 'checkout-v2', name: 'Checkout v2', created_at: '2026-11-01T00:00:00Z' };
const STAGING = { id: 'e1111111-1111-4111-8111-111111111111', project_id: PROJECT.id, name: 'Staging', created_at: '2026-11-01T00:00:00Z' };
const PRODUCTION = { id: 'e2222222-2222-4222-8222-222222222222', project_id: PROJECT.id, name: 'Production', created_at: '2026-11-01T00:00:00Z' };
const TEST_ID = 'b1111111-1111-4111-8111-111111111111';
const RUN_ID = 'c1111111-1111-4111-8111-111111111111';
const TOKEN = 'bk_pat_saved_token';
const UUID_RE = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/;

const SIGN_IN: SavedSignIn = {
  version: 1,
  api_url: 'https://bunkai.test',
  email: 'karim@acme.test',
  token: TOKEN,
  token_id: 'tok-1',
  token_expires_at: '2027-02-13T12:00:00Z',
  workspace: WS,
  signed_in_at: '2026-11-15T12:00:00Z',
};

function runBody(overrides: Record<string, unknown> = {}) {
  return {
    id: RUN_ID,
    workspace_id: WS.id,
    project_id: PROJECT.id,
    test_id: TEST_ID,
    test_title: 'Checkout with a saved card',
    environment_id: STAGING.id,
    environment_name: 'Staging',
    status: 'running',
    executor_mode: 'human',
    executor_user_id: 'u-1',
    executor_name: 'bunkai-cli test-host',
    started_at: '2026-11-15T12:00:01Z',
    atcs: [{ id: 'ra-1', steps: [{ id: 'rs-1' }] }],
    replayed: false,
    ...overrides,
  };
}

function refused(status: number, code: string, reason?: string, message = 'refused'): Route {
  return () => ({ status, body: { error: { code, message, ...(reason ? { details: { reason } } : {}) } } });
}

const startedRoute: Route = (req) => {
  const body = req.body as { executor_mode: string };
  return { status: 201, body: { run: runBody({ executor_mode: body.executor_mode }) } };
};

const BASE_ROUTES: Record<string, Route> = {
  [`GET /api/v1/workspaces/${WS.id}/projects`]: req => ({ status: 200, body: { projects: [PROJECT].filter(p => !req.url.searchParams.get('slug') || p.slug === req.url.searchParams.get('slug')) } }),
  [`GET /api/v1/projects/${PROJECT.id}/environments`]: () => ({ status: 200, body: { environments: [PRODUCTION, STAGING] } }),
  [`GET /api/v1/tests/${TEST_ID}`]: () => ({ status: 200, body: { test: { id: TEST_ID, title: 'Checkout with a saved card', archived_at: null } } }),
  'POST /api/v1/runs': startedRoute,
};

const ARGS = ['--project', 'checkout-v2', '--test', TEST_ID, '--env', 'Staging'];

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

async function setup(opts: { routes?: Record<string, Route>, signIn?: SavedSignIn | null, env?: Record<string, string> } = {}) {
  const t = tempConfigDir();
  cleanup = t.cleanup;
  if (opts.signIn !== null) {
    await writeSignIn(t.path, opts.signIn ?? SIGN_IN);
  }
  const api = fakeApi({ ...BASE_ROUTES, ...opts.routes });
  const deps = fakeDeps({ fetch: api.fetch, credentialsPath: t.path, env: opts.env ?? {} });
  const posts = () => api.requests.filter(r => r.method === 'POST' && r.url.pathname === '/api/v1/runs');
  return { t, api, deps, posts, go: async (...argv: string[]) => run(['run', 'start', ...argv], deps) };
}

function postBody(req: RecordedRequest | undefined) {
  return req?.body as { test_id: string, environment_id: string, executor_mode: string, start_token: string };
}

describe('bunkai run start — starting a Run (AC-01)', () => {
  it('starts a Run in the named environment and prints its summary and link', async () => {
    const s = await setup();
    expect(await s.go(...ARGS)).toBe(EXIT_OK);
    const out = s.deps.stdoutText();
    expect(out).toContain('Run started.');
    expect(out).toContain(`Run:         ${RUN_ID}`);
    expect(out).toContain('Test:        Checkout with a saved card');
    expect(out).toContain('Environment: Staging');
    expect(out).toContain('Executor:    human');
    expect(out).toContain('Status:      running');
    expect(out).toContain('Workspace:   Acme QA');
    expect(out).toContain(`Link:        https://bunkai.test/projects/checkout-v2/runs/${RUN_ID}`);
    expect(s.posts()).toHaveLength(1);
    expect(postBody(s.posts()[0])).toMatchObject({ test_id: TEST_ID, environment_id: STAGING.id, executor_mode: 'human' });
  });

  it('calls the Project, environment, Test and run endpoints in that order, all with the PAT', async () => {
    const s = await setup();
    await s.go(...ARGS);
    expect(s.api.requests.map(r => `${r.method} ${r.url.pathname}`)).toEqual([
      `GET /api/v1/workspaces/${WS.id}/projects`,
      `GET /api/v1/projects/${PROJECT.id}/environments`,
      `GET /api/v1/tests/${TEST_ID}`,
      'POST /api/v1/runs',
    ]);
    expect(s.api.requests.every(r => r.headers.authorization === `Bearer ${TOKEN}`)).toBe(true);
  });

  it('accepts the Project by id and still links with its slug', async () => {
    const s = await setup();
    expect(await s.go('--project', PROJECT.id, '--test', TEST_ID, '--env', 'Staging')).toBe(EXIT_OK);
    expect(s.api.requests[0]?.url.searchParams.has('slug')).toBe(false);
    expect(s.deps.stdoutText()).toContain(`/projects/checkout-v2/runs/${RUN_ID}`);
  });

  for (const executor of ['human', 'agent', 'ci'] as const) {
    it(`records the executor ${executor} and warns about the idle close only for agent and ci`, async () => {
      const s = await setup();
      expect(await s.go(...ARGS, '--executor', executor)).toBe(EXIT_OK);
      expect(postBody(s.posts()[0]).executor_mode).toBe(executor);
      expect(s.deps.stdoutText()).toContain(`Executor:    ${executor}`);
      if (executor === 'human') {
        expect(s.deps.stderrText()).toBe('');
      }
      else {
        expect(s.deps.stderrText()).toContain('no step result for 60 minutes is closed automatically');
      }
    });
  }

  it('prints only one flat JSON object with --json, and person messages on stderr', async () => {
    const s = await setup();
    expect(await s.go(...ARGS, '--json', '--executor', 'agent')).toBe(EXIT_OK);
    const json = JSON.parse(s.deps.stdoutText());
    expect(Object.keys(json).sort()).toEqual(['environment_id', 'environment_name', 'executor_mode', 'id', 'project_id', 'replayed', 'started_at', 'status', 'test_id', 'test_title', 'url'].sort());
    expect(json).toEqual({
      id: RUN_ID,
      url: `https://bunkai.test/projects/checkout-v2/runs/${RUN_ID}`,
      status: 'running',
      replayed: false,
      test_id: TEST_ID,
      test_title: 'Checkout with a saved card',
      project_id: PROJECT.id,
      environment_id: STAGING.id,
      environment_name: 'Staging',
      executor_mode: 'agent',
      started_at: '2026-11-15T12:00:01Z',
    });
    expect(s.deps.stderrText()).toContain('60 minutes');
  });

  it('prints nothing on stdout when a --json start fails', async () => {
    const s = await setup({ routes: { 'POST /api/v1/runs': refused(422, 'no_executable_steps', 'no_executable_steps') } });
    expect(await s.go(...ARGS, '--json')).toBe(EXIT_FAILURE);
    expect(s.deps.stdoutText()).toBe('');
    expect(s.deps.stderrText()).not.toBe('');
  });

  it('drops control characters from names written by other members', async () => {
    const s = await setup({ routes: { 'POST /api/v1/runs': () => ({ status: 201, body: { run: runBody({ test_title: 'Pay\u001B[2Jnow' }) } }) } });
    expect(await s.go(...ARGS)).toBe(EXIT_OK);
    expect(s.deps.stdoutText()).toContain('Test:        Pay[2Jnow');
    expect(s.deps.stdoutText()).not.toContain('\u001B');
  });
});

describe('bunkai run start — retry key (AC-02)', () => {
  it('sends a fresh Idempotency-Key on every invocation and the retry key only as start_token', async () => {
    const s = await setup();
    await s.go(...ARGS, '--retry-key', 'nightly-2026-11-17');
    await s.go(...ARGS, '--retry-key', 'nightly-2026-11-17');
    const [first, second] = s.posts();
    expect(first?.headers['idempotency-key']).toMatch(UUID_RE);
    expect(second?.headers['idempotency-key']).toMatch(UUID_RE);
    expect(first?.headers['idempotency-key']).not.toBe(second?.headers['idempotency-key']);
    expect(postBody(first).start_token).toBe('nightly-2026-11-17');
    expect(postBody(second).start_token).toBe('nightly-2026-11-17');
  });

  it('generates a different start_token per start when no retry key is given', async () => {
    const s = await setup();
    await s.go(...ARGS);
    await s.go(...ARGS);
    const [a, b] = s.posts().map(r => postBody(r).start_token);
    expect(a).toMatch(UUID_RE);
    expect(b).toMatch(UUID_RE);
    expect(a).not.toBe(b);
  });

  it('trims the retry key, so padded and unpadded keys name one Run', async () => {
    const s = await setup();
    await s.go(...ARGS, '--retry-key', '  nightly  ');
    expect(postBody(s.posts()[0]).start_token).toBe('nightly');
  });

  it('reports an existing Run as already existing, exit 0, replayed true', async () => {
    const s = await setup({ routes: { 'POST /api/v1/runs': () => ({ status: 200, body: { run: runBody({ replayed: true }) } }) } });
    expect(await s.go(...ARGS, '--retry-key', 'nightly')).toBe(EXIT_OK);
    expect(s.deps.stdoutText()).toContain('Run already existed (same retry key), nothing new was started.');
    expect(s.deps.stdoutText()).toContain(RUN_ID);
    cleanup?.();
    const j = await setup({ routes: { 'POST /api/v1/runs': () => ({ status: 200, body: { run: runBody({ replayed: true }) } }) } });
    expect(await j.go(...ARGS, '--retry-key', 'nightly', '--json')).toBe(EXIT_OK);
    expect(JSON.parse(j.deps.stdoutText()).replayed).toBe(true);
  });

  for (const status of ['passed', 'failed', 'aborted']) {
    it(`returns a ${status} Run behind the retry key with exit 0 and suggests a new key`, async () => {
      const s = await setup({ routes: { 'POST /api/v1/runs': () => ({ status: 200, body: { run: runBody({ replayed: true, status, executor_mode: 'agent' }) } }) } });
      expect(await s.go(...ARGS, '--executor', 'agent', '--retry-key', 'nightly')).toBe(EXIT_OK);
      expect(s.deps.stdoutText()).toContain(`Status:      ${status}`);
      expect(s.deps.stderrText()).toBe(`This Run is already ${status}. Use a new --retry-key to start another Run.\n`);
    });
  }

  it('refuses a retry key reused with another environment, naming the existing Run', async () => {
    const s = await setup({ routes: { 'POST /api/v1/runs': () => ({ status: 200, body: { run: runBody({ replayed: true }) } }) } });
    expect(await s.go('--project', 'checkout-v2', '--test', TEST_ID, '--env', 'Production', '--retry-key', 'nightly-2026-11-17', '--json')).toBe(EXIT_FAILURE);
    expect(s.deps.stdoutText()).toBe('');
    const err = s.deps.stderrText();
    expect(err).toContain('The retry key nightly-2026-11-17 already belongs to a Run of this Test started in Staging with executor human');
    expect(err).toContain(`https://bunkai.test/projects/checkout-v2/runs/${RUN_ID}`);
    expect(err).toContain('Use a new --retry-key to start one in Production with executor human.');
  });

  it('refuses a retry key reused with another executor', async () => {
    const s = await setup({ routes: { 'POST /api/v1/runs': () => ({ status: 200, body: { run: runBody({ replayed: true, executor_mode: 'human' }) } }) } });
    expect(await s.go(...ARGS, '--executor', 'agent', '--retry-key', 'nightly')).toBe(EXIT_FAILURE);
    expect(s.deps.stdoutText()).toBe('');
    expect(s.deps.stderrText()).toContain('started in Staging with executor human');
    expect(s.deps.stderrText()).toContain('with executor agent.');
  });

  const unknown: Array<[string, Route | 'drop']> = [
    ['the connection dropped', 'drop'],
    ['the server answered with a 5xx error', () => ({ status: 502, headers: { 'x-request-id': 'req-77' } })],
    ['the success answer could not be read', () => ({ status: 201, body: { ok: true } })],
    ['an unexpected success status came back', () => ({ status: 202, body: {} })],
  ];
  for (const [problem, route] of unknown) {
    it(`gives the exact retry key it sent when ${problem}, after one POST only`, async () => {
      const s = await setup(route === 'drop' ? {} : { routes: { 'POST /api/v1/runs': route } });
      if (route === 'drop') {
        const fetchImpl = s.deps.fetch;
        s.deps.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
          if (init?.method === 'POST') {
            s.api.requests.push({ method: 'POST', url: new URL(String(input)), headers: {}, body: JSON.parse(String(init.body)) });
            throw new TypeError('socket hang up');
          }
          return fetchImpl(input, init);
        }) as typeof fetch;
      }
      expect(await s.go(...ARGS, '--json')).toBe(EXIT_FAILURE);
      expect(s.posts()).toHaveLength(1);
      expect(s.deps.stdoutText()).toBe('');
      const err = s.deps.stderrText();
      const sent = postBody(s.posts()[0]).start_token;
      expect(err).toContain('so the Run may or may not have started. Nothing was retried.');
      expect(err).toContain(`--retry-key=${sent} to get that Run`);
      expect(err).not.toContain('try again');
    });
  }

  it('names a retry key the person typed, in a form the shell and the option parser take back', async () => {
    for (const [key, shown] of [['night run #1', '\'night run #1\''], ['-nightly', '-nightly'], ['=nightly', '=nightly']]) {
      const s = await setup({ routes: { 'POST /api/v1/runs': () => ({ status: 500 }) } });
      expect(await s.go(...ARGS, `--retry-key=${key}`)).toBe(EXIT_FAILURE);
      expect(s.deps.stderrText()).toContain(`--retry-key=${shown} to get that Run`);
      expect(postBody(s.posts()[0]).start_token).toBe(key);
      cleanup?.();
    }
  });

  it('says no answer came within the time limit on a timeout', async () => {
    const s = await setup();
    const fetchImpl = s.deps.fetch;
    s.deps.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') {
        throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
      }
      return fetchImpl(input, init);
    }) as typeof fetch;
    expect(await s.go(...ARGS, '--retry-key', 'k1')).toBe(EXIT_FAILURE);
    expect(s.deps.stderrText()).toContain('(no answer came within 30 s), so the Run may or may not have started');
    expect(s.deps.stderrText()).toContain('--retry-key=k1 ');
  });
});

describe('bunkai run start — Runs that cannot be started (AC-03)', () => {
  it('says the Project was not found and stops', async () => {
    const s = await setup();
    expect(await s.go('--project', 'nope', '--test', TEST_ID, '--env', 'Staging')).toBe(EXIT_FAILURE);
    expect(s.deps.stderrText()).toContain('Project not found: "nope"');
    expect(s.api.requests).toHaveLength(1);
  });

  it('lists the Project\'s environments for an unknown name and sends no start', async () => {
    const s = await setup();
    expect(await s.go('--project', 'checkout-v2', '--test', TEST_ID, '--env', 'qa')).toBe(EXIT_FAILURE);
    expect(s.deps.stderrText()).toBe('Unknown environment "qa" in Checkout v2. Its environments are:\n  Production\n  Staging\n');
    expect(s.posts()).toHaveLength(0);
  });

  it('points to the web app when the Project has no environments', async () => {
    const s = await setup({ routes: { [`GET /api/v1/projects/${PROJECT.id}/environments`]: () => ({ status: 200, body: { environments: [] } }) } });
    expect(await s.go(...ARGS)).toBe(EXIT_FAILURE);
    expect(s.deps.stderrText()).toContain('The Project Checkout v2 has no environments yet. Add one in the web app');
    expect(s.posts()).toHaveLength(0);
  });

  it('answers a Test of another Workspace exactly like a Test id nobody uses', async () => {
    const missing = await setup({ routes: { [`GET /api/v1/tests/${TEST_ID}`]: refused(404, 'not_found', 'not_found') } });
    const missingCode = await missing.go(...ARGS);
    const missingErr = missing.deps.stderrText();
    expect(missing.posts()).toHaveLength(0);
    cleanup?.();
    const foreign = await setup({ routes: { [`GET /api/v1/tests/${TEST_ID}`]: refused(403, 'forbidden', 'not_a_member') } });
    expect(await foreign.go(...ARGS)).toBe(missingCode);
    expect(foreign.deps.stderrText()).toBe(missingErr);
    expect(missingCode).toBe(EXIT_FAILURE);
    expect(missingErr).toBe(`Test not found: ${TEST_ID}. Check the id in the Test's web address.\n`);
  });

  const refusals: Array<[string, Route, string]> = [
    ['a Test of another Project', refused(422, 'environment_invalid', 'environment_invalid'), 'The Test does not belong to the Project Checkout v2.'],
    ['a Test with no executable steps', refused(422, 'no_executable_steps', 'no_executable_steps'), 'The Test has nothing to run: add at least one ATC step'],
    ['an archived Test', refused(409, 'conflict', 'test_archived'), 'This Test is archived. Restore it in the web app before starting a Run.'],
    ['a read-only role', refused(403, 'forbidden', 'not_a_member'), 'You are not allowed to start Runs here'],
    ['too many requests', refused(429, 'rate_limited'), 'Too many requests.'],
    ['CI details already used with this key', refused(409, 'conflict', 'ci_context_conflict', 'This start_token already opened a run with different CI details.'), 'This start_token already opened a run with different CI details.'],
  ];
  for (const [situation, route, message] of refusals) {
    it(`refuses ${situation} with its own message and exit 1`, async () => {
      const s = await setup({ routes: { 'POST /api/v1/runs': route } });
      expect(await s.go(...ARGS, '--json')).toBe(EXIT_FAILURE);
      expect(s.deps.stderrText()).toContain(message);
      expect(s.deps.stdoutText()).toBe('');
    });
  }

  it('does not refuse an archived Test itself, so a retry key still returns its Run', async () => {
    const s = await setup({
      routes: {
        [`GET /api/v1/tests/${TEST_ID}`]: () => ({ status: 200, body: { test: { id: TEST_ID, archived_at: '2026-11-15T13:00:00Z' } } }),
        'POST /api/v1/runs': () => ({ status: 200, body: { run: runBody({ replayed: true }) } }),
      },
    });
    expect(await s.go(...ARGS, '--retry-key', 'nightly')).toBe(EXIT_OK);
    expect(s.deps.stdoutText()).toContain('Run already existed');
  });

  it('matches the environment name ignoring letter case and surrounding spaces', async () => {
    const s = await setup();
    expect(await s.go('--project', 'checkout-v2', '--test', TEST_ID, '--env', ' staging ')).toBe(EXIT_OK);
    expect(postBody(s.posts()[0]).environment_id).toBe(STAGING.id);
    expect(s.deps.stdoutText()).toContain('Environment: Staging');
  });

  it('keeps a long name with accents and spaces as one value', () => {
    const name = 'Pré-producción de la región Andina con datos reales';
    const env = { id: 'e3', name };
    expect(matchEnvironment([env], PROJECT, `  ${name.toUpperCase()} `)).toBe(env);
  });

  it('says to create a Workspace when the sign-in has none', async () => {
    const s = await setup({ signIn: { ...SIGN_IN, workspace: null } });
    expect(await s.go(...ARGS)).toBe(EXIT_FAILURE);
    expect(s.deps.stderrText()).toContain('You have no Workspace yet: create or join one in the web app');
    expect(s.api.requests).toHaveLength(0);
  });
});

describe('bunkai run start — sign-in and permissions (AC-04)', () => {
  const missingRunExecute = refused(403, 'forbidden', 'missing_capability', 'Missing required capability: run:execute');
  const missingAtcRead = refused(403, 'forbidden', 'missing_capability', 'Missing required capability: atc:read');
  const meRoute: Route = () => ({ status: 200, body: { workspaces: [WS], active_workspace_id: WS.id } });

  it('tells an earlier sign-in, made for reading only, to sign in again', async () => {
    const s = await setup({ routes: { 'POST /api/v1/runs': missingRunExecute } });
    expect(await s.go(...ARGS)).toBe(EXIT_FAILURE);
    expect(s.deps.stderrText()).toContain('This sign-in cannot start Runs');
    expect(s.deps.stderrText()).toContain('Run "bunkai auth login" to sign in again');
    expect(s.deps.stdoutText()).toBe('');
  });

  it('keeps the saved sign-in file as it was, so "bunkai atc list" still reads with it', async () => {
    const s = await setup({ routes: { 'POST /api/v1/runs': missingRunExecute } });
    const before = readFileSync(s.t.path, 'utf8');
    await s.go(...ARGS);
    expect(readFileSync(s.t.path, 'utf8')).toBe(before);
  });

  for (const [scope, routes] of [
    ['run:execute', { 'POST /api/v1/runs': missingRunExecute }],
    ['atc:read', { [`GET /api/v1/workspaces/${WS.id}/projects`]: missingAtcRead }],
  ] as Array<[string, Record<string, Route>]>) {
    it(`names both scopes when BUNKAI_TOKEN lacks ${scope}, and writes nothing`, async () => {
      const s = await setup({ signIn: null, env: { BUNKAI_TOKEN: 'bk_pat_ci' }, routes: { 'GET /api/v1/me': meRoute, ...routes } });
      expect(await s.go(...ARGS)).toBe(EXIT_FAILURE);
      expect(s.deps.stderrText()).toBe('The PAT in BUNKAI_TOKEN cannot start Runs: it needs both the atc:read and run:execute scopes. Create one with both in Settings.\n');
      expect(existsSync(s.t.path)).toBe(false);
    });
  }

  it('starts with a BUNKAI_TOKEN holding both scopes, in its default Workspace, writing nothing', async () => {
    const s = await setup({ signIn: null, env: { BUNKAI_TOKEN: 'bk_pat_ci', BUNKAI_API_URL: 'https://ci.bunkai.test' }, routes: { 'GET /api/v1/me': meRoute } });
    expect(await s.go(...ARGS, '--executor', 'ci')).toBe(EXIT_OK);
    expect(s.api.requests.every(r => r.headers.authorization === 'Bearer bk_pat_ci')).toBe(true);
    expect(s.deps.stdoutText()).toContain('Workspace:   Acme QA');
    expect(s.deps.stdoutText()).toContain('https://ci.bunkai.test/projects/checkout-v2/runs/');
    expect(existsSync(s.t.path)).toBe(false);
  });

  it('tells someone who never signed in to run "bunkai auth login" first', async () => {
    const s = await setup({ signIn: null });
    expect(await s.go(...ARGS)).toBe(EXIT_FAILURE);
    expect(s.deps.stderrText()).toBe(`${MSG_NOT_SIGNED_IN}\n`);
    expect(s.api.requests).toEqual([]);
  });

  it('sends a revoked saved PAT back to login, even when it stops working at the start', async () => {
    const s = await setup({ routes: { 'POST /api/v1/runs': refused(401, 'unauthorized') } });
    expect(await s.go(...ARGS)).toBe(EXIT_FAILURE);
    expect(s.deps.stderrText()).toBe(`${MSG_SIGN_IN_INVALID}\n`);
  });

  it('names BUNKAI_TOKEN when that PAT is revoked or expired', async () => {
    const s = await setup({ signIn: null, env: { BUNKAI_TOKEN: 'bk_pat_old' }, routes: { 'GET /api/v1/me': () => ({ status: 401, body: {} }) } });
    expect(await s.go(...ARGS)).toBe(EXIT_FAILURE);
    expect(s.deps.stderrText()).toBe(`${MSG_TOKEN_INVALID}\n`);
  });
});

describe('bunkai run start — usage (AC-05)', () => {
  const mistakes: Array<[string, string[]]> = [
    ['no --project', ['--test', TEST_ID, '--env', 'Staging']],
    ['no --test', ['--project', 'checkout-v2', '--env', 'Staging']],
    ['no --env', ['--project', 'checkout-v2', '--test', TEST_ID]],
    ['a --test that is not a UUID', ['--project', 'checkout-v2', '--test', '42', '--env', 'Staging']],
    ['a blank --env', ['--project', 'checkout-v2', '--test', TEST_ID, '--env', '  ']],
    ['an unknown --executor', [...ARGS, '--executor', 'robot']],
    ['a blank --retry-key', [...ARGS, '--retry-key', '   ']],
    ['a --retry-key of 201 characters', [...ARGS, '--retry-key', 'k'.repeat(201)]],
    ['an unknown option', [...ARGS, '--branch', 'main']],
  ];
  for (const [mistake, argv] of mistakes) {
    it(`refuses ${mistake} with the usage line, exit 2 and no request`, async () => {
      const s = await setup();
      expect(await s.go(...argv)).toBe(EXIT_USAGE);
      expect(s.deps.stderrText()).toContain('Usage: bunkai run start --project <slug|id> --test <id> --env <name> [options]');
      expect(s.deps.stdoutText()).toBe('');
      expect(s.api.requests).toEqual([]);
    });
  }

  it('accepts a retry key of 1 and of 200 characters as typed', async () => {
    for (const key of ['k', 'k'.repeat(200)]) {
      const s = await setup();
      expect(await s.go(...ARGS, '--retry-key', key)).toBe(EXIT_OK);
      expect(postBody(s.posts()[0]).start_token).toBe(key);
      cleanup?.();
    }
  });

  it('describes every option, an example, the exit codes and the idle close on --help', async () => {
    const s = await setup();
    expect(await s.go('--help')).toBe(EXIT_OK);
    const help = s.deps.stdoutText();
    for (const option of ['--project', '--test', '--env', '--executor', '--retry-key', '--json', '--help']) {
      expect(help).toContain(option);
    }
    expect(help).toContain('Example:\n  bunkai run start');
    expect(help).toMatch(/Exit codes:\n {2}0 .*\n {2}1 [\s\S]*\n {2}2 /);
    expect(help).toContain('60 minutes is closed automatically');
    expect(s.api.requests).toEqual([]);
  });
});

describe('shellQuote', () => {
  it('leaves a plain key alone and single-quotes anything the shell would split', () => {
    expect(shellQuote('nightly-2026-11-17')).toBe('nightly-2026-11-17');
    expect(shellQuote('it\'s $HOME')).toBe('\'it\'\\\'\'s $HOME\'');
  });
});
