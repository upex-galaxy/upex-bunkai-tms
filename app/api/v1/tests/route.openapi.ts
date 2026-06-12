import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const TestStepSchema = z
  .object({
    position: z.number().int().describe('1-based position in the chain; follows `atc_ids` array order verbatim.'),
    atc_id: z.string().uuid().describe('Chained ATC reference — a reference, never a copy.'),
  })
  .openapi('TestStep');

const TestSchema = z
  .object({
    id: z.string().uuid(),
    workspace_id: z.string().uuid(),
    title: z.string(),
    created_by: z.string().uuid(),
    created_at: z.string().datetime(),
    steps: z.array(TestStepSchema),
  })
  .openapi('Test');

const CreateBodySchema = z
  .object({
    title: z.string().min(1).max(200).describe('Trimmed before validation; 1–200 chars after trim.'),
    atc_ids: z
      .array(z.string().uuid())
      .min(1)
      .describe('Ordered chain, ≥1. Duplicates are legal — a chain is a sequence, not a set. No server-side length cap.'),
    workspace_id: z
      .string()
      .uuid()
      .optional()
      .describe('Required for token-authenticated (Bearer) callers. Cookie sessions default to the active workspace at the submit instant.'),
  })
  .openapi('TestCreateBody');

const IdempotencyKeyParam = {
  name: 'Idempotency-Key',
  in: 'header' as const,
  required: true,
  schema: { type: 'string' as const, pattern: '^[\\w-]{8,128}$' },
  description:
    'Required. 8–128 chars, [a-zA-Z0-9_-]. A replay with the same key and payload returns the stored 201 snapshot; the same key with a different payload returns 409 `conflict`; a concurrent request with the same key while the first is still in flight also returns 409 `conflict`. Window: 24h.',
};

registry.registerPath({
  method: 'post',
  path: '/api/v1/tests',
  tags: ['Tests'],
  summary: 'Create a Test by chaining ATCs',
  description: 'Bearer `atc:write` (or cookie session). Transactional create across tests + test_steps + activity log via one SECURITY DEFINER RPC. The Test binds to the workspace resolved at the submit instant: explicit `workspace_id` wins, else the cookie session\'s active workspace; token-authenticated callers must send `workspace_id`. Chain order follows the `atc_ids` array; duplicates are preserved.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdempotencyKeyParam],
  request: { body: { required: true, content: { 'application/json': { schema: CreateBodySchema } } } },
  responses: {
    201: { description: 'Test created.', content: { 'application/json': { schema: z.object({ test: TestSchema }) } } },
    400: { description: 'Malformed body or missing/invalid Idempotency-Key (`bad_request`, `idempotency_key_required`, `idempotency_key_invalid`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope or not a workspace member with write access.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'One or more selected ATCs are not available in this workspace (`not_found`). Foreign-workspace and nonexistent ids return byte-identical responses — no existence disclosure.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'Idempotency-Key reused with a different request payload, or a request with the same key is still in flight (`conflict`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed (`validation_failed` for title/uuid/workspace_id rules, `chain_empty` when the chain references no ATC).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { TestSchema };
