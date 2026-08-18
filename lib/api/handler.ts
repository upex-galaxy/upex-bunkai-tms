import type { Capability } from '@lib/api/capabilities';
import type { Principal } from '@lib/api/principal';
import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import type { z } from 'zod';
import { ApiError, errorResponse } from '@lib/api/error-envelope';
import { logRequest } from '@lib/api/logging';
import { requireCapability, resolveIdentity } from '@lib/api/principal';
import { getRequestId, REQUEST_ID_HEADER } from '@lib/api/request-id';
import { NextResponse } from 'next/server';

// Wrap a Next 15 Route Handler so it gets:
//   - x-request-id propagation (inbound header or freshly minted UUID)
//   - structured JSON access log on stdout (Vercel-indexable)
//   - centralised error mapping: ApiError → envelope, ZodError → 422, anything
//     else → 500 with the request_id so users can quote it in a bug report
//   - unified authentication (ADR-0001): pass `{ auth: 'required' }` and the
//     wrapper resolves the caller (cookie OR Bearer PAT) into a single
//     `Principal` injected on the context, enforcing any required capabilities
//     BEFORE the handler runs. This is the single gateway that makes the
//     cookie/PAT parity guarantee structural instead of per-route.
//
// Handlers stay focused on business logic. They throw ApiError for expected
// failures (validation, auth, conflict) and return a Response/NextResponse for
// success. The wrapper injects `x-request-id` on every response.

export interface ApiHandlerContext {
  requestId: string
  // Present for every route except those marked `auth: 'public'`. Use
  // `getAuth(ctx)` from an authed handler to read these without null checks.
  principal?: Principal
  db?: SupabaseClient<Database>
}

export type ApiHandler = (
  request: NextRequest,
  ctx: ApiHandlerContext,
) => Promise<Response> | Response;

// A `requires` list that the compiler refuses to leave empty. Without this,
// `requires: []` type-checks and silently performs zero capability checks —
// the same fail-open the mandatory posture exists to close.
type NonEmpty<T> = readonly [T, ...T[]];

// EVERY route states its posture. There is no default, so a new route handler
// cannot compile without choosing one of these four — which is the durable part
// of this contract: forgetting a capability is a red `types:check` locally, not
// a permissive endpoint in production.
export type WithApiHandlerOptions
  // No auth resolution at all. Health, the API index, sign-in/sign-up/magic-link.
  = | { auth: 'public' }
  // Authenticated, and a Bearer PAT is structurally rejected by the gateway.
  // For operations a token must never perform on its own behalf — chiefly token
  // issuance and revocation (ADR-0001's "a PAT must not mint a PAT" exception).
  // `why` is surfaced to the caller as the 403 message.
    | { auth: 'cookie-only', why: string }
  // Authenticated, no capability required. The escape hatch — deliberately
  // costs a sentence, so the no-capability set stays greppable and enumerable.
    | { auth: 'authenticated', why: string }
  // Authenticated, and the caller must hold every listed capability.
    | { auth: 'required', requires: NonEmpty<Capability> };

// Read the authenticated context from a handler that opted into `auth:
// 'required'`. Throws if called from a route that did not — a programming error,
// not a runtime auth failure.
export function getAuth(ctx: ApiHandlerContext): { principal: Principal, db: SupabaseClient<Database> } {
  if (!ctx.principal || !ctx.db) {
    throw new ApiError('internal_error', 'Auth context missing — route did not opt into auth.');
  }
  return { principal: ctx.principal, db: ctx.db };
}

export function withApiHandler(
  handler: ApiHandler,
  options: WithApiHandlerOptions,
): (request: NextRequest) => Promise<Response> {
  return async (request: NextRequest): Promise<Response> => {
    const requestId = getRequestId(request.headers);
    const startedAt = Date.now();
    const path = new URL(request.url).pathname;
    const method = request.method;

    try {
      const ctx: ApiHandlerContext = { requestId };
      // Secure by default: anything not explicitly marked `auth: 'public'`
      // requires an authenticated principal.
      if (options.auth !== 'public') {
        const principal = await resolveIdentity(request);
        if (options.auth === 'cookie-only' && principal.via === 'bearer') {
          throw new ApiError('forbidden', options.why);
        }
        if (options.auth === 'required') {
          for (const capability of options.requires) {
            requireCapability(principal, capability);
          }
        }
        ctx.principal = principal;
        ctx.db = principal.db;
      }
      const response = await handler(request, ctx);
      response.headers.set(REQUEST_ID_HEADER, requestId);
      logRequest('info', {
        request_id: requestId,
        method,
        path,
        status: response.status,
        duration_ms: Date.now() - startedAt,
      });
      return response;
    }
    catch (raw) {
      const apiError = toApiError(raw);
      const response = errorResponse(apiError, { requestId });
      response.headers.set(REQUEST_ID_HEADER, requestId);
      logRequest(apiError.status >= 500 ? 'error' : 'warn', {
        request_id: requestId,
        method,
        path,
        status: apiError.status,
        duration_ms: Date.now() - startedAt,
        error_code: apiError.code,
        message: apiError.message,
      });
      return response;
    }
  };
}

function toApiError(raw: unknown): ApiError {
  if (raw instanceof ApiError) {
    return raw;
  }
  if (isZodError(raw)) {
    return new ApiError('validation_failed', 'Request body failed validation.', {
      details: raw.issues,
    });
  }
  if (raw instanceof Error) {
    return new ApiError('internal_error', raw.message);
  }
  return new ApiError('internal_error', 'Unknown error.');
}

function isZodError(raw: unknown): raw is z.ZodError {
  return (
    typeof raw === 'object'
    && raw !== null
    && (raw as { name?: string }).name === 'ZodError'
    && Array.isArray((raw as { issues?: unknown }).issues)
  );
}

// Convenience helper for success bodies. Routes can also return NextResponse
// directly when they need to set custom headers.
export function jsonResponse<T>(body: T, init: { status?: number, headers?: HeadersInit } = {}): NextResponse<T> {
  return NextResponse.json(body, init);
}
