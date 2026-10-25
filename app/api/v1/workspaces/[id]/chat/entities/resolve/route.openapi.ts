import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-218 — rich entity link resolver + picker search.

const EntityTypeSchema = z.enum(['atc', 'test', 'run']);

const EntityStatusSchema = z
  .object({
    value: z.string(),
    label: z.string(),
    tone: z.enum(['pass', 'fail', 'blocked', 'skipped', 'running', 'neutral']),
  })
  .openapi('ChatEntityStatus');

const EntityCardSchema = z
  .union([
    z.object({
      state: z.literal('ok'),
      type: EntityTypeSchema,
      id: z.string().uuid(),
      code: z.string(),
      title: z.string(),
      status: EntityStatusSchema,
      project_name: z.string(),
      detail: z.string().nullable(),
      href: z.string(),
    }),
    z.object({ state: z.enum(['restricted', 'unavailable']), type: EntityTypeSchema, id: z.string().uuid() }),
  ])
  .openapi('ChatEntityCard');

const workspaceParam = { name: 'id', in: 'path' as const, required: true, schema: { type: 'string' as const, format: 'uuid' as const } };

registry.registerPath({
  method: 'post',
  path: '/api/v1/workspaces/{id}/chat/entities/resolve',
  tags: ['Chat'],
  summary: 'Resolve ATC / Test / Run references into rich-card data',
  description: 'Cookie session or Bearer PAT, no scope. Read-only. Returns the CURRENT state per reference, keyed `{type}:{id}`. An entity outside the channel workspace is `restricted` (no metadata); a missing or archived one is `unavailable`.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [workspaceParam],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            refs: z.array(z.object({ type: EntityTypeSchema, id: z.string().uuid(), project_slug: z.string() })).max(20),
          }),
        },
      },
    },
  },
  responses: {
    200: { description: 'Card data keyed by `{type}:{id}`.', content: { 'application/json': { schema: z.object({ cards: z.record(z.string(), EntityCardSchema) }) } } },
    400: { description: 'Workspace id not a UUID or body not JSON.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Workspace not found or caller is not an active member.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Malformed `refs`.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/workspaces/{id}/chat/entities/search',
  tags: ['Chat'],
  summary: 'Search ATCs, Tests and Runs to insert as a chat reference',
  description: 'Cookie session or Bearer PAT, no scope. Matches title (or a full id / ATC slug); an empty `q` lists the most recent. At most 5 per entity type.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [workspaceParam, { name: 'q', in: 'query' as const, required: false, schema: { type: 'string' as const } }],
  responses: {
    200: {
      description: 'Matching entities.',
      content: {
        'application/json': {
          schema: z.object({
            items: z.array(z.object({
              type: EntityTypeSchema,
              id: z.string().uuid(),
              code: z.string(),
              title: z.string(),
              project_name: z.string(),
              project_slug: z.string(),
            })),
          }),
        },
      },
    },
    400: { description: 'Workspace id not a UUID.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Workspace not found or caller is not an active member.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
