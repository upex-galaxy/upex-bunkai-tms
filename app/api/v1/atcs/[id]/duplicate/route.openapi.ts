import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';
import { AtcSchema } from '../../route.openapi';

// BK-23 — optional title only; the server reads the source ATC for everything
// else. An empty body defaults the copy title to `<source> (copy)`. Field is
// `new_title` (BK-184: matches FR-014's documented request contract — the
// implementation had drifted to `title`).
const DuplicateBodySchema = z
  .object({
    new_title: z.string().min(3).max(200).optional().describe('Optional title for the copy. Omit to default to `<source> (copy)`.'),
  })
  .openapi('AtcDuplicateBody');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
  description: 'The source ATC to duplicate.',
};

registry.registerPath({
  method: 'post',
  path: '/api/v1/atcs/{id}/duplicate',
  tags: ['ATCs'],
  summary: 'Duplicate an ATC (deep-copy steps, assertions, AC bindings)',
  description: 'Bearer `atc:write` (or cookie session). Deep-copies the source ATC into a NEW ATC in the same project — every step and assertion (in order) plus the AC bindings — with a fresh slug, `version = 1`, and an independent set of child rows (editing the copy never changes the source). The title defaults to `<source> (copy)` unless the optional `new_title` field is supplied. The field is named `new_title`, NOT `title` — an unknown `title` key is stripped silently by the schema, so a request sending it succeeds and the copy quietly keeps the default `(copy)` name. Emits an `atc.created` event.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  request: { body: { required: false, content: { 'application/json': { schema: DuplicateBodySchema } } } },
  responses: {
    201: { description: 'Duplicate created.', content: { 'application/json': { schema: z.object({ atc: AtcSchema }) } } },
    400: { description: 'Malformed id or body.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope or not a member.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Source ATC not found.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'Slug collision (`slug_collision`). Retry.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed (`title_too_long` when the computed `(copy)` title exceeds 200 chars, or title/limits).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
