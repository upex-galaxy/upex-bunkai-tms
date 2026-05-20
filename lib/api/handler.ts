import type { NextRequest } from 'next/server';
import type { z } from 'zod';
import { ApiError, errorResponse } from '@lib/api/error-envelope';
import { logRequest } from '@lib/api/logging';
import { getRequestId, REQUEST_ID_HEADER } from '@lib/api/request-id';
import { NextResponse } from 'next/server';

// Wrap a Next 15 Route Handler so it gets:
//   - x-request-id propagation (inbound header or freshly minted UUID)
//   - structured JSON access log on stdout (Vercel-indexable)
//   - centralised error mapping: ApiError → envelope, ZodError → 422, anything
//     else → 500 with the request_id so users can quote it in a bug report
//
// Handlers stay focused on business logic. They throw ApiError for expected
// failures (validation, auth, conflict) and return a Response/NextResponse for
// success. The wrapper injects `x-request-id` on every response.

export interface ApiHandlerContext {
  requestId: string
}

export type ApiHandler = (
  request: NextRequest,
  ctx: ApiHandlerContext,
) => Promise<Response> | Response;

export function withApiHandler(handler: ApiHandler): (request: NextRequest) => Promise<Response> {
  return async (request: NextRequest): Promise<Response> => {
    const requestId = getRequestId(request.headers);
    const startedAt = Date.now();
    const path = new URL(request.url).pathname;
    const method = request.method;

    try {
      const response = await handler(request, { requestId });
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
