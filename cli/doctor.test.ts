import { describe, expect, test } from 'bun:test';

import { legacyCredentialKeys, repoCheckRunsAppWideLegs, worktreeSetupAction } from './doctor.ts';

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
