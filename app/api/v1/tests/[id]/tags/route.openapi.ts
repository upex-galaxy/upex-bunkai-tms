import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-33 — PUT /api/v1/tests/{id}/tags. Replaces the WHOLE tag set on a Test
// (reserved suite tags smoke/sanity/regression + free-text custom tags).
// Optimistic locking via the custom `X-If-Match` header (BK-96).

const TagsBodySchema = z
  .object({
    tags: z
      .array(z.string().max(50))
      .max(20)
      .describe('The COMPLETE new tag set — assigning replaces the whole set; an empty array clears all tags. Reserved tags (smoke/sanity/regression) are lowercased; custom tags preserve casing. Server normalizes (trim, dedupe) and rejects commas, >50 chars, or >20 tags.'),
  })
  .openapi('TestTagsBody');

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
    'Current Test version for optimistic locking (lenient — absent skips the guard). A mismatch returns 409 with `details.current_version` and `details.current_tags`. Uses a custom header instead of RFC 7232 `If-Match` because the Vercel edge rewrites `If-Match` to 412 (BK-96); `If-Match` is accepted as a fallback off-Vercel.',
};

registry.registerPath({
  method: 'put',
  path: '/api/v1/tests/{id}/tags',
  tags: ['Tests'],
  summary: 'Assign / replace the tag set on a Test',
  description: 'Bearer `atc:write` (or cookie session). Replaces the Test\'s entire tag set (PUT semantics — an empty array clears all tags). One SECURITY DEFINER RPC enforces the write gate, normalization (trim, reserved-lowercase, dedupe), shape rules (≤ 20 tags, ≤ 50 chars each, comma-free), optimistic lock, and no-op detection. Submitting the current set is a 200 no-op — no version bump, no `updated_at` change, no event. A real change emits a single `test.tags_changed` activity-log event with `old_tags` / `new_tags`.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam, VersionParam],
  request: { body: { required: true, content: { 'application/json': { schema: TagsBodySchema } } } },
  responses: {
    200: { description: 'Tags set (or a no-op when unchanged). Returns the expanded Test, now carrying `tags`.', content: { 'application/json': { schema: z.object({ test: z.unknown() }) } } },
    400: { description: 'Malformed id, body, or X-If-Match (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope or not a workspace member with write access (`forbidden`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Test not found / not visible — non-disclosing (`not_found`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'Version conflict (`conflict`, `details.reason: version_conflict`, with `current_version` + `current_tags`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'A tag exceeds 50 chars, contains a comma, or more than 20 tags supplied (`validation_failed`, `details.reason: tags_invalid`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
