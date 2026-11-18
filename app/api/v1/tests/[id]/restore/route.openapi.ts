import { registry, z } from '@lib/openapi/registry';
import { IdParam, TestErrorResponses } from '../route.openapi';

// BK-596 — the restore half of the Test archive contract, BK-571's vocabulary: a
// repeat is a success, `changed` says whether anything happened.
const ArchivedTestSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    archived_at: z.string().datetime({ offset: true }).nullable(),
    archived_by: z.string().uuid().nullable(),
    changed: z.boolean().describe('False when the call changed nothing: the Test was already in that state.'),
  })
  .openapi('ArchivedTest');

registry.registerPath({
  method: 'post',
  path: '/api/v1/tests/{id}/restore',
  tags: ['Tests'],
  summary: 'Restore an archived Test',
  description: 'Bearer `atc:write` (or cookie session). Returns the Test to full use with its chain, tags and Runs untouched, and emits one `test.restored` event. Idempotent: restoring a live Test is a 200 with `changed: false` and no event.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  responses: {
    200: { description: 'Restored, or already live.', content: { 'application/json': { schema: z.object({ test: ArchivedTestSchema }) } } },
    ...TestErrorResponses,
  },
});
