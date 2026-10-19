import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-443 — Saved views: list and create. A saved view names the filters applied
// on one of four surfaces (traceability, run_history, bugs, workbench) of one
// project and is private to the member who saved it.

const SavedViewSchema = z
  .object({
    id: z.string().uuid(),
    project_id: z.string().uuid(),
    view_kind: z.enum(['traceability', 'run_history', 'bugs', 'workbench']),
    name: z.string().describe('1–80 characters (code points), trimmed. Unique per member, project and surface, case-insensitive.'),
    state: z
      .record(z.string(), z.string())
      .describe('The surface\'s own URL query parameters, e.g. { "severity": "P1,P2", "module": "<uuid>" }. Never empty.'),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .openapi('SavedView');

const ListResponseSchema = z
  .object({
    items: z.array(SavedViewSchema).describe('The caller\'s own views for the requested surface, at most 25, ordered by case-folded name then id.'),
  })
  .openapi('SavedViewListResponse');

const CreateBodySchema = z
  .object({
    view_kind: z.enum(['traceability', 'run_history', 'bugs', 'workbench']),
    name: z.string().describe('1–80 characters after trimming; no control characters.'),
    state: z.record(z.string(), z.string()).describe('At least one filter; keys and values must be valid for the surface.'),
  })
  .openapi('SavedViewCreateBody');

const CreateResponseSchema = z.object({ item: SavedViewSchema }).openapi('SavedViewCreateResponse');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/projects/{id}/saved-views',
  tags: ['Saved views'],
  summary: 'List my saved views for one surface of a project',
  description:
    'Returns only the caller\'s own views; another member\'s views are never visible. A project the caller is not a member of returns an empty list.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [
    IdParam,
    {
      name: 'view_kind',
      in: 'query' as const,
      required: true,
      schema: { type: 'string' as const, enum: ['traceability', 'run_history', 'bugs', 'workbench'] },
    },
  ],
  responses: {
    200: { description: 'Saved views listed.', content: { 'application/json': { schema: ListResponseSchema } } },
    400: { description: 'Malformed project id.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:read scope.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'view_kind is missing or unknown.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/projects/{id}/saved-views',
  tags: ['Saved views'],
  summary: 'Save the filters currently applied under a name',
  description:
    'Requires at least one filter. The name is unique per member, project and surface (case-insensitive, trimmed); a duplicate returns 409 saved_view_name_taken. A member may keep up to 25 views per surface and project; the 26th returns 409 saved_view_limit_reached. A project the caller is not a member of returns 404.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  request: {
    body: { required: true, content: { 'application/json': { schema: CreateBodySchema } } },
  },
  responses: {
    201: { description: 'Saved view created.', content: { 'application/json': { schema: CreateResponseSchema } } },
    400: { description: 'Malformed project id or invalid JSON body.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Project not found (or the caller is not a member).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'Name already used on this surface, or the 25-view limit is reached.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed (name length, empty or invalid state, inverted date range, unknown surface).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { SavedViewSchema };
