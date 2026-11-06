import type { JiraCredentials } from './credentials';
import { jiraBasicAuthHeader } from './basic-auth';

// BK-1170 — "Test connection" for a workspace's Jira credentials. One read-only
// call that proves the site, the email and the token work together:
//
//   GET {site}/rest/api/3/myself
//
// One attempt, a hard time budget, no retry. The Authorization header must never
// follow a redirect to another host, so redirects are an error.
//
// Secret hygiene. The result is a closed set of `kind`s with constant copy. The
// response body is never read or returned; the email, the token and the host never
// leave this module. Type-only import of the credentials keeps this module free of
// server-only code, so it is unit-testable with an injected fetch.

export const CONNECTION_CHECK_TIMEOUT_MS = 5000;

export type JiraConnectionCheckKind
  = | 'unauthorized_401'
    | 'forbidden_403'
    | 'site_not_found'
    | 'jira_busy'
    | 'site_unreachable'
    | 'unexpected_status';

export type JiraConnectionCheckResult
  = | { ok: true }
    | { ok: false, reason: { kind: JiraConnectionCheckKind, message: string } };

export interface JiraConnectionCheckDeps {
  fetch?: typeof fetch
  timeoutMs?: number
}

const MESSAGES: Record<JiraConnectionCheckKind, string> = {
  unauthorized_401: 'Jira did not accept the email or the API token.',
  forbidden_403: 'Jira refused the token. Use a classic (unscoped) API token from id.atlassian.com and check the account can access this site.',
  site_not_found: 'That Jira site was not found. Check the site URL.',
  jira_busy: 'Jira is asking Bunkai to slow down. Try again in a few minutes.',
  site_unreachable: 'The Jira site could not be reached. Try again in a few minutes.',
  unexpected_status: 'Jira answered with an unexpected response. Try again in a few minutes.',
};

function fail(kind: JiraConnectionCheckKind): JiraConnectionCheckResult {
  return { ok: false, reason: { kind, message: MESSAGES[kind] } };
}

export async function checkJiraConnection(
  credentials: JiraCredentials,
  deps: JiraConnectionCheckDeps = {},
): Promise<JiraConnectionCheckResult> {
  const doFetch = deps.fetch ?? fetch;
  let response: Response;
  try {
    response = await doFetch(`${credentials.url.replace(/\/+$/, '')}/rest/api/3/myself`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: jiraBasicAuthHeader(credentials.email, credentials.token),
      },
      redirect: 'error',
      signal: AbortSignal.timeout(deps.timeoutMs ?? CONNECTION_CHECK_TIMEOUT_MS),
    });
  }
  catch {
    return fail('site_unreachable');
  }

  // The body is never consumed (it can echo request content); release it.
  response.body?.cancel().catch(() => {});

  if (response.status === 200) {
    return { ok: true };
  }
  if (response.status === 401) {
    return fail('unauthorized_401');
  }
  if (response.status === 403) {
    return fail('forbidden_403');
  }
  if (response.status === 404) {
    return fail('site_not_found');
  }
  if (response.status === 429) {
    return fail('jira_busy');
  }
  return fail('unexpected_status');
}
