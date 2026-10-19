import type { TrackerFormValues } from './form-state';
import { toRequestBody } from './form-state';

// BK-371 — the screen's two calls (save, run check) and the translation of every
// answer into a closed outcome the card can render. Kept out of the component so
// the mapping (409 confirmation, 422 reasons, 403 demotion, 429 in flight) is
// testable with an injected `fetch`. The server copy is shown verbatim: it is the
// frozen text.

export interface SavedSettings {
  destinationKey: string
  issueTypeName: string
  enabled: boolean
}

export type SaveOutcome
  = | { kind: 'saved', settings: SavedSettings, requeued: number }
    | { kind: 'confirm', queueCount: number }
    | { kind: 'check_failed', message: string }
    | { kind: 'invalid', reason: string, message: string }
    | { kind: 'forbidden', message: string }
    | { kind: 'error', message: string };

export type CheckOutcome
  = | { kind: 'result', ok: boolean, message: string | null }
    | { kind: 'busy', message: string }
    | { kind: 'invalid', reason: string, message: string }
    | { kind: 'forbidden', message: string }
    | { kind: 'error', message: string };

interface ErrorBody {
  error?: { code?: string, message?: string, details?: { reason?: string, queue_count?: number, check?: { message?: string } } }
}

const NETWORK_MESSAGE = 'Could not reach Bunkai. Check your connection and try again.';
const GENERIC_MESSAGE = 'Something went wrong. Try again.';

type FetchLike = typeof fetch;

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function trackerUrl(projectId: string, suffix = ''): string {
  return `/api/v1/projects/${encodeURIComponent(projectId)}/tracker-settings${suffix}`;
}

export async function saveTrackerSettings(
  args: { projectId: string, values: TrackerFormValues, confirmQueueCount?: number, fetchImpl?: FetchLike },
): Promise<SaveOutcome> {
  const doFetch = args.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await doFetch(trackerUrl(args.projectId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toRequestBody(args.values, args.confirmQueueCount)),
    });
  }
  catch {
    return { kind: 'error', message: NETWORK_MESSAGE };
  }

  const json = await readJson(response);
  if (response.ok) {
    const body = json as { tracker_settings?: { destination_project_key?: string | null, issue_type_name?: string, enabled?: boolean }, requeued?: number } | null;
    const stored = body?.tracker_settings;
    if (!stored || typeof stored.destination_project_key !== 'string') {
      return { kind: 'error', message: GENERIC_MESSAGE };
    }
    return {
      kind: 'saved',
      settings: {
        destinationKey: stored.destination_project_key,
        issueTypeName: stored.issue_type_name ?? args.values.issueTypeName,
        enabled: stored.enabled === true,
      },
      requeued: typeof body?.requeued === 'number' ? body.requeued : 0,
    };
  }

  const error = (json as ErrorBody | null)?.error;
  const message = error?.message ?? GENERIC_MESSAGE;
  const reason = error?.details?.reason;

  if (response.status === 409 && reason === 'queue_confirmation_required' && typeof error?.details?.queue_count === 'number') {
    return { kind: 'confirm', queueCount: error.details.queue_count };
  }
  if (response.status === 422 && reason === 'connection_check_failed') {
    return { kind: 'check_failed', message: error?.details?.check?.message ?? message };
  }
  if (response.status === 422 && reason !== undefined) {
    return { kind: 'invalid', reason, message };
  }
  if (response.status === 403) {
    return { kind: 'forbidden', message };
  }
  return { kind: 'error', message };
}

export async function runTrackerCheck(
  args: { projectId: string, values: TrackerFormValues, fetchImpl?: FetchLike },
): Promise<CheckOutcome> {
  const doFetch = args.fetchImpl ?? fetch;
  const { destination_project_key, issue_type_name } = toRequestBody(args.values) as { destination_project_key: string, issue_type_name: string };
  let response: Response;
  try {
    response = await doFetch(trackerUrl(args.projectId, '/check'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destination_project_key, issue_type_name }),
    });
  }
  catch {
    return { kind: 'error', message: NETWORK_MESSAGE };
  }

  const json = await readJson(response);
  if (response.ok) {
    const body = json as { ok?: boolean, reason?: { message?: string } | null } | null;
    if (typeof body?.ok !== 'boolean') {
      return { kind: 'error', message: GENERIC_MESSAGE };
    }
    return { kind: 'result', ok: body.ok, message: body.reason?.message ?? null };
  }

  const error = (json as ErrorBody | null)?.error;
  const message = error?.message ?? GENERIC_MESSAGE;
  const reason = error?.details?.reason;
  if (response.status === 429) {
    return { kind: 'busy', message };
  }
  if (response.status === 422 && reason !== undefined) {
    return { kind: 'invalid', reason, message };
  }
  if (response.status === 403) {
    return { kind: 'forbidden', message };
  }
  return { kind: 'error', message };
}
