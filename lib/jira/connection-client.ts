// BK-1170 — the Jira connection screen's three calls (save, disconnect, test) and
// the translation of every answer into a closed outcome. Browser-side only, and it
// never logs or stores a value it is given: the API token lives in the form's
// state for as long as the user is typing and is dropped after a save.

export interface JiraConnectionView {
  siteUrl: string
  email: string
  updatedAt: string
}

export type JiraCheckKind
  = | 'unauthorized_401'
    | 'forbidden_403'
    | 'site_not_found'
    | 'jira_busy'
    | 'site_unreachable'
    | 'unexpected_status'
    | 'not_connected';

export type SaveConnectionOutcome
  = | { kind: 'saved', connection: JiraConnectionView }
    | { kind: 'invalid', reason: string, message: string }
    | { kind: 'forbidden', message: string }
    | { kind: 'error', message: string };

export type DeleteConnectionOutcome
  = | { kind: 'deleted' }
    | { kind: 'forbidden', message: string }
    | { kind: 'error', message: string };

export type TestConnectionOutcome
  = | { kind: 'result', ok: true }
    | { kind: 'result', ok: false, failure: JiraCheckKind | 'unknown', message: string }
    | { kind: 'busy', message: string }
    | { kind: 'forbidden', message: string }
    | { kind: 'error', message: string };

interface ErrorBody {
  error?: { message?: string, details?: { reason?: string } }
}

const NETWORK_MESSAGE = 'Could not reach Bunkai. Check your connection and try again.';
const GENERIC_MESSAGE = 'Something went wrong. Try again.';

function connectionUrl(workspaceId: string, suffix = ''): string {
  return `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/jira-connection${suffix}`;
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function errorOf(json: unknown): { message: string, reason: string | undefined } {
  const error = (json as ErrorBody | null)?.error;
  return { message: error?.message ?? GENERIC_MESSAGE, reason: error?.details?.reason };
}

export interface ConnectionValues {
  siteUrl: string
  email: string
  apiToken: string
}

export async function saveJiraConnection(args: { workspaceId: string, values: ConnectionValues }): Promise<SaveConnectionOutcome> {
  const { siteUrl, email, apiToken } = args.values;
  let response: Response;
  try {
    response = await fetch(connectionUrl(args.workspaceId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        site_url: siteUrl.trim(),
        email: email.trim(),
        ...(apiToken === '' ? {} : { api_token: apiToken }),
      }),
    });
  }
  catch {
    return { kind: 'error', message: NETWORK_MESSAGE };
  }
  const json = await readJson(response);
  if (response.ok) {
    const stored = (json as { jira_connection?: { site_url?: string, email?: string, updated_at?: string } } | null)?.jira_connection;
    if (!stored || typeof stored.site_url !== 'string' || typeof stored.email !== 'string' || typeof stored.updated_at !== 'string') {
      return { kind: 'error', message: GENERIC_MESSAGE };
    }
    return { kind: 'saved', connection: { siteUrl: stored.site_url, email: stored.email, updatedAt: stored.updated_at } };
  }
  const { message, reason } = errorOf(json);
  if (response.status === 422 && reason !== undefined) {
    return { kind: 'invalid', reason, message };
  }
  if (response.status === 403) {
    return { kind: 'forbidden', message };
  }
  return { kind: 'error', message };
}

export async function deleteJiraConnection(args: { workspaceId: string }): Promise<DeleteConnectionOutcome> {
  let response: Response;
  try {
    response = await fetch(connectionUrl(args.workspaceId), { method: 'DELETE' });
  }
  catch {
    return { kind: 'error', message: NETWORK_MESSAGE };
  }
  if (response.ok) {
    return { kind: 'deleted' };
  }
  const { message, reason } = errorOf(await readJson(response));
  // Already gone (another tab, another admin): the end state the user asked for.
  if (response.status === 404 && reason === 'not_connected') {
    return { kind: 'deleted' };
  }
  if (response.status === 403) {
    return { kind: 'forbidden', message };
  }
  return { kind: 'error', message };
}

// `values: null` tests the stored connection (empty body); otherwise all three
// fields travel together, as the route requires.
export async function testJiraConnection(args: { workspaceId: string, values: ConnectionValues | null }): Promise<TestConnectionOutcome> {
  const body = args.values
    ? { site_url: args.values.siteUrl.trim(), email: args.values.email.trim(), api_token: args.values.apiToken.trim() }
    : {};
  let response: Response;
  try {
    response = await fetch(connectionUrl(args.workspaceId, '/check'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  catch {
    return { kind: 'error', message: NETWORK_MESSAGE };
  }
  const json = await readJson(response);
  if (response.ok) {
    const parsed = json as { ok?: boolean, reason?: { kind?: string, message?: string } | null } | null;
    if (parsed?.ok === true) {
      return { kind: 'result', ok: true };
    }
    if (parsed?.ok === false) {
      return {
        kind: 'result',
        ok: false,
        failure: (parsed.reason?.kind as JiraCheckKind | undefined) ?? 'unknown',
        message: parsed.reason?.message ?? GENERIC_MESSAGE,
      };
    }
    return { kind: 'error', message: GENERIC_MESSAGE };
  }
  const { message } = errorOf(json);
  if (response.status === 429) {
    return { kind: 'busy', message };
  }
  if (response.status === 403) {
    return { kind: 'forbidden', message };
  }
  return { kind: 'error', message };
}

// Friendly copy per failure kind. The 403 keeps the server text: it already says
// to use a classic, unscoped token.
export function checkFailureCopy(failure: JiraCheckKind | 'unknown', serverMessage: string): string {
  switch (failure) {
    case 'unauthorized_401':
      return 'Jira did not accept this email and API token. Check both and try again.';
    case 'forbidden_403':
      return serverMessage;
    case 'site_not_found':
      return 'Bunkai could not find a Jira site at that address. Check the site URL.';
    case 'jira_busy':
      return 'Jira is asking Bunkai to slow down. Try again in a few minutes.';
    case 'site_unreachable':
      return 'Jira could not be reached. Try again in a few minutes.';
    case 'unexpected_status':
      return 'Jira answered in a way Bunkai did not expect. Try again in a few minutes.';
    case 'not_connected':
      return 'No Jira connection is saved yet. Fill in the fields and save first.';
    default:
      return serverMessage;
  }
}

// Loose "did the site change" test for the screen's hint only; the server remains
// the authority on when a token is required.
export function sameSite(a: string, b: string): boolean {
  const clean = (value: string) => value.trim().toLowerCase().replace(/\/+$/, '');
  return clean(a) === clean(b);
}
