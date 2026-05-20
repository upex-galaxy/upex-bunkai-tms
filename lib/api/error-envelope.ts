import { NextResponse } from 'next/server';

// Canonical API error envelope. Every error response from `app/api/v1/*` returns
// this shape so clients (CLI, AI agents, frontend) can branch on `error.code`
// rather than parsing `error.message`.

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode
    message: string
    details?: unknown
    request_id?: string
  }
}

export const API_ERROR_CODES = {
  // 4xx
  BAD_REQUEST: 'bad_request',
  VALIDATION_FAILED: 'validation_failed',
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  METHOD_NOT_ALLOWED: 'method_not_allowed',
  CONFLICT: 'conflict',
  IDEMPOTENCY_KEY_REQUIRED: 'idempotency_key_required',
  IDEMPOTENCY_KEY_INVALID: 'idempotency_key_invalid',
  RATE_LIMITED: 'rate_limited',

  // 5xx
  INTERNAL_ERROR: 'internal_error',
  UPSTREAM_ERROR: 'upstream_error',
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

const DEFAULT_STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400,
  validation_failed: 422,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  method_not_allowed: 405,
  conflict: 409,
  idempotency_key_required: 400,
  idempotency_key_invalid: 400,
  rate_limited: 429,
  internal_error: 500,
  upstream_error: 502,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ApiErrorCode, message: string, opts: { status?: number, details?: unknown } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = opts.status ?? DEFAULT_STATUS[code];
    this.details = opts.details;
  }
}

export function errorResponse(
  err: ApiError,
  opts: { requestId?: string } = {},
): NextResponse<ApiErrorBody> {
  const body: ApiErrorBody = {
    error: {
      code: err.code,
      message: err.message,
      ...(err.details !== undefined ? { details: err.details } : {}),
      ...(opts.requestId ? { request_id: opts.requestId } : {}),
    },
  };
  return NextResponse.json(body, { status: err.status });
}
