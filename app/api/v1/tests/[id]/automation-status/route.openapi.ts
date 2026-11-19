import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-227 — GET / PUT /api/v1/tests/{id}/automation-status.

const StatusSchema = z.enum(['manual-only', 'candidate', 'automated']);

const EntrySchema = z
  .object({
    id: z.string().uuid(),
    from_status: StatusSchema,
    to_status: StatusSchema,
    actor_user_id: z.string().uuid().nullable().describe('NULL once the author\'s account is removed; `actor_name` keeps the name.'),
    actor_name: z.string().describe('The author\'s name when the change was made.'),
    changed_at: z.string().datetime({ offset: true }),
  })
  .openapi('TestAutomationStatusEntry');

const ReadSchema = z
  .object({
    test_id: z.string().uuid(),
    automation_status: StatusSchema,
    history: z.array(EntrySchema).describe('Every change, newest first. Empty for a Test whose status never changed.'),
  })
  .openapi('TestAutomationStatus');

const WriteSchema = z
  .object({
    test_id: z.string().uuid(),
    automation_status: StatusSchema,
    changed: z.boolean().describe('false when the requested status was already the current one: no write, no history entry.'),
    entry: EntrySchema.nullable(),
  })
  .openapi('TestAutomationStatusChange');

const BodySchema = z
  .object({ status: StatusSchema })
  .openapi('TestAutomationStatusBody');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

const notFound = { description: 'Test not found / not visible — non-disclosing (`not_found`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } };
const unauthenticated = { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } };
const badRequest = { description: 'Malformed id or body (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } };

registry.registerPath({
  method: 'get',
  path: '/api/v1/tests/{id}/automation-status',
  tags: ['Tests'],
  summary: 'Read a Test\'s automation status and its history',
  description: 'Bearer `atc:read` (or cookie session). Any active member of the Test\'s workspace, viewers included. A new Test, or one whose status never changed, is `manual-only` with an empty history.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  responses: {
    200: { description: 'The current status and every change, newest first.', content: { 'application/json': { schema: ReadSchema } } },
    400: badRequest,
    401: unauthenticated,
    403: { description: 'Missing atc:read scope (`forbidden`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: notFound,
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/tests/{id}/automation-status',
  tags: ['Tests'],
  summary: 'Set a Test\'s automation status',
  description: 'Bearer `atc:write` (or cookie session). Member, admin or owner of the Test\'s workspace. Any status can move to any other; each real change appends one entry (author, time, from, to) to the append-only history, and no endpoint edits or deletes an entry. Sending the current status is a 200 with `changed: false` and no entry. The Test\'s `version` is not bumped: the status is independent of the chain, tags and title.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  request: { body: { required: true, content: { 'application/json': { schema: BodySchema } } } },
  responses: {
    200: { description: 'Status set (or a no-op when unchanged).', content: { 'application/json': { schema: WriteSchema } } },
    400: badRequest,
    401: unauthenticated,
    403: { description: 'Missing atc:write scope, or not a member with write access, viewers included (`forbidden`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: notFound,
    409: { description: 'The Test is archived (`conflict`, `details.reason: test_archived`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Status outside `manual-only`, `candidate`, `automated` (`validation_failed`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
