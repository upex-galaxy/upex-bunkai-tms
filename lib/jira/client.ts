// Typed Jira Cloud REST v3 search client (BK-17). Server-only network module:
// reads Atlassian credentials from `@lib/env` and talks to the `/search/jql`
// endpoint via the global `fetch`. Kept pure-ish — no React/Next/DB imports, the
// only side effects are the HTTP call and the backoff `sleep`. No unit test: it
// hits the network; integration coverage lives with the import worker.

import type { AdfNode } from './adf-to-markdown';
import { env } from '@lib/env';

export interface JiraComponent {
  name: string
}

export interface JiraIssueFields {
  summary: string
  description: AdfNode | null
  components: JiraComponent[]
  issuetype: { name: string }
}

export interface JiraIssue {
  key: string
  fields: JiraIssueFields
}

export interface JiraSearchResult {
  issues: JiraIssue[]
  nextPageToken: string | null
  isLast: boolean
}

// Thrown when credentials are missing or Jira answers 401/403. Callers map this
// to the `jira_unauthorized` import error code.
export class JiraAuthError extends Error {}

// Thrown for any other non-ok Jira response (carries the HTTP status when known).
export class JiraError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

interface SearchParams {
  jql: string
  pageToken?: string | null
  maxResults?: number
}

// Shape of the raw JSON we read off the wire. Everything is optional/loose so we
// narrow defensively before exposing the normalized `JiraSearchResult`.
interface RawJiraComponent {
  name?: string
}

interface RawJiraFields {
  summary?: string
  description?: AdfNode | null
  components?: RawJiraComponent[]
  issuetype?: { name?: string }
}

interface RawJiraIssue {
  key?: string
  fields?: RawJiraFields
}

interface RawSearchResponse {
  issues?: RawJiraIssue[]
  nextPageToken?: string | null
  isLast?: boolean
}

const SEARCH_FIELDS = ['summary', 'description', 'components', 'issuetype'];
const DEFAULT_MAX_RESULTS = 100;
// Exponential backoff schedule for 429s (ms). Length also caps the retry count.
const BACKOFF_SCHEDULE = [1000, 2000, 4000, 8000, 16000];

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Honor a numeric `Retry-After` header (seconds) when present; otherwise fall
// back to the scheduled delay for this attempt.
function retryDelayMs(response: Response, attempt: number): number {
  const header = response.headers.get('Retry-After');
  if (header !== null) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }
  }
  return BACKOFF_SCHEDULE[attempt];
}

function normalizeIssue(raw: RawJiraIssue): JiraIssue {
  const fields = raw.fields ?? {};
  return {
    key: raw.key ?? '',
    fields: {
      summary: fields.summary ?? '',
      description: fields.description ?? null,
      components: (fields.components ?? []).map(component => ({ name: component.name ?? '' })),
      issuetype: { name: fields.issuetype?.name ?? '' },
    },
  };
}

// Run a JQL search against Jira Cloud, returning one normalized page. Retries
// 429s with exponential backoff; throws `JiraAuthError` for auth failures and
// `JiraError` for any other non-ok response.
export async function searchIssues(params: SearchParams): Promise<JiraSearchResult> {
  const { jql, pageToken, maxResults } = params;
  const url = env.ATLASSIAN_URL;
  const email = env.ATLASSIAN_EMAIL;
  const token = env.ATLASSIAN_API_TOKEN;

  if (!url || !email || !token) {
    throw new JiraAuthError('Jira credentials are not configured.');
  }

  const authorization = `Basic ${btoa(`${email}:${token}`)}`;
  const body = JSON.stringify({
    jql,
    maxResults: maxResults ?? DEFAULT_MAX_RESULTS,
    fields: SEARCH_FIELDS,
    ...(pageToken ? { nextPageToken: pageToken } : {}),
  });

  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${url}/rest/api/3/search/jql`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': authorization,
      },
      body,
    });

    if (response.status === 401 || response.status === 403) {
      throw new JiraAuthError(`Jira authentication failed: ${response.status}`);
    }

    if (response.status === 429) {
      if (attempt >= BACKOFF_SCHEDULE.length) {
        throw new JiraError('Jira rate limit exceeded', 429);
      }
      await sleep(retryDelayMs(response, attempt));
      continue;
    }

    if (!response.ok) {
      throw new JiraError(`Jira search failed: ${response.status}`, response.status);
    }

    const json = (await response.json()) as RawSearchResponse;
    return {
      issues: (json.issues ?? []).map(normalizeIssue),
      nextPageToken: json.nextPageToken ?? null,
      isLast: json.isLast === true || !json.nextPageToken,
    };
  }
}
