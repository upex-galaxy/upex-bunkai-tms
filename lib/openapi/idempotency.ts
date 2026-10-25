// Published shape of the Idempotency-Key header (ADR-0002), shared by every
// adopting endpoint so the contract is declared once.
export const IdempotencyKeyParam = {
  name: 'Idempotency-Key',
  in: 'header' as const,
  required: true,
  schema: { type: 'string' as const, pattern: '^[\\w-]{8,128}$' },
  description:
    'Required. 8–128 chars, [a-zA-Z0-9_-]. A replay with the same key and payload returns the stored success snapshot; the same key with a different payload returns 409 `conflict`; a concurrent request with the same key while the first is still in flight also returns 409 `conflict`. Window: 24h.',
};

export const IDEMPOTENCY_400 = 'Malformed body or missing/invalid Idempotency-Key (`bad_request`, `idempotency_key_required`, `idempotency_key_invalid`).';
export const IDEMPOTENCY_409 = 'Idempotency-Key reused with a different request payload, or a request with the same key is still in flight (`conflict`).';
