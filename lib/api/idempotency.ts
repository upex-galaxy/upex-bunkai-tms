import { ApiError } from '@lib/api/error-envelope';

// Idempotency-key middleware skeleton. Only the request-side validation lives
// here today; the replay store (`idempotency_keys` table) is Phase F. Routes
// that need to be safe under retries — `POST /api/v1/runs` first — call
// `requireIdempotencyKey()` to enforce the header shape so clients learn the
// contract early.

const HEADER = 'idempotency-key';
const KEY_PATTERN = /^[\w-]{8,128}$/;

export interface IdempotencyResult {
  key: string
  // `false` always until the persistence layer lands. Routes can ignore it for now.
  isReplay: false
}

export function requireIdempotencyKey(headers: Headers): IdempotencyResult {
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
  return { key: raw, isReplay: false };
}

export { HEADER as IDEMPOTENCY_HEADER };
