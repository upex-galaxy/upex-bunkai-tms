import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-443 — one saved view: rename and/or update its filters, or delete it.

const PatchBodySchema = z
  .object({
    name: z.string().optional().describe('New name; same rules as on create. Renaming to its own current name is accepted.'),
    state: z.record(z.string(), z.string()).optional().describe('Replaces the whole stored filter set; same rules as on create.'),
  })
  .openapi('SavedViewPatchBody');

const ItemSchema = z
  .object({
    id: z.string().uuid(),
    project_id: z.string().uuid(),
    view_kind: z.enum(['traceability', 'run_history', 'bugs', 'workbench']),
    name: z.string(),
    state: z.record(z.string(), z.string()),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .openapi('SavedViewItem');

const PatchResponseSchema = z.object({ item: ItemSchema }).openapi('SavedViewPatchResponse');

const params = [
  { name: 'id', in: 'path' as const, required: true, schema: { type: 'string' as const, format: 'uuid' as const } },
  { name: 'viewId', in: 'path' as const, required: true, schema: { type: 'string' as const, format: 'uuid' as const } },
];

registry.registerPath({
  method: 'patch',
  path: '/api/v1/projects/{id}/saved-views/{viewId}',
  tags: ['Saved views'],
  summary: 'Rename a saved view and/or replace the filters it holds',
  description:
    'Send `name`, `state`, or both; the surface cannot be changed. Another member\'s view, another project\'s view and a nonexistent id all return the same 404.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: params,
  request: { body: { required: true, content: { 'application/json': { schema: PatchBodySchema } } } },
  responses: {
    200: { description: 'Saved view updated.', content: { 'application/json': { schema: PatchResponseSchema } } },
    400: { description: 'Malformed id or invalid JSON body.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'No such saved view for the caller in this project.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'The new name is already used on this surface.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed (name length, empty body, invalid or empty state).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/projects/{id}/saved-views/{viewId}',
  tags: ['Saved views'],
  summary: 'Delete a saved view',
  description: 'Removes only the saved view. Another member\'s view and a nonexistent id return the same 404.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: params,
  responses: {
    204: { description: 'Saved view deleted.' },
    400: { description: 'Malformed id.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'No such saved view for the caller in this project.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
