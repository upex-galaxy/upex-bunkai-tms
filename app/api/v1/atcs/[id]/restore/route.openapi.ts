import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-571 — the restore half of the archive contract. BK-601 and BK-596 reuse its
// vocabulary: a repeat is a success, `changed` says whether anything happened.
const RestoredAtcSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    archived_at: z.string().datetime({ offset: true }).nullable().describe('Null once back in circulation. Under an archived parent this is the parent\'s timestamp.'),
    archived_by: z.string().uuid().nullable(),
    held_by_parent: z.enum(['module', 'user_story']).nullable().describe('The archived parent that keeps this ATC out of circulation, if any. The ATC returns when that parent is restored.'),
    changed: z.boolean().describe('False when the call changed nothing: the ATC was live, or its only archive is its parent\'s.'),
  })
  .openapi('RestoredAtc');

registry.registerPath({
  method: 'post',
  path: '/api/v1/atcs/{id}/restore',
  tags: ['ATCs'],
  summary: 'Restore an archived ATC',
  description: 'Bearer `atc:write` (or cookie session). Clears the ATC\'s own archived state and emits one `atc.restored` event per real change. Idempotent: restoring a live ATC, or one whose only archive is its parent\'s, is a 200 with `changed: false` and no event. An ATC under an archived Module or User Story stays out of circulation with that parent and comes back when the parent is restored; a restore never restores a parent.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [{
    name: 'id',
    in: 'path',
    required: true,
    schema: { type: 'string', format: 'uuid' },
    description: 'The ATC to restore.',
  }],
  responses: {
    200: { description: 'Restored, or already in that state.', content: { 'application/json': { schema: z.object({ atc: RestoredAtcSchema }) } } },
    400: { description: 'Malformed id.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope, or not a writer of the owning workspace.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'ATC not found.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
