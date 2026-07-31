import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';
import { BugSchema } from '../../../bugs/route.openapi';

// BK-40 — bare, unfiltered, newest-first list of a project's bugs.
// BK-41/BK-42 extend this route additively with filters, counts, and a
// heatmap; this Slice ships only the bare list.

const ListResponseSchema = z
  .object({
    items: z.array(BugSchema).describe('Newest first (created_at desc).'),
  })
  .openapi('BugListResponse');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/projects/{id}/bugs',
  tags: ['Bugs'],
  summary: 'List a project\'s bugs, newest first',
  description: 'Bare, unfiltered list (no query params yet — BK-41/BK-42 extend this route additively). Visible to any active workspace member (viewers included). Non-disclosure: a missing, non-visible, or foreign-workspace Project all return the same 404.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  responses: {
    200: { description: 'Bugs listed.', content: { 'application/json': { schema: ListResponseSchema } } },
    400: { description: 'Malformed project id.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Project not found (non-disclosing).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
