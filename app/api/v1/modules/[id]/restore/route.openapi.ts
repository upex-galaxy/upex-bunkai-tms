import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-601 — reuses the BK-571 vocabulary: a repeat is a success, `changed` says
// whether anything happened. A Module under an archived parent is a refusal here,
// where an ATC under one is a 200 with `held_by_parent`: a Module cannot wait inside
// its parent's cascade, because an active Module under an archived one reaches nobody.
const RestoredModuleSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    changed: z.boolean().describe('False when the call changed nothing: the Module was already active.'),
    modules: z.number().int().describe('Modules back, the restored Module included. Zero when nothing changed.'),
    user_stories: z.number().int(),
    acceptance_criteria: z.number().int(),
    atcs: z.number().int(),
  })
  .openapi('RestoredModule');

registry.registerPath({
  method: 'post',
  path: '/api/v1/modules/{id}/restore',
  tags: ['Modules'],
  summary: 'Restore an archived module',
  description: 'Bearer `atc:write` (or cookie session). Brings back exactly what this Module\'s own archive took: its descendant Modules, their User Stories, those Stories\' Acceptance Criteria and the ATCs anchored to any of them. Rows archived on their own before it stay archived, and an ATC whose other parent is still archived stays with that parent. All or nothing, with one `module.restored` event per real change. Idempotent: restoring an active Module is a 200 with `changed: false` and no event.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [{
    name: 'id',
    in: 'path',
    required: true,
    schema: { type: 'string', format: 'uuid' },
    description: 'The Module to restore.',
  }],
  responses: {
    200: { description: 'Restored, or already active.', content: { 'application/json': { schema: z.object({ restored: RestoredModuleSchema }) } } },
    400: { description: 'Malformed id.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope, or a read-only member of the workspace.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Module not found, or out of reach.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'Refused, nothing written. `details.reason`: `ancestor_archived` (with `ancestor_id`, `ancestor_name`), `depth_exceeded`, `name_collision` (with `module_name`) or `story_key_collision` (with `external_id`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
