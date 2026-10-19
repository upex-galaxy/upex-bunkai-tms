import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';
import { RunStepAttachmentSchema } from '../steps/[stepId]/attachments/route.openapi';

// BK-593 - list every committed evidence image of a Run.

registry.registerPath({
  method: 'get',
  path: '/api/v1/runs/{id}/attachments',
  tags: ['Runs'],
  summary: 'List the evidence images of a Run',
  description: 'Bearer `atc:read` (or cookie session); any member of the owning workspace. Committed attachments of every step, oldest first. Metadata only: no storage path and no URL; open an image through `.../attachments/{attachmentId}/content`. A pending upload is never listed. Kept separate from `GET /runs/{id}` on purpose so abort, finish, mark and compare responses do not change.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
  responses: {
    200: { description: 'The committed attachments.', content: { 'application/json': { schema: z.object({ attachments: z.array(RunStepAttachmentSchema) }) } } },
    400: { description: 'Malformed run id (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:read scope (`forbidden`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Run not found, or in a workspace the caller is not a member of (non-disclosing).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
