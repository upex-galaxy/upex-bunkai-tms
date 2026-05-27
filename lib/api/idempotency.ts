import { ApiError } from '@lib/api/error-envelope';
import { createAdminClient } from '@lib/supabase/admin';

// Idempotency-Key middleware. Backs `Idempotency-Key` header semantics with
// the `idempotency_keys` table (migration 0009). Lifecycle:
//
//   1. Handler calls `beginIdempotentRequest({ headers, userId, endpoint,
//      requestPayload })`. The middleware computes a SHA-256 of the payload
//      and looks up `(user_id, endpoint, key)`.
//      - row found + same hash + succeeded → returns `isReplay=true` with the
//        stored response snapshot. Handler short-circuits.
//      - row found + different hash → 409 conflict (same key used for two
//        different payloads — client bug).
//      - no row → inserts a `pending` row, returns `isReplay=false`.
//   2. On success, handler calls `recordIdempotencyResult(token, snapshot,
//      status)` which flips the row to `succeeded` and stores the response.
//   3. On failure, handler calls `discardIdempotencyResult(token)` which
//      marks the row `failed` so the same key may be reused with a clean
//      payload after the client fixes the error.
//
// Service-role client is used throughout so RLS does not block writes from
// inside `withApiHandler` (which runs with the user's session client).

const HEADER = 'idempotency-key';
const KEY_PATTERN = /^[\w-]{8,128}$/;

export interface BeginIdempotentRequestArgs {
  headers: Headers
  userId: string
  endpoint: string
  workspaceId?: string | null
  requestPayload: unknown
}

export type BeginIdempotentRequestResult
  = | {
    isReplay: true
    snapshot: unknown
    status: number
    token: IdempotencyToken
  }
  | {
    isReplay: false
    token: IdempotencyToken
  };

export interface IdempotencyToken {
  key: string
  userId: string
  endpoint: string
  rowId: string
}

export async function beginIdempotentRequest(
  args: BeginIdempotentRequestArgs,
): Promise<BeginIdempotentRequestResult> {
  const key = readKey(args.headers);
  const requestHash = await sha256Hex(stableStringify(args.requestPayload));
  const admin = createAdminClient();

  const { data: existing, error: lookupError } = await admin
    .from('idempotency_keys')
    .select('id, request_hash, status, response_snapshot, response_status')
    .eq('user_id', args.userId)
    .eq('endpoint', args.endpoint)
    .eq('key', key)
    .maybeSingle();

  if (lookupError) {
    throw new ApiError('internal_error', 'Idempotency lookup failed.');
  }

  if (existing) {
    if (existing.request_hash !== requestHash) {
      throw new ApiError(
        'conflict',
        'Idempotency-Key reused with a different request payload.',
      );
    }
    if (existing.status === 'succeeded') {
      return {
        isReplay: true,
        snapshot: existing.response_snapshot,
        status: existing.response_status ?? 200,
        token: {
          key,
          userId: args.userId,
          endpoint: args.endpoint,
          rowId: existing.id,
        },
      };
    }
    // pending or failed → caller may proceed. We do not delete failed rows so
    // the next attempt with the same key+hash continues the journey.
    return {
      isReplay: false,
      token: { key, userId: args.userId, endpoint: args.endpoint, rowId: existing.id },
    };
  }

  const { data: inserted, error: insertError } = await admin
    .from('idempotency_keys')
    .insert({
      user_id: args.userId,
      endpoint: args.endpoint,
      key,
      request_hash: requestHash,
      status: 'pending',
      workspace_id: args.workspaceId ?? null,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    throw new ApiError('internal_error', 'Idempotency insert failed.');
  }

  return {
    isReplay: false,
    token: { key, userId: args.userId, endpoint: args.endpoint, rowId: inserted.id },
  };
}

export async function recordIdempotencyResult(
  token: IdempotencyToken,
  snapshot: unknown,
  status: number,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from('idempotency_keys')
    .update({
      status: 'succeeded',
      response_snapshot: snapshot as never,
      response_status: status,
    })
    .eq('id', token.rowId);
  if (error) {
    throw new ApiError('internal_error', 'Idempotency commit failed.');
  }
}

export async function discardIdempotencyResult(token: IdempotencyToken): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from('idempotency_keys')
    .update({ status: 'failed' })
    .eq('id', token.rowId);
}

// Back-compat thin wrapper kept so existing route shells that imported the
// pre-0009 API continue to compile.
export interface IdempotencyResult {
  key: string
  isReplay: false
}

export function requireIdempotencyKey(headers: Headers): IdempotencyResult {
  return { key: readKey(headers), isReplay: false };
}

function readKey(headers: Headers): string {
  const raw = headers.get(HEADER);
  if (!raw) {
    throw new ApiError('idempotency_key_required', `Missing ${HEADER} header.`);
  }
  if (!KEY_PATTERN.test(raw)) {
    throw new ApiError(
      'idempotency_key_invalid',
      `${HEADER} must be 8–128 chars, [a-zA-Z0-9_-].`,
    );
  }
  return raw;
}

function stableStringify(value: unknown): string {
  // Deterministic JSON stringify with sorted keys so the same logical payload
  // produces the same hash regardless of property order. Recurses into nested
  // objects; arrays preserve order.
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export { HEADER as IDEMPOTENCY_HEADER };
