import { ErrorEnvelopeSchema } from '@lib/openapi/registry';

// BK-231 — shared pieces of the billing routes' OpenAPI registrations.
export const WorkspaceIdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

export const IdempotencyKeyParam = {
  name: 'Idempotency-Key',
  in: 'header' as const,
  required: true,
  schema: { type: 'string' as const, pattern: '^[\\w-]{8,128}$' },
  description: 'Required. 8-128 chars, [a-zA-Z0-9_-]. A replay with the same key returns the stored response; the same key with a different payload returns 409 `conflict`.',
};

export function errorResponse(description: string) {
  return { description, content: { 'application/json': { schema: ErrorEnvelopeSchema } } };
}
