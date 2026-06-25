import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';
import { AtcSchema } from '../route.openapi';

const StepInput = z.object({
  position: z.number().int().describe('Integer, strictly increasing from 1.'),
  content: z.string().min(1).max(2048),
  input_data: z.string().max(2048).nullable().optional(),
  expected: z.string().max(2048).nullable().optional(),
});

const AssertionInput = z.object({
  content: z.string().min(1).max(2048),
});

const UpdateBodySchema = z
  .object({
    title: z.string().min(3).max(200),
    layer: z.enum(['UI', 'API', 'Unit']),
    tags: z.array(z.string()).max(10).optional(),
    steps: z.array(StepInput).min(1),
    assertions: z.array(AssertionInput).optional(),
    acceptance_criterion_ids: z.array(z.string().uuid()).min(1),
  })
  .openapi('AtcUpdateBody');

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
    'Current version for optimistic locking. A mismatch returns 409. Uses a custom header instead of RFC 7232 `If-Match` because the Vercel edge intercepts `If-Match` and rewrites the response to 412 (BK-96); `If-Match` is still accepted as a fallback on non-Vercel deployments.',
};

registry.registerPath({
  method: 'patch',
  path: '/api/v1/atcs/{id}',
  tags: ['ATCs'],
  summary: 'Edit an ATC (full replace of steps and assertions)',
  description: 'Bearer `atc:write` (or cookie session). PUT-style full replace — omitted children are cleared. An empty body is a 200 no-op (no version bump, no event). `user_story_id`, `module_id`, and `slug` are immutable. BK-21: edits propagate automatically to every Test that chains the ATC (Tests reference it by id, never copy its content), visible on the Test\'s next read. The response reports `affected_test_count` (DISTINCT chaining Tests — a Test that chains the ATC at multiple positions counts once; 0 for a no-op). Emits an `atc.updated` event carrying the in-transaction `affected_test_ids`.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam, VersionParam],
  request: { body: { required: false, content: { 'application/json': { schema: UpdateBodySchema } } } },
  responses: {
    200: {
      description: 'ATC updated (or no-op for an empty body).',
      content: {
        'application/json': {
          schema: z.object({
            atc: AtcSchema,
            version: z.number().int().describe('The ATC version after the edit (unchanged on a no-op).'),
            affected_test_count: z.number().int().describe('DISTINCT Tests that chain this ATC and now reflect the edit. 0 for a no-op.'),
          }),
        },
      },
    },
    400: { description: 'Malformed id, body, or X-If-Match.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope or not a member.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'ATC not found.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'Version conflict (code `conflict`, `details.reason: version_conflict`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed (`steps_position_invalid`, `ac_outside_user_story`, title/limits).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
