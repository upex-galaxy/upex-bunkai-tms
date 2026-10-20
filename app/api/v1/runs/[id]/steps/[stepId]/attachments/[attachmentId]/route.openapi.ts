import { ErrorEnvelopeSchema, registry } from '@lib/openapi/registry';

// BK-593 - remove one evidence image.

registry.registerPath({
  method: 'delete',
  path: '/api/v1/runs/{id}/steps/{stepId}/attachments/{attachmentId}',
  tags: ['Runs'],
  summary: 'Remove an evidence image from a run step',
  description: 'Bearer `run:execute` (or cookie session). Only the person who attached the image can remove it (an admin or owner cannot remove somebody else\'s), and only while the Run is `running`: once it is finished or aborted its evidence is fixed. The check runs under the Run row lock, so a removal racing finish or abort has exactly one winner. Works on a still-`pending` upload too (a cancelled upload). The stored object is deleted afterwards on a best-effort basis and retried by the daily cleanup sweep.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [
    { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
    { name: 'stepId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
    { name: 'attachmentId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
  ],
  responses: {
    204: { description: 'Removed.' },
    400: { description: 'Malformed ids (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing run:execute scope, a viewer, or somebody else\'s attachment (`forbidden`, reason `not_uploader`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Attachment not found under these ids, or in a workspace the caller is not a member of (non-disclosing).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'The Run is already closed (`conflict`, reason `run_not_open`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
