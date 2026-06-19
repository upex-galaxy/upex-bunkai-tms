import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-28 — PATCH /api/v1/tests/{id}/reorder. The body is the complete new chain
// order as `step_ids` (test_steps.id), a permutation of the Test's existing
// steps. Optimistic locking via the custom `X-If-Match` header (BK-96).

const ReorderBodySchema = z
  .object({
    step_ids: z
      .array(z.string().uuid())
      .describe('The COMPLETE new order as test_steps.id values — a permutation of the Test\'s current steps. step_id (not atc_id) is the handle because a chain may repeat an atc_id. Non-empty and free of duplicates.'),
  })
  .openapi('TestReorderBody');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

const VersionParam = {
  name: 'X-If-Match',
  in: 'header' as const,
  required: false,
  schema: { type: 'string' as const },
  description:
    'Current Test version for optimistic locking (lenient — absent skips the guard). A mismatch returns 409 with `details.current_version` and `details.current_chain`. Uses a custom header instead of RFC 7232 `If-Match` because the Vercel edge rewrites `If-Match` to 412 (BK-96); `If-Match` is accepted as a fallback off-Vercel.',
};

registry.registerPath({
  method: 'patch',
  path: '/api/v1/tests/{id}/reorder',
  tags: ['Tests'],
  summary: 'Reorder the ATC chain inside a Test',
  description: 'Bearer `atc:write` (or cookie session). Rearranges the Test\'s ATC chain, preserving the exact step set (no add/remove). Body is the complete new order of `step_ids`. One SECURITY DEFINER RPC enforces the write gate, set equality, optimistic lock, no-op detection, and the atomic position rewrite. Submitting the current order is a 200 no-op — no version bump, no `updated_at` change, no event. A real reorder emits a single `test.reordered` activity-log event with `old_chain` / `new_chain` (atc_id arrays).',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam, VersionParam],
  request: { body: { required: true, content: { 'application/json': { schema: ReorderBodySchema } } } },
  responses: {
    200: { description: 'Reordered (or a no-op when the submitted order is unchanged). Returns the expanded Test.', content: { 'application/json': { schema: z.object({ test: z.unknown() }) } } },
    400: { description: 'Malformed id, body, or X-If-Match (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope or not a workspace member with write access (`forbidden`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Test not found / not visible — non-disclosing (`not_found`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'Version conflict (`conflict`, `details.reason: version_conflict`, with `current_version` + `current_chain`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Empty chain or duplicate step ids (`chain_invalid`), or the submitted set is not the Test\'s steps (`chain_mismatch`, with `details.missing` / `details.extra`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
