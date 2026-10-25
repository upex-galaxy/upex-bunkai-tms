import { jsonResponse } from '@lib/api/handler';
import { beginIdempotentRequest, discardIdempotencyResult, recordIdempotencyResult } from '@lib/api/idempotency';

// Shared route-side wiring for the BK-037 create endpoints (ADR-0002). The
// helper in `idempotency.ts` owns replay / hash / conflict rules; this wrapper
// only encodes the begin -> write -> record|discard lifecycle once so the five
// routes cannot drift from the two original adopters.

export interface IdempotentCreateArgs<T> {
  request: Request
  userId: string
  endpoint: string
  workspaceId?: string | null
  // Everything that identifies the logical request, including path/scoping ids,
  // so the same key reused in another parent scope is a payload mismatch.
  payload: unknown
  status?: number
  execute: () => Promise<T>
}

export async function runIdempotentCreate<T>(args: IdempotentCreateArgs<T>): Promise<Response> {
  const status = args.status ?? 201;
  const begin = await beginIdempotentRequest({
    headers: args.request.headers,
    userId: args.userId,
    endpoint: args.endpoint,
    workspaceId: args.workspaceId ?? null,
    requestPayload: args.payload,
  });
  if (begin.isReplay) {
    return jsonResponse(begin.snapshot, { status: begin.status });
  }

  let responseBody: T;
  try {
    responseBody = await args.execute();
  }
  catch (raw) {
    await discardIdempotencyResult(begin.token);
    throw raw;
  }

  // The record exists from here on: a snapshot-store failure must neither
  // discard the key nor fail the request.
  try {
    await recordIdempotencyResult(begin.token, responseBody, status);
  }
  catch (recordError) {
    console.error(`idempotency snapshot store failed for ${args.endpoint}`, recordError);
  }
  return jsonResponse(responseBody, { status });
}
