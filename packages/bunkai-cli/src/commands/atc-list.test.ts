import type { SavedSignIn } from '../credentials';
import type { Route } from '../testing/fakes';
import { chmodSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'bun:test';
import { writeSignIn } from '../credentials';
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, MSG_NOT_SIGNED_IN, MSG_SIGN_IN_INVALID, MSG_TOKEN_INVALID } from '../errors';
import { run } from '../run';
import { fakeApi, fakeDeps, tempConfigDir } from '../testing/fakes';
import { matchModule } from './atc-list';

// BK-1900 AC-02 (find ATCs), AC-03 (signed-in state) and the refined scenarios.

const WS = { id: '0d269820-61bc-46a6-ab76-d5bd68a55383', slug: 'acme-qa', name: 'Acme QA' };
const PROJECT = { id: 'a1111111-1111-4111-8111-111111111111', slug: 'checkout-v2', name: 'Checkout v2', created_at: '2026-11-01T00:00:00Z' };
const TOKEN = 'bk_pat_saved_token';

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

const ATCS = [
  { id: 'atc-1', slug: 'login-with-valid-credentials', title: 'Login with valid credentials', layer: 'UI', status: 'active', module_path: 'auth/login' },
  { id: 'atc-2', slug: 'login-api-rejects-bad-token', title: 'Login API rejects a bad token', layer: 'API', status: 'active', module_path: 'auth' },
];

const MODULES = [
  { id: 'm-pay', path: 'payments', name: 'Payments' },
  { id: 'm-cards', path: 'payments/cards', name: 'Cards' },
  { id: 'm-cards-2', path: 'billing/cards', name: 'Cards' },
];

function projectsRoute(projects: unknown[] = [PROJECT]): Route {
  return req => ({ status: 200, body: { projects: projects.filter(p => !req.url.searchParams.get('slug') || (p as { slug: string }).slug === req.url.searchParams.get('slug')) } });
}

function searchRoute(items: unknown[] = ATCS): Route {
  return () => ({ status: 200, body: { items } });
}

const BASE_ROUTES: Record<string, Route> = {
  [`GET /api/v1/workspaces/${WS.id}/projects`]: projectsRoute(),
  [`GET /api/v1/projects/${PROJECT.id}/modules`]: () => ({ status: 200, body: { modules: MODULES, user_stories: [], acceptance_criteria: [], archived_atcs: [] } }),
  'GET /api/v1/atcs/search': searchRoute(),
};

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
  return { t, api, deps, go: async (...argv: string[]) => run(['atc', 'list', ...argv], deps) };
}

describe('bunkai atc list — finding ATCs', () => {
  it('lists matching ATCs as a table of title, layer and Module, best first', async () => {
    const s = await setup();
    expect(await s.go('--project', 'checkout-v2', '--query', 'login')).toBe(EXIT_OK);
    const lines = s.deps.stdoutText().trimEnd().split('\n');
    expect(lines[0]).toMatch(/^TITLE\s+LAYER\s+MODULE$/);
    expect(lines[1]).toMatch(/^Login with valid credentials\s+UI\s+auth\/login$/);
    expect(lines[2]).toMatch(/^Login API rejects a bad token\s+API\s+auth$/);
  });

  it('sends the saved PAT, the Project id and the text to the search', async () => {
    const s = await setup();
    await s.go('--project', 'checkout-v2', '--query', 'login');
    const lookup = s.api.requests.find(r => r.url.pathname.endsWith('/projects'));
    expect(lookup?.url.pathname).toBe(`/api/v1/workspaces/${WS.id}/projects`);
    expect(lookup?.url.searchParams.get('slug')).toBe('checkout-v2');
    const search = s.api.requests.find(r => r.url.pathname === '/api/v1/atcs/search');
    expect(search?.url.searchParams.get('query')).toBe('login');
    expect(search?.url.searchParams.get('project_id')).toBe(PROJECT.id);
    expect(search?.url.searchParams.get('limit')).toBe('20');
    expect(search?.url.searchParams.has('module_id')).toBe(false);
    expect(s.api.requests.every(r => r.headers.authorization === `Bearer ${TOKEN}`)).toBe(true);
    expect(s.api.requests.every(r => r.url.origin === 'https://bunkai.test')).toBe(true);
  });

  it('accepts a Project id as well as a slug', async () => {
    const s = await setup();
    expect(await s.go('--project', PROJECT.id, '--query', 'login')).toBe(EXIT_OK);
    expect(s.api.requests[0]?.url.searchParams.has('slug')).toBe(false);
  });

  it('narrows to a Module and its sub-Modules by passing that Module to the search', async () => {
    const s = await setup();
    expect(await s.go('--project', 'checkout-v2', '--query', 'login', '--module', 'Payments')).toBe(EXIT_OK);
    const search = s.api.requests.find(r => r.url.pathname === '/api/v1/atcs/search');
    expect(search?.url.searchParams.get('module_id')).toBe('m-pay');
  });

  it('keeps text with quotes and accents as typed', async () => {
    const s = await setup();
    await s.go('--project', 'checkout-v2', '--query', 'café "rápido"');
    const search = s.api.requests.find(r => r.url.pathname === '/api/v1/atcs/search');
    expect(search?.url.searchParams.get('query')).toBe('café "rápido"');
  });

  it('notes on stderr when the result fills the limit', async () => {
    const s = await setup();
    expect(await s.go('--project', 'checkout-v2', '--query', 'login', '--limit', '2')).toBe(EXIT_OK);
    expect(s.deps.stderrText()).toContain('Showing the first 2 matches');
    expect(s.deps.stdoutText()).not.toContain('Showing');
  });
});

describe('bunkai atc list — output a script can read', () => {
  it('prints only a JSON array of the same ATCs on stdout with --json', async () => {
    const s = await setup();
    expect(await s.go('--project', 'checkout-v2', '--query', 'login', '--json', '--limit', '2')).toBe(EXIT_OK);
    expect(JSON.parse(s.deps.stdoutText())).toEqual(ATCS);
    // The truncation note still goes to stderr, never into the JSON stream.
    expect(s.deps.stderrText()).toContain('Showing the first 2 matches');
  });

  it('answers "No ATCs found" with exit 0, and [] with --json', async () => {
    const empty = await setup({ routes: { 'GET /api/v1/atcs/search': searchRoute([]) } });
    expect(await empty.go('--project', 'checkout-v2', '--query', 'zzz')).toBe(EXIT_OK);
    expect(empty.deps.stdoutText()).toBe('No ATCs found.\n');
    cleanup?.();

    const json = await setup({ routes: { 'GET /api/v1/atcs/search': searchRoute([]) } });
    expect(await json.go('--project', 'checkout-v2', '--query', 'zzz', '--json')).toBe(EXIT_OK);
    expect(JSON.parse(json.deps.stdoutText())).toEqual([]);
    expect(json.deps.stderrText()).toBe('');
  });

  it('prints nothing on stdout when it fails with --json', async () => {
    const s = await setup({ routes: { 'GET /api/v1/atcs/search': () => ({ status: 401, body: {} }) } });
    expect(await s.go('--project', 'checkout-v2', '--query', 'login', '--json')).toBe(EXIT_FAILURE);
    expect(s.deps.stdoutText()).toBe('');
  });
});

describe('bunkai atc list — Projects and Modules that cannot be found', () => {
  it('answers a Project of another Workspace exactly like one that does not exist', async () => {
    // The API answers both with the same empty list (RLS); the CLI must not
    // add any difference of its own.
    const foreign = await setup({ routes: { [`GET /api/v1/workspaces/${WS.id}/projects`]: projectsRoute([]) } });
    const foreignCode = await foreign.go('--project', 'their-project', '--query', 'login');
    const foreignErr = foreign.deps.stderrText();
    cleanup?.();
    const missing = await setup({ routes: { [`GET /api/v1/workspaces/${WS.id}/projects`]: projectsRoute([]) } });
    const missingCode = await missing.go('--project', 'their-project', '--query', 'login');
    expect(foreignCode).toBe(EXIT_FAILURE);
    expect(missingCode).toBe(foreignCode);
    expect(missing.deps.stderrText()).toBe(foreignErr);
    expect(foreignErr).toContain('Project not found: "their-project"');
    expect(missing.api.requests.some(r => r.url.pathname === '/api/v1/atcs/search')).toBe(false);
  });

  it('says "Module not found" instead of an empty list for an unknown Module', async () => {
    const s = await setup();
    expect(await s.go('--project', 'checkout-v2', '--query', 'login', '--module', 'Nope')).toBe(EXIT_FAILURE);
    expect(s.deps.stderrText()).toContain('Module not found: "Nope"');
    expect(s.deps.stdoutText()).toBe('');
  });

  it('lists the paths when a Module name is shared', async () => {
    const s = await setup();
    expect(await s.go('--project', 'checkout-v2', '--query', 'login', '--module', 'cards')).toBe(EXIT_FAILURE);
    expect(s.deps.stderrText()).toContain('More than one Module is named "cards"');
    expect(s.deps.stderrText()).toContain('billing/cards');
    expect(s.deps.stderrText()).toContain('payments/cards');
  });

  it('says to create a Workspace when the sign-in has none', async () => {
    const s = await setup({ signIn: { ...SIGN_IN, workspace: null } });
    expect(await s.go('--project', 'checkout-v2', '--query', 'login')).toBe(EXIT_FAILURE);
    expect(s.deps.stderrText()).toContain('You have no Workspace yet');
  });
});

describe('matchModule', () => {
  it('prefers an exact path, then a unique name, case-insensitively', () => {
    expect(matchModule(MODULES, 'payments/cards').id).toBe('m-cards');
    expect(matchModule(MODULES, '/Payments/Cards/').id).toBe('m-cards');
    expect(matchModule(MODULES, 'PAYMENTS').id).toBe('m-pay');
  });
});

describe('bunkai atc list — signed-in state', () => {
  it('tells someone who never signed in to run "bunkai auth login"', async () => {
    const s = await setup({ signIn: null });
    expect(await s.go('--project', 'checkout-v2', '--query', 'login')).toBe(EXIT_FAILURE);
    expect(s.deps.stderrText()).toBe(`${MSG_NOT_SIGNED_IN}\n`);
    expect(s.api.requests).toEqual([]);
  });

  it('sends a revoked PAT back to login', async () => {
    const s = await setup({ routes: { [`GET /api/v1/workspaces/${WS.id}/projects`]: () => ({ status: 401, body: { error: { code: 'unauthorized' } } }) } });
    expect(await s.go('--project', 'checkout-v2', '--query', 'login')).toBe(EXIT_FAILURE);
    expect(s.deps.stderrText()).toBe(`${MSG_SIGN_IN_INVALID}\n`);
  });

  it('gives the same answer when the PAT stops working in the middle of the command', async () => {
    const s = await setup({ routes: { 'GET /api/v1/atcs/search': () => ({ status: 401, body: {} }) } });
    expect(await s.go('--project', 'checkout-v2', '--query', 'login')).toBe(EXIT_FAILURE);
    expect(s.deps.stderrText()).toBe(`${MSG_SIGN_IN_INVALID}\n`);
    expect(s.deps.stdoutText()).toBe('');
  });

  it('sends an expired saved PAT back to login without calling the API', async () => {
    const s = await setup({ signIn: { ...SIGN_IN, token_expires_at: '2026-11-01T00:00:00Z' } });
    expect(await s.go('--project', 'checkout-v2', '--query', 'login')).toBe(EXIT_FAILURE);
    expect(s.deps.stderrText()).toBe(`${MSG_SIGN_IN_INVALID}\n`);
    expect(s.api.requests).toEqual([]);
  });

  it('warns when the saved sign-in file can be read by others', async () => {
    if (process.platform === 'win32') {
      return;
    }
    const s = await setup();
    chmodSync(s.t.path, 0o644);
    expect(await s.go('--project', 'checkout-v2', '--query', 'login')).toBe(EXIT_OK);
    expect(s.deps.stderrText()).toContain('can be read by other users');
  });
});

describe('bunkai atc list — BUNKAI_TOKEN (CI)', () => {
  const meRoute: Route = () => ({ status: 200, body: { workspaces: [WS], active_workspace_id: WS.id } });

  it('uses BUNKAI_TOKEN instead of the saved sign-in, with no file at all', async () => {
    const s = await setup({ signIn: null, env: { BUNKAI_TOKEN: 'bk_pat_ci', BUNKAI_API_URL: 'https://ci.bunkai.test' }, routes: { 'GET /api/v1/me': meRoute } });
    expect(await s.go('--project', 'checkout-v2', '--query', 'login', '--json')).toBe(EXIT_OK);
    expect(s.api.requests.every(r => r.headers.authorization === 'Bearer bk_pat_ci')).toBe(true);
    expect(s.api.requests.every(r => r.url.origin === 'https://ci.bunkai.test')).toBe(true);
    expect(JSON.parse(s.deps.stdoutText())).toEqual(ATCS);
  });

  it('names BUNKAI_TOKEN when that PAT is refused', async () => {
    const s = await setup({ signIn: null, env: { BUNKAI_TOKEN: 'bk_pat_revoked' }, routes: { 'GET /api/v1/me': () => ({ status: 401, body: {} }) } });
    expect(await s.go('--project', 'checkout-v2', '--query', 'login')).toBe(EXIT_FAILURE);
    expect(s.deps.stderrText()).toBe(`${MSG_TOKEN_INVALID}\n`);
  });
});

describe('bunkai atc list — usage', () => {
  it('refuses an empty text plainly before sending anything', async () => {
    const s = await setup();
    expect(await s.go('--project', 'checkout-v2', '--query', '')).toBe(EXIT_FAILURE);
    expect(s.deps.stderrText()).toBe('A search text is required: --query <text>.\n');
    expect(s.api.requests).toEqual([]);
  });

  it('refuses a blank text and a missing one the same way', async () => {
    const blank = await setup();
    expect(await blank.go('--project', 'checkout-v2', '--query', '   ')).toBe(EXIT_FAILURE);
    expect(blank.deps.stderrText()).toBe('A search text is required: --query <text>.\n');
  });

  it('requires a Project', async () => {
    const s = await setup();
    expect(await s.go('--query', 'login')).toBe(EXIT_USAGE);
  });

  it('refuses a --limit outside 1..50', async () => {
    for (const limit of ['0', '51', '2.5', 'ten']) {
      const s = await setup();
      expect(await s.go('--project', 'checkout-v2', '--query', 'login', '--limit', limit)).toBe(EXIT_USAGE);
      cleanup?.();
    }
  });

  it('prints its usage on --help', async () => {
    const s = await setup();
    expect(await s.go('--help')).toBe(EXIT_OK);
    expect(s.deps.stdoutText()).toContain('Usage: bunkai atc list');
  });
});
