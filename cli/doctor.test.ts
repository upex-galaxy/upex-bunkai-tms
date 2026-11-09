import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { legacyCredentialKeys, piTrustStatus, repoCheckRunsAppWideLegs, worktreeSetupAction } from './doctor.ts';

describe('worktreeSetupAction', () => {
  test('a provisioned worktree needs nothing', () => {
    expect(worktreeSetupAction({ envFile: true, deps: true, gitHooks: true })).toBeNull();
  });

  test('anything missing collapses into one worktree:provision action that names what is missing', () => {
    const action = worktreeSetupAction({ envFile: false, deps: true, gitHooks: false });
    expect(action?.target).toBe('bun run worktree:provision');
    expect(action?.hint).toContain('.env, .husky/_ (git hooks)');
    expect(action?.hint).not.toContain('node_modules');
  });
});

describe('legacyCredentialKeys', () => {
  const env = { JIRA_API_TOKEN: 'x', JIRA_URL: 'https://a.atlassian.net', JIRA_USERNAME: '  ' };

  test('greenfield: every retired name set in .env is a removal', () => {
    expect(legacyCredentialKeys(env, new Set())).toEqual({ remove: ['JIRA_URL', 'JIRA_API_TOKEN'], appOwned: [] });
  });

  test('adopted: a retired name the app declares as its own is never a removal', () => {
    expect(legacyCredentialKeys(env, new Set(['JIRA_API_TOKEN']))).toEqual({ remove: ['JIRA_URL'], appOwned: ['JIRA_API_TOKEN'] });
  });

  test('an empty value is not reported at all', () => {
    const out = legacyCredentialKeys(env, new Set(['JIRA_USERNAME']));
    expect([...out.remove, ...out.appOwned]).not.toContain('JIRA_USERNAME');
  });
});

describe('repoCheckRunsAppWideLegs', () => {
  test('the pre-scoping value is reported; the scoped one, a missing script and an app composition are not', () => {
    expect(repoCheckRunsAppWideLegs('bun run format:check && bun run lint:check && bun run types:check && bun run vars:check')).toBe(true);
    expect(repoCheckRunsAppWideLegs('bun scripts/tooling-check.ts repo && bun run vars:check')).toBe(false);
    expect(repoCheckRunsAppWideLegs(undefined)).toBe(false);
    expect(repoCheckRunsAppWideLegs('npm run ci')).toBe(false);
  });
});

describe('piTrustStatus', () => {
  const workspace = (trust?: unknown, settings?: unknown): { root: string, env: Record<string, string> } => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'pi-trust-')));
    const root = join(base, 'group', 'repo');
    const agentDir = join(base, 'agent');
    mkdirSync(root, { recursive: true });
    mkdirSync(agentDir, { recursive: true });
    if (trust !== undefined) { writeFileSync(join(agentDir, 'trust.json'), JSON.stringify(typeof trust === 'function' ? trust(base) : trust)); }
    if (settings !== undefined) { writeFileSync(join(agentDir, 'settings.json'), JSON.stringify(settings)); }
    return { root, env: { PI_CODING_AGENT_DIR: agentDir } };
  };

  test('the default on a fresh machine is to ask', () => {
    const { root, env } = workspace();
    expect(piTrustStatus(root, env)).toBe('ask');
  });

  test('defaultProjectTrust decides when nothing is saved', () => {
    const always = workspace(undefined, { defaultProjectTrust: 'always' });
    expect(piTrustStatus(always.root, always.env)).toBe('trusted');
    const never = workspace(undefined, { defaultProjectTrust: 'never' });
    expect(piTrustStatus(never.root, never.env)).toBe('declined');
  });

  test('the closest saved decision wins, a parent counts, and it beats the default', () => {
    const parent = workspace((base: string) => ({ [join(base, 'group')]: true }));
    expect(piTrustStatus(parent.root, parent.env)).toBe('trusted');
    const closer = workspace((base: string) => ({ [join(base, 'group')]: true, [join(base, 'group', 'repo')]: false }), { defaultProjectTrust: 'always' });
    expect(piTrustStatus(closer.root, closer.env)).toBe('declined');
  });

  test('no agent directory at all is unknown', () => {
    const { root } = workspace();
    expect(piTrustStatus(root, { PI_CODING_AGENT_DIR: join(root, 'nowhere') })).toBe('unknown');
  });
});
