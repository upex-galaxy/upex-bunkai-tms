// BK-1949 — the Settings > Account display-name form's two calls, translated
// into a closed outcome the form switches on. Browser-side only; the same
// shape as the Jira connection client (`lib/jira/connection-client.ts`).

import { DISPLAY_NAME_COPY } from '@lib/account/display-name';

const ENDPOINT = '/api/v1/me/display-name';

export type DisplayNameOutcome
  = | { kind: 'saved', displayName: string | null }
  // 422: the server refused the name; the message is the PO5 copy.
    | { kind: 'invalid', message: string }
  // 401: the session ended (another tab signed out, or it expired).
    | { kind: 'signed-out', message: string }
  // Anything else: network drop, 5xx, an unexpected status.
    | { kind: 'error', message: string };

interface ErrorBody {
  error?: { message?: string }
}

async function call(init: RequestInit, failureMessage: string, signedOutMessage: string): Promise<DisplayNameOutcome> {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, init);
  }
  catch {
    return { kind: 'error', message: failureMessage };
  }

  const json = await response.json().catch(() => null) as unknown;
  if (response.ok) {
    const stored = (json as { display_name?: unknown } | null)?.display_name;
    return { kind: 'saved', displayName: typeof stored === 'string' ? stored : null };
  }
  if (response.status === 401) {
    return { kind: 'signed-out', message: signedOutMessage };
  }
  if (response.status === 422) {
    return { kind: 'invalid', message: (json as ErrorBody | null)?.error?.message ?? failureMessage };
  }
  return { kind: 'error', message: failureMessage };
}

export async function saveDisplayName(name: string): Promise<DisplayNameOutcome> {
  return call({
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ display_name: name }),
  }, DISPLAY_NAME_COPY.saveFailed, DISPLAY_NAME_COPY.sessionExpired);
}

export async function removeDisplayName(): Promise<DisplayNameOutcome> {
  return call({ method: 'DELETE' }, DISPLAY_NAME_COPY.removeFailed, DISPLAY_NAME_COPY.sessionExpiredRemove);
}
