import { describe, expect, it, mock } from 'bun:test';

void mock.module('server-only', () => ({}));
const { loadWorkspaceJiraCredentials, hasWorkspaceJiraConnection, JiraNotConnectedError } = await import('./credentials');
const { JiraAuthError } = await import('./client');

// BK-1170 — the credentials loader against a fake admin client.

function rpcAdmin(answer: { data: unknown, error: { code?: string, message: string } | null }) {
  return { rpc: async () => answer } as never;
}

describe('loadWorkspaceJiraCredentials', () => {
  it('returns the credentials with a re-validated site URL', async () => {
    const admin = rpcAdmin({ data: { site_url: 'https://acme.atlassian.net', email: 'qa@acme.test', token: 't' }, error: null });
    expect(await loadWorkspaceJiraCredentials(admin, 'W1')).toEqual({ url: 'https://acme.atlassian.net', email: 'qa@acme.test', token: 't' });
  });

  it('is null when there is no connection or a stored host that fails validation, and throws when the read itself fails', async () => {
    expect(await loadWorkspaceJiraCredentials(rpcAdmin({ data: null, error: null }), 'W1')).toBeNull();
    let threw = false;
    try {
      await loadWorkspaceJiraCredentials(rpcAdmin({ data: null, error: { code: 'X', message: 'boom' } }), 'W1');
    }
    catch {
      threw = true;
    }
    expect(threw).toBe(true);
    const bad = rpcAdmin({ data: { site_url: 'https://evil.example.com', email: 'a@b.c', token: 't' }, error: null });
    expect(await loadWorkspaceJiraCredentials(bad, 'W1')).toBeNull();
  });
});

describe('hasWorkspaceJiraConnection', () => {
  const countAdmin = (count: number | null, error: unknown = null) => ({
    from: () => ({ select: () => ({ eq: async () => ({ count, error }) }) }),
  }) as never;

  it('is true only when a row exists, without decrypting', async () => {
    expect(await hasWorkspaceJiraConnection(countAdmin(1), 'W1')).toBe(true);
    expect(await hasWorkspaceJiraConnection(countAdmin(0), 'W1')).toBe(false);
    expect(await hasWorkspaceJiraConnection(countAdmin(null, { code: 'X' }), 'W1')).toBe(false);
  });
});

describe('JiraNotConnectedError', () => {
  it('is a JiraAuthError carrying jira_not_connected', () => {
    const error = new JiraNotConnectedError();
    expect(error).toBeInstanceOf(JiraAuthError);
    expect(error.code).toBe('jira_not_connected');
  });
});
