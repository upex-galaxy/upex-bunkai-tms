import { ApiError } from '@lib/api/error-envelope';
import { env } from '@lib/env';
import { DESTINATION_KEY_PATTERN, ISSUE_TYPE_MAX, TRACKER_SETTINGS_MESSAGES } from '@lib/tracker-settings/validation';

// BK-371 — the connection check behind "Run connection check" and the
// check-on-save of a sync-ON save. It proves four things and creates nothing:
// Jira accepts the Bunkai connection, the destination project exists and is
// visible, the connection may create issues there, and the issue type exists
// there (PO Q2). One read-only call, one attempt, a hard time budget and no
// retry (T3): `searchIssues` in `client.ts` sleeps through 429s for ~31 s and
// must not be reused here.
//
//   GET {ATLASSIAN_URL}/rest/api/3/issue/createmeta/{KEY}/issuetypes
//
// That endpoint lists the issue types the CONNECTION may create in the project,
// so a missing type covers "not there" and "not allowed" alike.
//
// Secret hygiene. The result is a closed set of `kind`s with constant copy; only
// `{KEY}` (regex-validated) and `{NAME}` (typed, 1-60 chars, rendered as text)
// are interpolated. The response body is parsed only on a 200 and only to find
// the matching issue type name; it is never returned or logged, and the host,
// the email and the token never leave this module. 404 and 403 share ONE kind so
// the API cannot be used to learn whether a Jira project exists.

export const CHECK_TIMEOUT_MS = 5000;
export const ISSUE_TYPE_PAGE_SIZE = 200;

export type ProjectCheckKind
  = | 'not_set_up'
    | 'credential_rejected'
    | 'project_inaccessible'
    | 'issue_type_missing'
    | 'unreachable'
    | 'jira_busy';

export type ProjectCheckResult
  = | { ok: true, issueTypeName: string }
    | { ok: false, kind: ProjectCheckKind, message: string };

export interface JiraCredentials {
  url: string
  email: string
  token: string
}

export interface ProjectCheckDeps {
  fetch?: typeof fetch
  credentials?: JiraCredentials | null
  timeoutMs?: number
}

const FIXED_MESSAGES = {
  not_set_up: 'Jira is not set up on this deployment.',
  credential_rejected: 'Jira did not accept the Bunkai connection.',
  unreachable: 'Jira could not be reached. Try again in a few minutes.',
  jira_busy: 'Jira is asking Bunkai to slow down. Try again in a few minutes.',
} as const;

function fail(kind: 'not_set_up' | 'credential_rejected' | 'unreachable' | 'jira_busy'): ProjectCheckResult {
  return { ok: false, kind, message: FIXED_MESSAGES[kind] };
}

function envCredentials(): JiraCredentials | null {
  const { ATLASSIAN_URL: url, ATLASSIAN_EMAIL: email, ATLASSIAN_API_TOKEN: token } = env;
  return url && email && token ? { url, email, token } : null;
}

interface IssueTypesBody {
  issueTypes?: unknown
  values?: unknown
  total?: unknown
}

// Jira has answered this endpoint with `issueTypes` and with `values` across API
// generations. Anything else is an unknown shape and degrades to `unreachable`.
function readIssueTypes(body: unknown): { names: string[], truncated: boolean } | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const { issueTypes, values, total } = body as IssueTypesBody;
  const list = Array.isArray(issueTypes) ? issueTypes : Array.isArray(values) ? values : null;
  if (list === null) {
    return null;
  }
  const names = list.flatMap((item) => {
    const name = (item as { name?: unknown } | null)?.name;
    return typeof name === 'string' ? [name] : [];
  });
  return { names, truncated: typeof total === 'number' && total > list.length };
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  }
  catch {
    return null;
  }
}

export async function checkJiraDestination(
  args: { projectKey: string, issueTypeName: string },
  deps: ProjectCheckDeps = {},
): Promise<ProjectCheckResult> {
  // Defensive re-validation: the caller already validated, but no request may be
  // built from a malformed key or type (a free-text key in a URL is an injection
  // path), whatever the caller did.
  if (!DESTINATION_KEY_PATTERN.test(args.projectKey)) {
    throw new ApiError('validation_failed', TRACKER_SETTINGS_MESSAGES.invalid_destination_key, {
      details: { reason: 'invalid_destination_key' },
    });
  }
  const wanted = args.issueTypeName.trim();
  if (wanted.length < 1 || wanted.length > ISSUE_TYPE_MAX) {
    throw new ApiError('validation_failed', TRACKER_SETTINGS_MESSAGES.invalid_issue_type, {
      details: { reason: 'invalid_issue_type' },
    });
  }

  const credentials = deps.credentials === undefined ? envCredentials() : deps.credentials;
  if (!credentials) {
    return fail('not_set_up');
  }

  const doFetch = deps.fetch ?? fetch;
  const base = credentials.url.replace(/\/+$/, '');
  const url = `${base}/rest/api/3/issue/createmeta/${encodeURIComponent(args.projectKey)}/issuetypes?maxResults=${ISSUE_TYPE_PAGE_SIZE}`;

  let response: Response;
  try {
    response = await doFetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Basic ${btoa(`${credentials.email}:${credentials.token}`)}`,
      },
      // The Authorization header must never follow a redirect to another host.
      redirect: 'error',
      signal: AbortSignal.timeout(deps.timeoutMs ?? CHECK_TIMEOUT_MS),
    });
  }
  catch {
    // Timeout, DNS, TLS, connection reset, refused redirect: all "could not be reached".
    return fail('unreachable');
  }

  if (response.status === 401) {
    return fail('credential_rejected');
  }
  if (response.status === 403 || response.status === 404) {
    return {
      ok: false,
      kind: 'project_inaccessible',
      message: `Bunkai cannot file issues in Jira project ${args.projectKey}: it does not exist or the connection has no access.`,
    };
  }
  if (response.status === 429) {
    return fail('jira_busy');
  }
  if (response.status !== 200) {
    return fail('unreachable');
  }

  const parsed = readIssueTypes(await parseJson(response));
  if (parsed === null) {
    return fail('unreachable');
  }

  const match = parsed.names.find(name => name.trim().toLowerCase() === wanted.toLowerCase());
  if (match !== undefined) {
    // Decision C (AI Tech Lead): a passing check stores Jira's own spelling.
    const trimmed = match.trim();
    const issueTypeName = trimmed.length >= 1 && trimmed.length <= ISSUE_TYPE_MAX ? trimmed : wanted;
    return { ok: true, issueTypeName };
  }
  // More types exist than this one page returned: "not found" would be a guess.
  if (parsed.truncated) {
    return fail('unreachable');
  }
  return {
    ok: false,
    kind: 'issue_type_missing',
    message: `Issue type ${wanted} was not found in ${args.projectKey}.`,
  };
}
