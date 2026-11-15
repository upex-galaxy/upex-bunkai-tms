import { ErrorEnvelopeSchema, registry } from '@lib/openapi/registry';

// BK-594 - discard one defect evidence upload that was never filed.

registry.registerPath({
  method: 'delete',
  path: '/api/v1/projects/{id}/bug-evidence/{attachmentId}',
  tags: ['Bugs'],
  summary: 'Discard an image upload that was never filed',
  description: 'Bearer `atc:write` (or cookie session); the uploader only. Works on a `pending` or a committed upload that no defect has claimed. Evidence on a filed defect is fixed at filing and cannot be removed (409). The stored object is deleted afterwards on a best-effort basis and retried by the daily cleanup sweep.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [
    { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Project id.' },
    { name: 'attachmentId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
  ],
  responses: {
    204: { description: 'Discarded.' },
    400: { description: 'Malformed ids (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope, or no longer a writer (`forbidden`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Upload not found under this Project, or not the caller\'s (non-disclosing).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'A filed defect already holds this image (`conflict`, reason `evidence_frozen`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
